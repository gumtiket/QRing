const code = location.pathname.split("/").pop();

const channelNameEl = document.getElementById("channel-name");
const channelDescriptionEl = document.getElementById("channel-description");
const formEl = document.getElementById("subscribe-form");
const nicknameInput = document.getElementById("nickname-input");
const subscribeBtn = document.getElementById("subscribe-btn");
const statusEl = document.getElementById("status");

function detectClientEnv() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isKakao = /KAKAOTALK/i.test(ua);
  const isInApp = isKakao || /FBAN|FBAV|Instagram|Line/i.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  if (isKakao) return "INAPP_KAKAO";
  if (isInApp) return "INAPP_OTHER";
  if (isIOS && isStandalone) return "IOS_PWA";
  if (isIOS) return "IOS_SAFARI";
  if (isAndroid) return "ANDROID_CHROME";
  if (/Mobile/.test(ua)) return "OTHER";
  return "DESKTOP";
}

function getDeviceKey() {
  const storageKey = `qring_device_key_${code}`;
  let deviceKey = localStorage.getItem(storageKey);
  if (!deviceKey) {
    deviceKey = crypto.randomUUID();
    localStorage.setItem(storageKey, deviceKey);
  }
  return deviceKey;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function loadChannel() {
  const res = await fetch(`/public/channels/${code}`);

  if (!res.ok) {
    channelNameEl.textContent = "채널을 찾을 수 없습니다";
    return;
  }

  const channel = await res.json();

  if (channel.status !== "ACTIVE") {
    channelNameEl.textContent = channel.name;
    statusEl.textContent = "이 채널은 종료되었습니다.";
    return;
  }

  channelNameEl.textContent = channel.name;
  channelDescriptionEl.textContent = channel.description ?? "";
  formEl.hidden = false;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    statusEl.textContent = "이 브라우저는 알림을 지원하지 않습니다.";
    return;
  }
  await navigator.serviceWorker.register("/sw.js");
}

async function subscribeToPush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    statusEl.textContent = `알림 권한이 거부됨 (${permission})`;
    return;
  }

  const { publicKey } = await fetch("/public/vapid-public-key").then((res) => res.json());

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const res = await fetch(`/public/channels/${code}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpointData: subscription,
      deviceKey: getDeviceKey(),
      nickname: nicknameInput.value.trim() || undefined,
      clientEnv: detectClientEnv(),
    }),
  });

  if (!res.ok) {
    const body = await res.json();
    statusEl.textContent = `구독 실패: ${body.error}`;
    return;
  }

  const result = await res.json();
  statusEl.textContent = `구독 완료! 참여자 #${result.displayNo}`;
}

subscribeBtn.addEventListener("click", () => {
  subscribeToPush().catch((err) => {
    console.error("구독 실패:", err);
    statusEl.textContent = "구독 실패 (콘솔 확인)";
  });
});

loadChannel();
registerServiceWorker();
