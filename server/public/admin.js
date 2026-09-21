// 채널 id는 경로에서, 토큰은 프래그먼트에서 읽는다. 토큰이 쿼리스트링이 아니라 해시에
// 있는 이유: 브라우저가 프래그먼트는 서버로 절대 보내지 않는다 — 액세스 로그, 리퍼러
// 헤더 어디에도 안 남는다. 그래서 서버 쪽 라우트(index.ts)는 이 id조차 안 쓰고 그냥
// admin.html만 내려주고, 실제 조회/조작은 전부 여기서 Authorization 헤더로 한다.
const channelId = location.pathname.split("/").pop();
const token = new URLSearchParams(location.hash.slice(1)).get("token");

const channelNameEl = document.getElementById("channel-name");
const channelMetaEl = document.getElementById("channel-meta");
const loadErrorEl = document.getElementById("load-error");
const panelEl = document.getElementById("admin-panel");

const notifyForm = document.getElementById("notify-form");
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const notifyBtn = document.getElementById("notify-btn");
const notifyStatusEl = document.getElementById("notify-status");

const closeBtn = document.getElementById("close-btn");
const closeStatusEl = document.getElementById("close-status");

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

async function loadChannel() {
  if (!token) {
    channelNameEl.textContent = "관리 링크가 올바르지 않습니다";
    loadErrorEl.hidden = false;
    loadErrorEl.textContent = "URL에 토큰이 없습니다. 채널 생성 시 받은 관리 링크로 다시 들어오세요.";
    return;
  }

  const res = await fetch(`/channels/${channelId}`, { headers: authHeaders() });

  if (!res.ok) {
    channelNameEl.textContent = "채널을 열 수 없습니다";
    loadErrorEl.hidden = false;
    loadErrorEl.textContent =
      res.status === 401 || res.status === 403
        ? "관리 토큰이 올바르지 않습니다."
        : `조회 실패 (HTTP ${res.status})`;
    return;
  }

  const channel = await res.json();

  channelNameEl.textContent = channel.name;
  channelMetaEl.textContent =
    `코드 ${channel.code} · 상태 ${channel.status} · 구독자 ${channel.subscriberCount}명`;

  if (channel.status !== "ACTIVE") {
    closeBtn.disabled = true;
    notifyBtn.disabled = true;
  }

  panelEl.hidden = false;
}

async function sendNotification() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    notifyStatusEl.textContent = "제목과 내용을 모두 입력하세요.";
    return;
  }

  notifyBtn.disabled = true;
  notifyStatusEl.textContent = "보내는 중...";

  try {
    const res = await fetch(`/channels/${channelId}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ title, body }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      notifyStatusEl.textContent =
        res.status === 429
          ? "너무 자주 보냈습니다. 잠시 후 다시 시도하세요 (분당 5회 제한)."
          : errBody.error || `발송 실패 (HTTP ${res.status})`;
      return;
    }

    notifyStatusEl.textContent = "발송 요청됨. 참여자에게 곧 전달됩니다.";
    notifyForm.reset();
  } catch (err) {
    console.error("발송 실패:", err);
    notifyStatusEl.textContent = "발송 실패 (네트워크 오류)";
  } finally {
    notifyBtn.disabled = false;
  }
}

async function closeChannel() {
  if (!confirm("정말 채널을 종료하시겠습니까? 되돌릴 수 없습니다.")) {
    return;
  }

  closeBtn.disabled = true;
  closeStatusEl.textContent = "종료하는 중...";

  try {
    const res = await fetch(`/channels/${channelId}/close`, {
      method: "POST",
      headers: authHeaders(),
    });

    if (!res.ok) {
      closeStatusEl.textContent = `종료 실패 (HTTP ${res.status})`;
      closeBtn.disabled = false;
      return;
    }

    closeStatusEl.textContent = "채널이 종료되었습니다.";
    notifyBtn.disabled = true;
    channelMetaEl.textContent = channelMetaEl.textContent.replace("상태 ACTIVE", "상태 CLOSED");
  } catch (err) {
    console.error("종료 실패:", err);
    closeStatusEl.textContent = "종료 실패 (네트워크 오류)";
    closeBtn.disabled = false;
  }
}

notifyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendNotification();
});

closeBtn.addEventListener("click", closeChannel);

loadChannel();
