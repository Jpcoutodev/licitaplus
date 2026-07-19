/* Service worker do Licitaplus: habilita o PWA e recebe web push. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

// Pass-through (sem cache agressivo, para nunca servir versão velha do app).
self.addEventListener("fetch", () => {});

// Recebe a notificação push (Web Push nativo) e exibe.
self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : "" };
  }

  const titulo = dados.titulo || "Licitaplus";
  const opcoes = {
    body: dados.corpo || "Você tem novidades no Licitaplus.",
    icon: "/icone-192",
    badge: "/icone-192",
    data: { url: dados.url || "/painel" },
    tag: dados.tag || "licitaplus",
  };

  evento.waitUntil(self.registration.showNotification(titulo, opcoes));
});

// Clique na notificação: foca uma aba aberta ou abre o painel.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) ||
    "/painel";

  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (janelas) => {
        for (const janela of janelas) {
          if ("focus" in janela) {
            janela.navigate?.(destino);
            return janela.focus();
          }
        }
        return self.clients.openWindow(destino);
      },
    ),
  );
});
