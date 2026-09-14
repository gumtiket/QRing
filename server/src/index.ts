import path from "path";
import express, { Request, Response } from "express";
import { PORT } from "./config";
import { channelsRouter } from "./routes/channels";
import { pushRouter } from "./routes/push";
import { publicRouter } from "./routes/public";

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// 구독 페이지. 실제 채널 정보는 이 HTML이 로드된 뒤 프론트 JS가 /public API로 따로 받아온다.
app.get("/c/:code", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../public/subscribe.html"));
});

app.use("/channels", channelsRouter);
app.use("/api", pushRouter);
app.use("/public", publicRouter);

app.listen(PORT, () => {
  console.log(`QRing 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
