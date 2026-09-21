const code = location.pathname.split("/").pop();

const channelNameEl = document.getElementById("channel-name");
const channelDescriptionEl = document.getElementById("channel-description");
const formEl = document.getElementById("subscribe-form");
const nicknameInput = document.getElementById("nickname-input");
const subscribeBtn = document.getElementById("subscribe-btn");
const subscribedPanelEl = document.getElementById("subscribed-panel");
const unsubscribeBtn = document.getElementById("unsubscribe-btn");
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

// 채널당 하나. deviceKey와 마찬가지로 이 브라우저에만 남는 값이고, 값 자체(구독 id)에
// 특별한 권한 정보는 없다 — 추측 불가능한 UUID라는 것만으로 남의 구독을 못 건드리는
// 구조(해지 API 자체가 그렇게 설계돼 있음)라, 여기 저장해도 새로 늘어나는 위험은 없다.
function getSubscriptionKey() {
  return `qring_subscription_id_${code}`;
}

function saveSubscriptionId(id) {
  localStorage.setItem(getSubscriptionKey(), id);
}

function getSavedSubscriptionId() {
  return localStorage.getItem(getSubscriptionKey());
}

function clearSavedSubscriptionId() {
  localStorage.removeItem(getSubscriptionKey());
}

function showSubscribedPanel() {
  formEl.hidden = true;
  subscribedPanelEl.hidden = false;
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

  if (getSavedSubscriptionId()) {
    showSubscribedPanel();
  } else {
    formEl.hidden = false;
  }
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
  saveSubscriptionId(result.subscriptionId);
  showSubscribedPanel();
  statusEl.textContent = `구독 완료! 참여자 #${result.displayNo}`;
}

async function unsubscribe() {
  const subscriptionId = getSavedSubscriptionId();
  if (!subscriptionId) {
    return;
  }

  unsubscribeBtn.disabled = true;

  try {
    const res = await fetch(`/public/subscriptions/${subscriptionId}`, { method: "DELETE" });

    if (!res.ok) {
      statusEl.textContent = `구독 취소 실패 (HTTP ${res.status})`;
      return;
    }

    clearSavedSubscriptionId();

    // 서버 쪽은 이미 지워졌으니 화면부터 바로 갱신한다. 아래 브라우저 푸시 구독
    // 해지는 부가 정리일 뿐이라, 이게 안 끝났다고 사용자를 기다리게 하지 않는다.
    subscribedPanelEl.hidden = true;
    formEl.hidden = false;
    statusEl.textContent = "구독을 취소했습니다.";

    // 여기서 지우지 않으면, 이 브라우저는 여전히 브라우저사 푸시 서비스에 등록된
    // 채로 남는다. getRegistration()을 쓴다 — .ready는 "이 페이지를 제어하는 SW가
    // 뜰 때까지" 기다리는 API라, SW 등록이 어떤 이유로든 실패하면 영원히 안 끝난다.
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const pushSubscription = await registration?.pushManager.getSubscription();
        await pushSubscription?.unsubscribe();
      } catch (err) {
        console.error("브라우저 푸시 구독 해지 실패 (서버 쪽은 이미 취소됨):", err);
      }
    }
  } catch (err) {
    console.error("구독 취소 실패:", err);
    statusEl.textContent = "구독 취소 실패 (네트워크 오류)";
  } finally {
    unsubscribeBtn.disabled = false;
  }
}

subscribeBtn.addEventListener("click", () => {
  subscribeToPush().catch((err) => {
    console.error("구독 실패:", err);
    statusEl.textContent = "구독 실패 (콘솔 확인)";
  });
});

unsubscribeBtn.addEventListener("click", unsubscribe);

loadChannel();
registerServiceWorker();
