const statusEl = document.getElementById("status");
const subscribeStatusEl = document.getElementById("subscribe-status");
const subscribeBtn = document.getElementById("subscribe-btn");
const sendTestBtn = document.getElementById("send-test-btn");
const sendTestStatusEl = document.getElementById("send-test-status");
const ackBtn = document.getElementById("ack-btn");
const ackStatusEl = document.getElementById("ack-status");

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    statusEl.textContent = "이 브라우저는 서비스 워커를 지원하지 않습니다.";
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    console.log("서비스 워커 등록 성공:", registration);
    statusEl.textContent = "서비스 워커 등록 성공 (콘솔 확인)";
  } catch (err) {
    console.error("서비스 워커 등록 실패:", err);
    statusEl.textContent = "서비스 워커 등록 실패 (콘솔 확인)";
  }
}

// 서버에서 받은 base64 형태의 공개키를, 브라우저 Push API가 요구하는
// Uint8Array 형태로 바꿔주는 변환 함수. (Push API 표준 스펙이 이 형식을 요구함)
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function subscribeToPush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    subscribeStatusEl.textContent = `알림 권한이 거부됨 (${permission})`;
    return;
  }

  const { publicKey } = await fetch("/api/vapid-public-key").then((res) => res.json());

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  console.log("구독 정보:", subscription);

  await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });

  subscribeStatusEl.textContent = "구독 완료! 서버에 저장됨";
}

subscribeBtn.addEventListener("click", () => {
  subscribeToPush().catch((err) => {
    console.error("구독 실패:", err);
    subscribeStatusEl.textContent = "구독 실패 (콘솔 확인)";
  });
});

sendTestBtn.addEventListener("click", async () => {
  sendTestStatusEl.textContent = "발송 중...";
  const result = await fetch("/api/send-test", { method: "POST" }).then((res) => res.json());
  sendTestStatusEl.textContent = `발송 결과: 성공 ${result.success} / 실패 ${result.fail}`;
});

ackBtn.addEventListener("click", async () => {
  const result = await fetch("/api/ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ via: "screen" }),
  }).then((res) => res.json());
  ackStatusEl.textContent = `확인 전송됨 (누적 ${result.ackCount}명)`;
});

registerServiceWorker();
