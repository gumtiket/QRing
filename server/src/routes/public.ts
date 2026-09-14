import { Router, Request, Response } from "express";
import { eq, count } from "drizzle-orm";
import { db } from "../db/client";
import { channels, subscriptions, notifications, responses } from "../db/schema";
import { VAPID_PUBLIC_KEY } from "../config";

export const publicRouter = Router();

publicRouter.get("/vapid-public-key", (req: Request, res: Response) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

publicRouter.get("/channels/:code", async (req: Request<{ code: string }>, res: Response) => {
  const [channel] = await db.select().from(channels).where(eq(channels.code, req.params.code));

  if (!channel) {
    res.status(404).json({ error: "채널을 찾을 수 없습니다." });
    return;
  }

  res.json({
    channelId: channel.id,
    name: channel.name,
    description: channel.description,
    status: channel.status,
  });
});

publicRouter.post(
  "/channels/:code/subscriptions",
  async (req: Request<{ code: string }>, res: Response) => {
    const [channel] = await db.select().from(channels).where(eq(channels.code, req.params.code));

    if (!channel) {
      res.status(404).json({ error: "채널을 찾을 수 없습니다." });
      return;
    }

    if (channel.status !== "ACTIVE") {
      res.status(400).json({ error: "종료된 채널입니다." });
      return;
    }

    const { endpointData, deviceKey, nickname, clientEnv } = req.body;

    if (!endpointData || !deviceKey) {
      res.status(400).json({ error: "endpointData와 deviceKey는 필수입니다." });
      return;
    }

    const [{ value: subscriberCount }] = await db
      .select({ value: count() })
      .from(subscriptions)
      .where(eq(subscriptions.channelId, channel.id));

    const [subscription] = await db
      .insert(subscriptions)
      .values({
        channelId: channel.id,
        displayNo: subscriberCount + 1,
        nickname,
        endpointData,
        deviceKey,
        clientEnv,
      })
      .onConflictDoUpdate({
        // 같은 채널에 같은 기기가 다시 구독하면(재접속, 새로고침 등) 새 행을 만들지 않고
        // 기존 행을 갱신한다. display_no(참여자 번호)는 그대로 유지한다.
        target: [subscriptions.channelId, subscriptions.deviceKey],
        set: {
          endpointData,
          nickname,
          clientEnv,
          status: "ACTIVE",
          updatedAt: new Date(),
        },
      })
      .returning();

    console.log(`채널 ${channel.code}에 구독 저장됨 (참여자 #${subscription.displayNo})`);

    res.status(201).json({
      subscriptionId: subscription.id,
      displayNo: subscription.displayNo,
    });
  }
);

// 알림 상세 화면(본문 탭 경로)이 내용을 보여주려고 조회한다.
publicRouter.get("/notifications/:nid", async (req: Request<{ nid: string }>, res: Response) => {
  const [notification] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, req.params.nid));

  if (!notification) {
    res.status(404).json({ error: "알림을 찾을 수 없습니다." });
    return;
  }

  res.json({ title: notification.title, body: notification.body });
});

publicRouter.put(
  "/subscriptions/:id/responses/:nid",
  async (req: Request<{ id: string; nid: string }>, res: Response) => {
    const { actionKey } = req.body;

    if (!actionKey) {
      res.status(400).json({ error: "actionKey는 필수입니다." });
      return;
    }

    // PUT이라 몇 번을 호출해도(버튼 경로 + 화면 경로가 겹쳐서 와도) 결과가 같다 —
    // 복합 PK(notification_id + subscription_id) 덕분에 항상 한 건만 남는다.
    await db
      .insert(responses)
      .values({
        notificationId: req.params.nid,
        subscriptionId: req.params.id,
        actionKey,
      })
      .onConflictDoUpdate({
        target: [responses.notificationId, responses.subscriptionId],
        set: { actionKey, respondedAt: new Date() },
      });

    console.log(`응답 저장됨: 알림 ${req.params.nid} ← 구독 ${req.params.id} (${actionKey})`);

    res.json({ ok: true });
  }
);
