/* Sotos — service worker: avisos aunque Sotos esté cerrado y app instalable · © 2026 Sebastian Sotomontes */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Sotos", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Sotos", {
    body: d.body || "", icon: "/iconos/sotos-192.png", badge: "/iconos/sotos-maskable-192.png", tag: d.id || undefined, data: { link: d.link || null },
  }));
});
// al tocar el aviso: si Sotos ya está abierto se enfoca y va al lugar; si no, se abre
self.addEventListener("notificationclick", (e) => {
  e.notification.close(); const link = e.notification.data && e.notification.data.link;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const c = all.find(w => new URL(w.url).origin === self.location.origin);
    if (c) { await c.focus(); if (link) c.postMessage({ type: "sotos-open-link", link }); return; }
    await self.clients.openWindow("/" + (link ? "#abrir=" + encodeURIComponent(JSON.stringify(link)) : ""));
  })());
});
