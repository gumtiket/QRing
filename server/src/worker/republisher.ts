import { eq, and, lt } from "drizzle-orm";
import { db } from "../db/client";
import { notifications } from "../db/schema";
import { processDispatch } from "./processor";

const STUCK_THRESHOLD_MS = 500;

export async function runStuckNotificationSweep() {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  const stuck = await db
    .select({
      id: notifications.id,
      channelId: notifications.channelId,
      title: notifications.title,
      body: notifications.body,
    })
    .from(notifications)
    .where(and(eq(notifications.status, "QUEUED"), lt(notifications.createdAt, cutoff)));

  // 여러 건이 같은 스윕에 걸리면(발송이 몰릴 때) 순서대로 하나씩 처리하면 뒤쪽 건이
  // 앞쪽 건 처리 시간만큼 밀린다 — 병렬로 돌려서 이 줄서기를 없앤다.
  await Promise.all(
    stuck.map(async (n) => {
      try {
        await processDispatch({
          notificationId: n.id,
          channelId: n.channelId,
          title: n.title,
          body: n.body,
        });
        console.log(`[republisher] 직접 처리: ${n.id} (처음 발행 후 ${STUCK_THRESHOLD_MS}ms 넘게 무응답, SNS/SQS 우회)`);
      } catch (err) {
        // 다음 스윕(0.5초 뒤)에서 다시 시도된다.
        console.error(`[republisher] 직접 처리 실패: ${n.id}`, err);
      }
    })
  );
}
