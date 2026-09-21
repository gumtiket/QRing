import { Router, Request, Response } from "express";
import { eq, and, count } from "drizzle-orm";
import QRCode from "qrcode";
import { CreateTopicCommand, SubscribeCommand, PublishCommand } from "@aws-sdk/client-sns";
import { db } from "../db/client";
import { channels, notifications, notificationActions, deliveries, subscriptions, responses } from "../db/schema";
import { generateChannelCode } from "../lib/channelCode";
import { generateAdminToken, hashToken } from "../lib/token";
import { snsClient } from "../aws/sns";
import { requireAdminAuth } from "../middleware/adminAuth";
import { createChannelLimiter, sendNotificationLimiter } from "../middleware/rateLimit";
import { BASE_URL, WEBPUSH_DISPATCH_QUEUE_ARN } from "../config";

export const channelsRouter = Router();

channelsRouter.post("/", createChannelLimiter, async (req: Request, res: Response) => {
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
    // 프래그먼트(#)로 넘긴다. 쿼리(?token=)와 달리 서버 액세스 로그와 리퍼러 헤더로
    // 나가지 않는다 — 브라우저가 서버에 전송하지 않고 URL 안에만 남겨둔다.
    adminUrl: `${BASE_URL}/admin/${channel.id}#token=${adminToken}`,
  });
});

// 운영자 관리 화면이 채널명/상태/구독자 수를 보여주려고 쓴다. adminToken이 있어야만
// 조회 가능 — 채널 id(UUID)만으로는 아무것도 못 본다.
channelsRouter.get(
  "/:id",
  requireAdminAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    const [channel] = await db.select().from(channels).where(eq(channels.id, req.params.id));

    if (!channel) {
      res.status(404).json({ error: "채널을 찾을 수 없습니다." });
      return;
    }

    const [{ value: subscriberCount }] = await db
      .select({ value: count() })
      .from(subscriptions)
      .where(and(eq(subscriptions.channelId, channel.id), eq(subscriptions.status, "ACTIVE")));

    res.json({
      channelId: channel.id,
      code: channel.code,
      name: channel.name,
      description: channel.description,
      status: channel.status,
      expiresAt: channel.expiresAt,
      subscriberCount,
    });
  }
);

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
  sendNotificationLimiter,
  requireAdminAuth,
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

    // 발송할 때마다 확인했어요 액션 하나를 자동으로 생성
    await db.insert(notificationActions).values({
      notificationId: notification.id,
      actionKey: "ack",
      type: "ACK",
      label: "확인했어요",
    });

    // 메시지를 토픽에 발행
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

channelsRouter.get(
  "/:id/notifications/:nid/responses",
  requireAdminAuth,
  async (req: Request<{ id: string; nid: string }>, res: Response) => {
    const [channel] = await db.select().from(channels).where(eq(channels.id, req.params.id));

    if (!channel) {
      res.status(404).json({ error: "채널을 찾을 수 없습니다." });
      return;
    }

    const [notification] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, req.params.nid), eq(notifications.channelId, channel.id)));

    if (!notification) {
      res.status(404).json({ error: "알림을 찾을 수 없습니다." });
      return;
    }

    // 실제로 발송에 성공한(SENT) 구독자만 "대상 명단"으로 본다 — 발송 자체가
    // 실패한 사람을 "미확인자"에 넣으면, 못 받은 사람과 안 읽은 사람이 섞여버린다.
    const rows = await db
      .select({
        subscriptionId: subscriptions.id,
        displayNo: subscriptions.displayNo,
        nickname: subscriptions.nickname,
        respondedAt: responses.respondedAt,
      })
      .from(deliveries)
      .innerJoin(subscriptions, eq(deliveries.subscriptionId, subscriptions.id))
      .leftJoin(
        responses,
        and(
          eq(responses.notificationId, deliveries.notificationId),
          eq(responses.subscriptionId, deliveries.subscriptionId)
        )
      )
      .where(and(eq(deliveries.notificationId, notification.id), eq(deliveries.status, "SENT")));

    const confirmed = rows.filter((r) => r.respondedAt !== null);
    const unconfirmed = rows.filter((r) => r.respondedAt === null);

    res.json({
      notificationId: notification.id,
      title: notification.title,
      totalSent: rows.length,
      confirmedCount: confirmed.length,
      confirmed: confirmed.map((r) => ({
        subscriptionId: r.subscriptionId,
        displayNo: r.displayNo,
        nickname: r.nickname,
        respondedAt: r.respondedAt,
      })),
      unconfirmed: unconfirmed.map((r) => ({
        subscriptionId: r.subscriptionId,
        displayNo: r.displayNo,
        nickname: r.nickname,
      })),
    });
  }
);

channelsRouter.post(
  "/:id/close",
  requireAdminAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    const [channel] = await db
      .update(channels)
      .set({ status: "CLOSED", closedAt: new Date() })
      .where(eq(channels.id, req.params.id))
      .returning();

    console.log(`채널 종료됨: ${channel.code}`);

    res.json({ channelId: channel.id, status: channel.status, closedAt: channel.closedAt });
  }
);
