const notificationId = location.pathname.split("/").pop();
const subscriptionId = new URLSearchParams(location.search).get("sub");

const titleEl = document.getElementById("title");
const bodyEl = document.getElementById("body");
const ackBtn = document.getElementById("ack-btn");
const statusEl = document.getElementById("status");

async function loadNotification() {
  const res = await fetch(`/public/notifications/${notificationId}`);

  if (!res.ok) {
    titleEl.textContent = "알림을 찾을 수 없습니다";
    return;
  }

  const notification = await res.json();
  titleEl.textContent = notification.title;
  bodyEl.textContent = notification.body;
  ackBtn.hidden = false;
}

ackBtn.addEventListener("click", async () => {
  const res = await fetch(`/public/subscriptions/${subscriptionId}/responses/${notificationId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionKey: "ack" }),
  });

  if (!res.ok) {
    statusEl.textContent = "응답 전송 실패";
    return;
  }

  statusEl.textContent = "확인 완료";
});

loadNotification();
