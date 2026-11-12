self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || "Você tem um compromisso próximo." };
  }

  const title = payload.title || "Lembrete da agenda";
  const options = {
    body: payload.body || "Você tem um compromisso próximo.",
    icon: "./assets/apple-touch-icon.png",
    badge: "./assets/apple-touch-icon.png",
    tag: payload.eventId ? `agenda-${payload.eventId}` : "agenda-lembrete",
    data: { url: payload.url || "./" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client && client.url !== destination) await client.navigate(destination);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(destination);
  })());
});
