import { Router, Request, Response } from "express";
import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "../config";

export const pushRouter = Router();

// PoC 단계라 DB 대신 메모리 배열에 구독 정보를 둔다. 서버를 재시작하면 사라진다.
const subscriptions: webpush.PushSubscription[] = [];
let ackCount = 0;

pushRouter.get("/vapid-public-key", (req: Request, res: Response) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

pushRouter.post("/subscribe", (req: Request, res: Response) => {
  const subscription: webpush.PushSubscription = req.body;
  subscriptions.push(subscription);
  console.log("새 구독 저장됨. 현재 구독 수:", subscriptions.length);
  res.status(201).json({ ok: true });
});

pushRouter.post("/send-test", async (req: Request, res: Response) => {
  const payload = JSON.stringify({
    title: "QRing 테스트 알림",
    body: "여기까지 도착했으면 성공입니다.",
  });

  const results = await Promise.allSettled(
    subscriptions.map((subscription) => webpush.sendNotification(subscription, payload))
  );

  const successCount = results.filter((r) => r.status === "fulfilled").length;
  const failCount = results.length - successCount;

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`구독 #${i} 발송 실패:`, r.reason?.statusCode, r.reason?.body);
    }
  });

  console.log(`발송 완료: 성공 ${successCount} / 실패 ${failCount}`);
  res.json({ total: results.length, success: successCount, fail: failCount });
});

pushRouter.post("/ack", (req: Request, res: Response) => {
  ackCount += 1;
  const via = req.body?.via ?? "unknown";
  console.log(`확인 응답 수신 (경로: ${via}). 누적 확인 수: ${ackCount}`);
  res.json({ ok: true, ackCount });
});
