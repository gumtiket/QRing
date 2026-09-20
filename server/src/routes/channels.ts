import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { CreateTopicCommand, SubscribeCommand, PublishCommand } from "@aws-sdk/client-sns";
import { db } from "../db/client";
import { channels, notifications, notificationActions } from "../db/schema";
import { generateChannelCode } from "../lib/channelCode";
import { generateAdminToken, hashToken } from "../lib/token";
import { snsClient } from "../aws/sns";
import { BASE_URL, WEBPUSH_DISPATCH_QUEUE_ARN } from "../config";

export const channelsRouter = Router();

channelsRouter.post("/", async (req: Request, res: Response) => {
  const { name, description, expiresAt } = req.body;

  if (!name || !expiresAt) {
    res.status(400).json({ error: "name과 expiresAt은 필수입니다." });
    return;
  }

  const expiresAtDate = new Date(expiresAt);
  if (Number.isNaN(expiresAtDate.getTime())) {
    res.status(400).json({ error: "expiresAt이 올바른 날짜 형식이 아닙니다." });
    return;
  }

  const adminToken = generateAdminToken();
  const code = generateChannelCode();

  // 채널 하나 = SNS 토픽 하나. 이름 패턴(qring-ch-*)은 SQS 큐 정책이
  // 이 패턴의 토픽만 발행을 허용하도록 이미 Terraform에서 걸어둔 것과 맞춰야 한다.
  const { TopicArn } = await snsClient.send(
    new CreateTopicCommand({ Name: `qring-ch-${code}` })
  );

  // 이 토픽에 온 메시지가 실제로 워커까지 가려면, 발송 큐가 이 토픽을 구독해야 한다.
  // RawMessageDelivery: SNS 고유 봉투(Envelope) 없이, 우리가 보낸 JSON 그대로 큐에 들어오게 함.
  await snsClient.send(
    new SubscribeCommand({
      TopicArn,
      Protocol: "sqs",
      Endpoint: WEBPUSH_DISPATCH_QUEUE_ARN,
      Attributes: { RawMessageDelivery: "true" },
    })
  );

  const [channel] = await db
    .insert(channels)
    .values({
      code,
      name,
      description,
      adminTokenHash: hashToken(adminToken),
      expiresAt: expiresAtDate,
      snsTopicArn: TopicArn,
    })
    .returning();

  console.log("채널 생성됨:", channel.code, channel.name);

  res.status(201).json({
    channelId: channel.id,
    code: channel.code,
    subscribeUrl: `${BASE_URL}/c/${channel.code}`,
    qrUrl: `${BASE_URL}/channels/${channel.id}/qr`,
    adminUrl: `${BASE_URL}/admin/${channel.id}?token=${adminToken}`,
  });
});

channelsRouter.get("/:id/qr", async (req: Request<{ id: string }>, res: Response) => {
  const [channel] = await db.select().from(channels).where(eq(channels.id, req.params.id));

  if (!channel) {
    res.status(404).json({ error: "채널을 찾을 수 없습니다." });
    return;
  }

  const subscribeUrl = `${BASE_URL}/c/${channel.code}`;
  const qrPng = await QRCode.toBuffer(subscribeUrl, { type: "png", width: 400 });

  res.type("png").send(qrPng);
});

channelsRouter.post(
  "/:id/notifications",
  async (req: Request<{ id: string }>, res: Response) => {
    const [channel] = await db.select().from(channels).where(eq(channels.id, req.params.id));

    if (!channel) {
      res.status(404).json({ error: "채널을 찾을 수 없습니다." });
      return;
    }

    if (!channel.snsTopicArn) {
      res.status(500).json({ error: "이 채널에는 SNS 토픽이 없습니다." });
      return;
    }

    const { title, body } = req.body;

    if (!title || !body) {
      res.status(400).json({ error: "title과 body는 필수입니다." });
      return;
    }

    const [notification] = await db
      .insert(notifications)
      .values({
        channelId: channel.id,
        title,
        body,
        status: "QUEUED",
      })
      .returning();

    // MVP 범위: 발송할 때마다 "확인했어요" 액션 하나를 자동으로 생성한다.
    await db.insert(notificationActions).values({
      notificationId: notification.id,
      actionKey: "ack",
      type: "ACK",
      label: "확인했어요",
    });

    // 구독자 조회/실제 발송은 여기서 안 한다 — 메시지 하나만 토픽에 발행하고,
    // "누구에게 보낼지"는 이 메시지를 받은 워커가 그때 DB를 조회해서 정한다.
    try {
      await snsClient.send(
        new PublishCommand({
          TopicArn: channel.snsTopicArn,
          Message: JSON.stringify({
            notificationId: notification.id,
            channelId: channel.id,
            title,
            body,
          }),
        })
      );
    } catch (err) {
      await db
        .update(notifications)
        .set({ status: "FAILED", completedAt: new Date() })
        .where(eq(notifications.id, notification.id));
      throw err;
    }

    console.log(`채널 ${channel.code} 발행됨 (${notification.id})`);

    res.status(202).json({ notificationId: notification.id });
  }
);
