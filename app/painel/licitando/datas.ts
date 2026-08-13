/**
 * Datas da aba Licitando, sempre no fuso de Brasília.
 *
 * Os prazos do PNCP são publicados em horário de Brasília e guardados como
 * timestamptz. Se o agrupamento por dia usasse o fuso do navegador, uma
 * licitação que encerra 25/08 às 08:00 cairia no dia 24 para quem estiver a
 * oeste — o calendário marcaria o quadradinho errado. Por isso tanto o rótulo
 * quanto a chave do dia saem daqui, com o fuso fixo.
 */

export const FUSO_BRASILIA = "America/Sao_Paulo";

const FORMATO_DIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_BRASILIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FORMATO_DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_BRASILIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function partes(
  formato: Intl.DateTimeFormat,
  data: Date,
): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const parte of formato.formatToParts(data)) mapa[parte.type] = parte.value;
  return mapa;
}

function paraData(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Chave "AAAA-MM-DD" do dia em Brasília — é o que casa com o calendário. */
export function diaEmBrasilia(iso: string | null): string | null {
  const d = paraData(iso);
  if (!d) return null;
  const p = partes(FORMATO_DIA, d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Mesma chave, montada a partir de um quadradinho do calendário. */
export function chaveDoDia(ano: number, mes: number, dia: number): string {
  const mm = String(mes + 1).padStart(2, "0");
  const dd = String(dia).padStart(2, "0");
  return `${ano}-${mm}-${dd}`;
}

/** "25/08/2026 08:00" — o formato que o PNCP publica. */
export function dataHoraEmBrasilia(iso: string | null): string {
  const d = paraData(iso);
  if (!d) return "não informada";
  const p = partes(FORMATO_DATA_HORA, d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Dia de hoje em Brasília, na mesma chave. */
export function hojeEmBrasilia(): string {
  return diaEmBrasilia(new Date().toISOString()) as string;
}

/** "25 de agosto de 2026" — para o título da lista filtrada. */
export function diaPorExtenso(chave: string): string {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1].toLowerCase()} de ${ano}`;
}

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * Grade do mês: começa no domingo da semana do dia 1 e vai até completar a
 * última semana. Só aritmética de calendário (dia/mês/ano), sem fuso: a
 * comparação com as licitações acontece pela chave, que já vem em Brasília.
 */
export function gradeDoMes(
  ano: number,
  mes: number,
): Array<Array<{ dia: number; doMes: boolean; chave: string }>> {
  const primeiro = new Date(ano, mes, 1);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  // 4 a 6 semanas, conforme o dia da semana em que o mês começa.
  const total = Math.ceil((primeiro.getDay() + diasNoMes) / 7);

  const cursor = new Date(ano, mes, 1 - primeiro.getDay());
  const semanas: Array<Array<{ dia: number; doMes: boolean; chave: string }>> = [];

  for (let s = 0; s < total; s += 1) {
    const semana = [];
    for (let i = 0; i < 7; i += 1) {
      semana.push({
        dia: cursor.getDate(),
        doMes: cursor.getMonth() === mes,
        chave: chaveDoDia(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate(),
        ),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    semanas.push(semana);
  }
  return semanas;
}
