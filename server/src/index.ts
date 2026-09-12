import "dotenv/config";
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

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`QRing 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log("VAPID 공개키 등록 완료:", VAPID_PUBLIC_KEY);
});
