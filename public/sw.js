/* Service worker do SentinelaGov: habilita o PWA e recebe web push. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

// Sem handler de "fetch" de propósito: nada é cacheado aqui (para nunca servir
// versão velha do app) e um handler vazio só faria o navegador acordar o
// service worker a cada navegação — é o que o Chrome sinaliza como no-op.

// Recebe a notificação push (Web Push nativo) e exibe.
self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : "" };
  }

  const titulo = dados.titulo || "SentinelaGov";
  const opcoes = {
    body: dados.corpo || "Você tem novidades no SentinelaGov.",
    // Com a extensão. Sem ela o caminho dava 404 e o navegador caía no ícone
    // genérico dele — a notificação chegava sem a marca.
    icon: "/icone-192.png",
    badge: "/icone-192.png",
    data: { url: dados.url || "/painel" },
    tag: dados.tag || "sentinelagov",
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
