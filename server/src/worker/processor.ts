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

async function upsertDelivery(
  notificationId: string,
  subscriptionId: string,
  status: string,
  httpStatus: number | undefined
) {
  await db
    .insert(deliveries)
    .values({ notificationId, subscriptionId, status, httpStatus, attemptCount: 1 })
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

export async function processDispatch(message: DispatchMessage): Promise<ProcessResult> {
  const activeSubscriptions = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.channelId, message.channelId), eq(subscriptions.status, "ACTIVE")));

  let successCount = 0;
  let failCount = 0;
  let anyRetryable = false;

  for (const sub of activeSubscriptions) {
    // 멱등성 보장
    const [existing] = await db
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
      await upsertDelivery(message.notificationId, sub.id, "SENT", 201);
      successCount++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;

      if (statusCode === 404 || statusCode === 410) {
        // 구독이 죽었다. 재시도 안 하고, 다음부터 발송 대상에서 아예 빠지게 만료 처리
        await upsertDelivery(message.notificationId, sub.id, "FAILED_PERMANENT", statusCode);
        await db
          .update(subscriptions)
          .set({ status: "EXPIRED", updatedAt: new Date() })
          .where(eq(subscriptions.id, sub.id));
      } else if (statusCode === 413) {
        await upsertDelivery(message.notificationId, sub.id, "FAILED_PERMANENT", statusCode);
      } else {
        await upsertDelivery(message.notificationId, sub.id, "FAILED_RETRYABLE", statusCode);
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

  await db
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
}
