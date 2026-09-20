import "dotenv/config";
import { ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { sqsClient } from "../aws/sqs";
import { WEBPUSH_DISPATCH_QUEUE_URL } from "../config";
import { processDispatch, DispatchMessage } from "./processor";

let running = true;

function handleShutdown(signal: string) {
  console.log(`[worker] ${signal} 수신 — 새 메시지 수신은 멈추고, 처리 중인 것만 끝냅니다.`);
  running = false;
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

async function pollOnce() {
  const result = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: WEBPUSH_DISPATCH_QUEUE_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20, // 롱 폴링
    })
  );

  for (const message of result.Messages ?? []) {
    if (!message.Body || !message.ReceiptHandle) continue;

    try {
      const parsed: DispatchMessage = JSON.parse(message.Body);
      console.log(`[worker] 처리 시작: ${parsed.notificationId}`);

      const outcome = await processDispatch(parsed);

      if (outcome === "DONE") {
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: WEBPUSH_DISPATCH_QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
          })
        );
        console.log(`[worker] 완료, 메시지 삭제: ${parsed.notificationId}`);
      } else {
        console.log(`[worker] 재시도 대상으로 남김(메시지 안 지움): ${parsed.notificationId}`);
      }
    } catch (err) {
      // 메시지를 못 지웠으니, 가시성 제한시간(120초) 뒤 자동으로 다시 전달된다.
      console.error("[worker] 메시지 처리 중 에러:", err);
    }
  }
}

async function main() {
  console.log("[worker] 시작. 큐 폴링 중...");

  while (running) {
    await pollOnce();
  }

  console.log("[worker] 종료.");
}

main();
