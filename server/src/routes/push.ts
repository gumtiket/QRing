import { Router, Request, Response } from "express";

export const pushRouter = Router();

// TODO: 채널/구독 기준 확인 응답(PUT /public/subscriptions/:id/responses/:nid)으로 교체 예정.
// 그 전까지는 sw.js의 notificationclick(버튼 경로)이 이 엔드포인트를 그대로 호출한다.
let ackCount = 0;

pushRouter.post("/ack", (req: Request, res: Response) => {
  ackCount += 1;
  const via = req.body?.via ?? "unknown";
  console.log(`확인 응답 수신 (경로: ${via}). 누적 확인 수: ${ackCount}`);
  res.json({ ok: true, ackCount });
});
