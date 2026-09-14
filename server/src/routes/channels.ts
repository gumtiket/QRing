import { Router, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import QRCode from "qrcode";
import webpush from "web-push";
import { db } from "../db/client";
import { channels, subscriptions, notifications, notificationActions } from "../db/schema";
import { generateChannelCode } from "../lib/channelCode";
import { generateAdminToken, hashToken } from "../lib/token";
import { BASE_URL } from "../config";

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

  const [channel] = await db
    .insert(channels)
    .values({
      code: generateChannelCode(),
      name,
      description,
      adminTokenHash: hashToken(adminToken),
      expiresAt: expiresAtDate,
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

    const { title, body } = req.body;

    if (!title || !body) {
      res.status(400).json({ error: "title과 body는 필수입니다." });
      return;
    }

    const activeSubscriptions = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.channelId, channel.id), eq(subscriptions.status, "ACTIVE")));

    const [notification] = await db
      .insert(notifications)
      .values({
        channelId: channel.id,
        title,
        body,
        status: "DISPATCHING",
        totalCount: activeSubscriptions.length,
      })
      .returning();

    // MVP 범위: 발송할 때마다 "확인했어요" 액션 하나를 자동으로 생성한다.
    await db.insert(notificationActions).values({
      notificationId: notification.id,
      actionKey: "ack",
      type: "ACK",
      label: "확인했어요",
    });

    const results = await Promise.allSettled(
      activeSubscriptions.map((sub) => {
        // 구독자마다 다른 payload를 보낸다 — 자기 subscriptionId를 알아야
        // 나중에 알림을 눌렀을 때 "누가 확인했는지" 서버에 알려줄 수 있다.
        const payload = JSON.stringify({
          notificationId: notification.id,
          subscriptionId: sub.id,
          title,
          body,
        });
        return webpush.sendNotification(sub.endpointData as webpush.PushSubscription, payload);
      })
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failCount = results.length - successCount;

    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(
          `구독 ${activeSubscriptions[i].id} 발송 실패:`,
          r.reason?.statusCode,
          r.reason?.body
        );
      }
    });

    const finalStatus = failCount === 0 ? "DONE" : successCount === 0 ? "FAILED" : "PARTIAL_FAILED";

    await db
      .update(notifications)
      .set({ status: finalStatus, successCount, failCount, completedAt: new Date() })
      .where(eq(notifications.id, notification.id));

    console.log(
      `채널 ${channel.code} 발송 완료 (${notification.id}): 대상 ${activeSubscriptions.length}, 성공 ${successCount}, 실패 ${failCount}`
    );

    res.status(202).json({
      notificationId: notification.id,
      total: activeSubscriptions.length,
      success: successCount,
      fail: failCount,
    });
  }
);
