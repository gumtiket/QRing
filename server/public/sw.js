self.addEventListener("install", () => {
  console.log("[sw] 설치됨");
});

self.addEventListener("activate", () => {
  console.log("[sw] 활성화됨");
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
    })
  );
});

// 알림의 버튼을 누르든, 알림 본문을 누르든 여기가 실행된다.
// event.action으로 어느 쪽인지 구분한다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "ack") {
    // 버튼 경로: 앱을 열지 않고 그 자리에서 바로 서버에 응답
    event.waitUntil(
      fetch("/api/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ via: "button" }),
      })
    );
  } else {
    // 본문 탭 경로: 앱 화면을 열어서 사용자가 직접 확인 버튼을 누르게 함
    event.waitUntil(clients.openWindow("/"));
  }
});
