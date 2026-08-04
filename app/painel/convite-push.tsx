"use client";

import { useEffect, useState } from "react";
import { criarClientNavegador } from "@/lib/supabase/client";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const CHAVE_DISPENSA = "sg-convite-push-dispensado";

/**
 * Convite para ativar push, no topo do painel.
 *
 * O botão de ativar existe desde sempre, mas mora no terceiro cartão de
 * Configurações — e nenhum usuário real chegou a ativar. Um canal que
 * depende de a pessoa procurar por ele não é um canal.
 *
 * Aparece só quando faz sentido: navegador compatível, chave configurada,
 * ainda não inscrito e não dispensado antes. Some sozinho depois de ativar.
 */
export function ConvitePush() {
  const [mostrar, setMostrar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (
      !VAPID ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      localStorage.getItem(CHAVE_DISPENSA) === "1" ||
      Notification.permission === "denied"
    ) {
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setMostrar(!sub))
      .catch(() => {});
  }, []);

  function dispensar() {
    localStorage.setItem(CHAVE_DISPENSA, "1");
    setMostrar(false);
  }

  async function ativar() {
    setOcupado(true);
    setErro(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setErro(
          "O navegador bloqueou as notificações. Dá para liberar no cadeado ao lado do endereço.",
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ParaUint8(VAPID) as BufferSource,
      });
      const dados = sub.toJSON();
      const supabase = criarClientNavegador();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("sessão expirada");

      const { error } = await supabase.from("push_assinaturas").upsert({
        user_id: user.id,
        endpoint: dados.endpoint,
        p256dh: dados.keys?.p256dh,
        auth: dados.keys?.auth,
      }, { onConflict: "endpoint" });
      if (error) throw new Error(error.message);

      setPronto(true);
      setTimeout(() => setMostrar(false), 2600);
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `Não foi possível ativar: ${excecao.message}`
          : "Não foi possível ativar.",
      );
    } finally {
      setOcupado(false);
    }
  }

  if (!mostrar) return null;

  if (pronto) {
    return (
      <div className="convite-push convite-push--ok">
        <span aria-hidden>✅</span>
        <p className="sem-margem">
          Pronto — você será avisado no aparelho assim que surgir uma
          oportunidade.
        </p>
      </div>
    );
  }

  return (
    <div className="convite-push">
      <span className="convite-push-icone" aria-hidden>🔔</span>
      <div className="convite-push-texto">
        <strong>Quer saber na hora?</strong>
        <p className="texto-suave sem-margem">
          Licitação tem prazo curto. Ative o aviso no aparelho e não dependa de
          abrir o email — no máximo 3 por dia, sempre reunindo as novidades.
        </p>
        {erro && <p className="mensagem-erro">{erro}</p>}
      </div>
      <div className="convite-push-acoes">
        <button
          type="button"
          className="botao"
          onClick={ativar}
          disabled={ocupado}
        >
          {ocupado ? "Aguarde…" : "Ativar avisos"}
        </button>
        <button type="button" className="botao-fantasma" onClick={dispensar}>
          Agora não
        </button>
      </div>
    </div>
  );
}

/** Converte a chave VAPID (base64url) para o formato aceito pelo PushManager. */
function base64ParaUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const saida = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) saida[i] = raw.charCodeAt(i);
  return saida;
}
