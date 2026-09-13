import "dotenv/config";
import path from "path";
import express, { Request, Response } from "express";
import webpush from "web-push";

const PORT = 3000;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  throw new Error(".env에 VAPID 키가 설정되어 있지 않습니다.");
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// PoC 단계라 DB 대신 메모리 배열에 구독 정보를 둔다. 서버를 재시작하면 사라진다.
const subscriptions: webpush.PushSubscription[] = [];
let ackCount = 0;

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/api/vapid-public-key", (req: Request, res: Response) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post("/api/subscribe", (req: Request, res: Response) => {
  const subscription: webpush.PushSubscription = req.body;
  subscriptions.push(subscription);
  console.log("새 구독 저장됨. 현재 구독 수:", subscriptions.length);
  res.status(201).json({ ok: true });
});

app.post("/api/send-test", async (req: Request, res: Response) => {
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

app.post("/api/ack", (req: Request, res: Response) => {
  ackCount += 1;
  const via = req.body?.via ?? "unknown";
  console.log(`확인 응답 수신 (경로: ${via}). 누적 확인 수: ${ackCount}`);
  res.json({ ok: true, ackCount });
});

app.listen(PORT, () => {
  console.log(`QRing 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log("VAPID 공개키 등록 완료:", VAPID_PUBLIC_KEY);
});
