import { eq, and, lt } from "drizzle-orm";
import { DeleteTopicCommand } from "@aws-sdk/client-sns";
import { db } from "../db/client";
import {
  channels,
  subscriptions,
  notifications,
  notificationActions,
  responses,
  deliveries,
} from "../db/schema";
import { snsClient } from "../aws/sns";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// 만료 시각이 지난 ACTIVE 채널을 자동으로 CLOSED 처리
async function closeExpiredChannels() {
  const closed = await db
    .update(channels)
    .set({ status: "CLOSED", closedAt: new Date() })
    .where(and(eq(channels.status, "ACTIVE"), lt(channels.expiresAt, new Date())))
    .returning({ id: channels.id, code: channels.code });

  if (closed.length > 0) {
    console.log(`[janitor] 만료로 종료된 채널 ${closed.length}개:`, closed.map((c) => c.code).join(", "));
  }
}

// 종료 후 7일 지난 채널 — 개인정보 삭제, 구독 비활성화, SNS 토픽 삭제
async function purgeOldClosedChannels() {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);

  const toPurge = await db
    .select()
    .from(channels)
    .where(and(eq(channels.status, "CLOSED"), lt(channels.closedAt, cutoff)));

  for (const channel of toPurge) {
    await db
      .update(subscriptions)
      .set({ endpointData: {}, nickname: null, status: "EXPIRED", updatedAt: new Date() })
      .where(eq(subscriptions.channelId, channel.id));

    if (channel.snsTopicArn) {
      try {
        await snsClient.send(new DeleteTopicCommand({ TopicArn: channel.snsTopicArn }));
      } catch (err) {
        console.error(`[janitor] 토픽 삭제 실패 (${channel.code}):`, err);
      }
    }

    await db.update(channels).set({ status: "PURGED" }).where(eq(channels.id, channel.id));

    console.log(`[janitor] 채널 개인정보 삭제 완료: ${channel.code}`);
  }
}

// 30일 지난 알림/응답/발송 기록 삭제
async function deleteOldNotifications() {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  const old = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(lt(notifications.createdAt, cutoff));

  for (const { id } of old) {
    // FK 제약 때문에 자식 행부터 삭제
    await db.delete(deliveries).where(eq(deliveries.notificationId, id));
    await db.delete(responses).where(eq(responses.notificationId, id));
    await db.delete(notificationActions).where(eq(notificationActions.notificationId, id));
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  if (old.length > 0) {
    console.log(`[janitor] 30일 지난 알림 기록 ${old.length}건 삭제`);
  }
}

export async function runJanitor() {
  await closeExpiredChannels();
  await purgeOldClosedChannels();
  await deleteOldNotifications();
}
