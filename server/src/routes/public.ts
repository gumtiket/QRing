import { Router, Request, Response } from "express";
import { eq, count } from "drizzle-orm";
import { db } from "../db/client";
import { channels, subscriptions } from "../db/schema";
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
