"use client";

import { useState } from "react";
import Link from "next/link";
import { criarClientNavegador } from "@/lib/supabase/client";
import { Logo } from "../logo";

const ETAPAS = [
  "Análise do edital e da viabilidade",
  "Documentação e habilitação",
  "Elaboração e envio da proposta",
  "Acompanhamento da sessão e lances",
  "Recursos e impugnações, quando cabíveis",
];

export default function PaginaConsultoria() {
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (nome.trim().length < 2 || telefone.replace(/\D/g, "").length < 8) {
      setErro("Informe seu nome e um telefone válido com DDD.");
      return;
    }
    setEnviando(true);
    try {
      const supabase = criarClientNavegador();
      const { data, error } = await supabase.functions.invoke("consultoria", {
        body: { nome, empresa, telefone, email, mensagem, website },
      });
      if (error || (data as { erro?: string })?.erro) {
        throw new Error((data as { erro?: string })?.erro ?? error?.message);
      }
      setEnviado(true);
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `Não foi possível enviar: ${excecao.message}`
          : "Não foi possível enviar. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: "40px auto", padding: "0 20px" }}>
      <p style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <Link href="/" aria-label="SentinelaGov">
          <Logo />
        </Link>
      </p>

      {enviado ? (
        <div className="cartao" style={{ textAlign: "center" }}>
          <h1 style={{ marginBottom: 10 }}>Recebemos seu pedido! ✅</h1>
          <p className="texto-suave">
            Um consultor vai entrar em contato pelo telefone informado em breve.
          </p>
          <p style={{ marginTop: 18 }}>
            <Link href="/" className="botao botao-secundario">
              Voltar ao início
            </Link>
          </p>
        </div>
      ) : (
        <>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <span className="etiqueta etiqueta-nova">Consultoria</span>
            <h1 style={{ margin: "10px 0 8px" }}>
              Um especialista cuida de todas as etapas
            </h1>
            <p className="texto-suave">
              Deixe seus dados e um consultor entra em contato para entender sua
              necessidade e apresentar uma proposta.
            </p>
          </div>

          <div className="cartao">
            <p className="texto-suave" style={{ marginTop: 0, marginBottom: 10 }}>
              O que a consultoria acompanha:
            </p>
            <ul className="plano-itens" style={{ marginBottom: 4 }}>
              {ETAPAS.map((e) => (
                <li key={e}>✔ {e}</li>
              ))}
            </ul>
          </div>

          <form className="cartao" onSubmit={enviar}>
            <div className="campo">
              <label htmlFor="c-nome">Seu nome *</label>
              <input
                id="c-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="c-empresa">Empresa</label>
              <input
                id="c-empresa"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="c-tel">Telefone / WhatsApp (com DDD) *</label>
              <input
                id="c-tel"
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(11) 99999-9999"
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="c-email">Email</label>
              <input
                id="c-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="c-msg">Como podemos ajudar?</label>
              <textarea
                id="c-msg"
                rows={3}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Conte um pouco do seu ramo e do que precisa"
              />
            </div>

            {/* honeypot anti-bot: escondido de humanos */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              style={{ position: "absolute", left: "-9999px" }}
            />

            {erro && <p className="mensagem-erro">{erro}</p>}
            <button type="submit" className="botao" disabled={enviando}>
              {enviando ? "Enviando..." : "Falar com um consultor"}
            </button>
          </form>

          <p className="texto-suave" style={{ textAlign: "center", fontSize: 13 }}>
            <Link href="/">← Voltar ao início</Link>
          </p>
        </>
      )}
    </div>
  );
}
