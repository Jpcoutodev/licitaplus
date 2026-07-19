"use client";

import { useEffect, useState } from "react";
import { criarClientNavegador } from "@/lib/supabase/client";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Ativa/desativa push (Web Push nativo) neste aparelho. */
export function PushToggle() {
  const [suportado, setSuportado] = useState(true);
  const [ativo, setAtivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string }>({});

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !VAPID
    ) {
      setSuportado(false);
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setAtivo(Boolean(sub)))
      .catch(() => {});
  }, []);

  async function ativar() {
    setOcupado(true);
    setMsg({});
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setMsg({ erro: "Permissão de notificação negada pelo navegador." });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ParaUint8(VAPID) as BufferSource,
      });
      const dados = sub.toJSON();
      const supabase = criarClientNavegador();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("sessão expirada");

      const { error } = await supabase.from("push_assinaturas").upsert(
        {
          user_id: user.id,
          endpoint: dados.endpoint,
          p256dh: dados.keys?.p256dh,
          auth: dados.keys?.auth,
        },
        { onConflict: "endpoint" },
      );
      if (error) throw new Error(error.message);
      setAtivo(true);
      setMsg({ ok: "Notificações ativadas neste aparelho." });
    } catch (erro) {
      setMsg({
        erro: erro instanceof Error
          ? `Não foi possível ativar: ${erro.message}`
          : "Não foi possível ativar.",
      });
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    setMsg({});
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const supabase = criarClientNavegador();
        await supabase
          .from("push_assinaturas")
          .delete()
          .eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setAtivo(false);
      setMsg({ ok: "Notificações desativadas neste aparelho." });
    } catch (erro) {
      setMsg({
        erro: erro instanceof Error ? erro.message : "Erro ao desativar.",
      });
    } finally {
      setOcupado(false);
    }
  }

  if (!suportado) {
    return (
      <p className="texto-suave" style={{ marginTop: 6 }}>
        Este navegador não suporta notificações push. No iPhone, instale o app
        (Compartilhar → Adicionar à Tela de Início) e abra por lá.
      </p>
    );
  }

  return (
    <>
      <p className="texto-suave" style={{ marginTop: 6 }}>
        {ativo
          ? "Você recebe notificações de novas licitações neste aparelho."
          : "Receba um aviso no aparelho quando surgir uma licitação compatível — além do email."}
      </p>
      <p style={{ marginTop: 12 }}>
        <button
          type="button"
          className={ativo ? "botao botao-secundario" : "botao"}
          onClick={ativo ? desativar : ativar}
          disabled={ocupado}
        >
          {ocupado
            ? "Aguarde..."
            : ativo
              ? "Desativar notificações"
              : "Ativar notificações"}
        </button>
      </p>
      {msg.erro && <p className="mensagem-erro">{msg.erro}</p>}
      {msg.ok && <p className="mensagem-sucesso">{msg.ok}</p>}
    </>
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
