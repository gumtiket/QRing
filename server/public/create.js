const form = document.getElementById("create-form");
const nameInput = document.getElementById("name-input");
const descriptionInput = document.getElementById("description-input");
const expiresInput = document.getElementById("expires-input");
const createBtn = document.getElementById("create-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const resultNameEl = document.getElementById("result-name");
const qrImg = document.getElementById("qr-img");
const channelCodeEl = document.getElementById("channel-code");
const adminLinkEl = document.getElementById("admin-link");
const copyAdminBtn = document.getElementById("copy-admin-btn");
const copyStatusEl = document.getElementById("copy-status");

async function createChannel() {
  const name = nameInput.value.trim();
  const expiresAt = expiresInput.value ? new Date(expiresInput.value).toISOString() : "";

  if (!name) {
    statusEl.textContent = "채널 이름을 입력하세요.";
    return;
  }
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    statusEl.textContent = "종료 시각은 미래여야 합니다.";
    return;
  }

  createBtn.disabled = true;
  statusEl.textContent = "만드는 중...";

  try {
    const res = await fetch("/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: descriptionInput.value.trim() || undefined,
        expiresAt,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      statusEl.textContent = body.error || `채널 생성 실패 (HTTP ${res.status})`;
      return;
    }

    const channel = await res.json();

    // 서버 응답엔 name이 없어서(굳이 돌려줄 이유가 없음) 방금 입력한 값을 그대로 쓴다.
    // textContent라서 <script> 같은 걸 입력해도 문자 그대로만 표시되고 실행되지 않는다.
    resultNameEl.textContent = `"${name}" 채널이 만들어졌습니다`;

    // adminUrl은 어디에도 저장하지 않고 화면에만 한 번 띄운다(CH-03: 생성 시 1회 표시).
    // localStorage 등에 자동으로 남겨두면, 같은 브라우저를 쓰는 다른 사람이 나중에
    // 채널 관리 권한을 그대로 가져갈 수 있다.
    qrImg.src = `/channels/${channel.channelId}/qr`;
    channelCodeEl.textContent = channel.code;
    adminLinkEl.href = channel.adminUrl;
    adminLinkEl.textContent = channel.adminUrl;

    form.hidden = true;
    resultEl.hidden = false;
    statusEl.textContent = "";
  } catch (err) {
    console.error("채널 생성 실패:", err);
    statusEl.textContent = "채널 생성 실패 (네트워크 오류)";
  } finally {
    createBtn.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  createChannel();
});

copyAdminBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(adminLinkEl.href);
    copyStatusEl.textContent = "복사됨";
  } catch (err) {
    console.error("복사 실패:", err);
    copyStatusEl.textContent = "복사 실패 — 링크를 직접 선택해 복사하세요.";
  }
});
