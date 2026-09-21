const form = document.getElementById("join-form");
const codeInput = document.getElementById("code-input");
const statusEl = document.getElementById("status");

// 채널 코드 문자셋(lib/channelCode.ts)과 맞춘다. 헷갈리기 쉬운 0/O/1/I는 애초에 안 쓰인다.
const CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = codeInput.value.trim().toUpperCase();

  if (!CODE_PATTERN.test(code)) {
    statusEl.textContent = "코드는 영문 대문자/숫자 6자리입니다 (0, O, 1, I 제외).";
    return;
  }

  location.href = `/c/${code}`;
});
