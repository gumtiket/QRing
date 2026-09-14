self.addEventListener("install", () => {
  console.log("[sw] 설치됨");
  // 새 버전이 설치되면, 기존 탭이 안 닫혀도 대기하지 않고 바로 활성화 단계로 넘어간다.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[sw] 활성화됨");
  // 이미 열려있는 페이지들도, 새로고침 없이 지금 이 버전이 즉시 제어하게 만든다.
  event.waitUntil(clients.claim());
});

// 서버가 webpush.sendNotification()으로 보낸 푸시가 도착하면 여기가 실행된다.
// 페이지가 닫혀 있어도, 브라우저가 켜져 있기만 하면 실행됨 (서비스 워커의 핵심 기능).
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "QRing", body: "" };

  console.log("[sw] push 이벤트 수신:", data);

  // waitUntil로 감싸지 않으면, showNotification이 끝나기 전에
  // 브라우저가 서비스 워커를 재워버려서 알림이 안 뜰 수 있다.
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      actions: [{ action: "ack", title: "확인했어요" }],
      // notificationId/subscriptionId를 여기 담아두면, 나중에 이 알림이
      // 클릭될 때(초 단위든 몇 시간 뒤든) event.notification.data로 다시 꺼낼 수 있다.
      data: { notificationId: data.notificationId, subscriptionId: data.subscriptionId },
    })
  );
});

// 알림의 버튼을 누르든, 알림 본문을 누르든 여기가 실행된다.
// event.action으로 어느 쪽인지 구분한다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const { notificationId, subscriptionId } = event.notification.data;

  if (event.action === "ack") {
    // 버튼 경로: 앱을 열지 않고 그 자리에서 바로 서버에 응답
    event.waitUntil(
      fetch(`/public/subscriptions/${subscriptionId}/responses/${notificationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionKey: "ack" }),
      })
    );
  } else {
    // 본문 탭 경로: 알림 상세 화면을 열어서 사용자가 직접 확인 버튼을 누르게 함
    event.waitUntil(clients.openWindow(`/n/${notificationId}?sub=${subscriptionId}`));
  }
});
