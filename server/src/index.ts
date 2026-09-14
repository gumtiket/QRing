import path from "path";
import express, { Request, Response } from "express";
import { PORT } from "./config";
import { channelsRouter } from "./routes/channels";
import { pushRouter } from "./routes/push";

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/channels", channelsRouter);
app.use("/api", pushRouter);

app.listen(PORT, () => {
  console.log(`QRing 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
