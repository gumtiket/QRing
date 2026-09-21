import { eq, and, lt, isNotNull } from "drizzle-orm";
import { PublishCommand } from "@aws-sdk/client-sns";
import { db } from "../db/client";
import { channels, notifications } from "../db/schema";
import { snsClient } from "../aws/sns";


const STUCK_THRESHOLD_MS = 500;

export async function runStuckNotificationSweep() {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  const stuck = await db
    .select({
      notificationId: notifications.id,
      channelId: notifications.channelId,
      title: notifications.title,
      body: notifications.body,
      snsTopicArn: channels.snsTopicArn,
    })
    .from(notifications)
    .innerJoin(channels, eq(channels.id, notifications.channelId))
    .where(
      and(
        eq(notifications.status, "QUEUED"),
        lt(notifications.createdAt, cutoff),
        isNotNull(channels.snsTopicArn)
      )
    );

  // 여러 건이 같은 스윕에 한꺼번에 걸리면(발송이 몰릴 때) 순서대로 하나씩 await 하면
  // 뒤쪽 건이 앞쪽 건의 SNS 호출 시간만큼 밀린다 — 병렬로 쏴서 이 줄서기를 없앤다.
  await Promise.all(
    stuck.map(async (n) => {
      try {
        await snsClient.send(
          new PublishCommand({
            TopicArn: n.snsTopicArn!,
            Message: JSON.stringify({
              notificationId: n.notificationId,
              channelId: n.channelId,
              title: n.title,
              body: n.body,
            }),
          })
        );
        console.log(`[republisher] 재발행: ${n.notificationId} (처음 발행 후 ${STUCK_THRESHOLD_MS}ms 넘게 무응답)`);
      } catch (err) {
        // 다음 스윕(0.5초 뒤)에서 다시 시도된다 — 여기서 상태를 바꾸지 않는다.
        console.error(`[republisher] 재발행 실패: ${n.notificationId}`, err);
      }
    })
  );
}
