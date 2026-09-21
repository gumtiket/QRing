import { eq, and, sql } from "drizzle-orm";
import webpush from "web-push";
import { db } from "../db/client";
import { subscriptions, notifications, deliveries } from "../db/schema";

export type DispatchMessage = {
  notificationId: string;
  channelId: string;
  title: string;
  body: string;
};

export type ProcessResult = "DONE" | "RETRY";

export async function processDispatch(message: DispatchMessage): Promise<ProcessResult> {
  // 같은 notificationId가 두 경로(SQS로 받은 정상 처리 / republisher의 직접 처리)에서
  // 동시에 들어올 수 있다. pg_advisory_xact_lock으로 notificationId당 하나만 실제로
  // 돌게 막는다 — 트랜잭션 범위 락이라 커밋/롤백 시 자동 해제되고 따로 관리할 게 없다.
  // 뒤늦게 락을 잡은 쪽은, 그 안에서 다시 조회하면 먼저 커밋된 쪽이 이미 SENT로 남긴
  // deliveries를 그대로 보게 되어 자연히 건너뛴다(중복 발송 없음).
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${message.notificationId}))`);

    async function upsertDelivery(
      subscriptionId: string,
      status: string,
      httpStatus: number | undefined
    ) {
      await tx
        .insert(deliveries)
        .values({
          notificationId: message.notificationId,
          subscriptionId,
          status,
          httpStatus,
          attemptCount: 1,
        })
        .onConflictDoUpdate({
          target: [deliveries.notificationId, deliveries.subscriptionId],
          set: {
            status,
            httpStatus,
            attemptCount: sql`${deliveries.attemptCount} + 1`,
            updatedAt: new Date(),
          },
        });
    }

    const activeSubscriptions = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.channelId, message.channelId), eq(subscriptions.status, "ACTIVE")));

    let successCount = 0;
    let failCount = 0;
    let anyRetryable = false;

    for (const sub of activeSubscriptions) {
      // 멱등성 보장
      const [existing] = await tx
        .select()
        .from(deliveries)
        .where(
          and(eq(deliveries.notificationId, message.notificationId), eq(deliveries.subscriptionId, sub.id))
        );

      if (existing?.status === "SENT") {
        successCount++;
        continue;
      }

      const payload = JSON.stringify({
        notificationId: message.notificationId,
        subscriptionId: sub.id,
        title: message.title,
        body: message.body,
      });

      try {
        await webpush.sendNotification(sub.endpointData as webpush.PushSubscription, payload);
        await upsertDelivery(sub.id, "SENT", 201);
        successCount++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;

        if (statusCode === 404 || statusCode === 410) {
          // 구독이 죽었다. 재시도 안 하고, 다음부터 발송 대상에서 아예 빠지게 만료 처리
          await upsertDelivery(sub.id, "FAILED_PERMANENT", statusCode);
          await tx
            .update(subscriptions)
            .set({ status: "EXPIRED", updatedAt: new Date() })
            .where(eq(subscriptions.id, sub.id));
        } else if (statusCode === 413) {
          await upsertDelivery(sub.id, "FAILED_PERMANENT", statusCode);
        } else {
          await upsertDelivery(sub.id, "FAILED_RETRYABLE", statusCode);
          anyRetryable = true;
        }

        failCount++;
      }
    }

    let finalStatus: string;
    let completedAt: Date | null = null;

    if (anyRetryable) {
      finalStatus = "DISPATCHING";
    } else if (failCount === 0) {
      finalStatus = "DONE";
      completedAt = new Date();
    } else if (successCount === 0) {
      finalStatus = "FAILED";
      completedAt = new Date();
    } else {
      finalStatus = "PARTIAL_FAILED";
      completedAt = new Date();
    }

    await tx
      .update(notifications)
      .set({
        status: finalStatus,
        totalCount: activeSubscriptions.length,
        successCount,
        failCount,
        completedAt,
      })
      .where(eq(notifications.id, message.notificationId));

    return anyRetryable ? "RETRY" : "DONE";
  });
}
