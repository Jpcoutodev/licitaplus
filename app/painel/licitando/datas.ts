/**
 * Datas dos prazos de proposta, no horário de Brasília.
 *
 * Como o dado está gravado: o PNCP publica a hora de Brasília SEM fuso
 * ("2026-08-14T08:50") e a coleta grava a string como está numa coluna
 * timestamptz — o Postgres então a interpreta como UTC. Conferido contra o
 * PNCP: uma licitação publicada para 08:50 de Brasília está no banco como
 * 08:50Z. Ou seja, o instante armazenado carrega o relógio de parede de
 * Brasília, não o instante real.
 *
 * Consequência para a leitura: os prazos são formatados em UTC e rotulados
 * como Brasília, que é exatamente a hora impressa no edital. Converter para
 * America/Sao_Paulo mostraria três horas menos (08:50 viraria 05:50) e, num
 * prazo de madrugada, jogaria a licitação para o dia anterior no calendário.
 *
 * Já `hojeEmBrasilia` é outra coisa: "agora" é um instante de verdade, então
 * ali o fuso de Brasília é o certo.
 */

/** Prazos do PNCP: relógio de parede de Brasília guardado como UTC. */
const FUSO_PRAZO = "UTC";
const FUSO_REAL = "America/Sao_Paulo";

const FORMATO_DIA_PRAZO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_PRAZO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FORMATO_DATA_HORA_PRAZO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_PRAZO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const FORMATO_DIA_REAL = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_REAL,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
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

/** Chave "AAAA-MM-DD" do dia do prazo — é o que casa com o calendário. */
export function diaDoPrazo(iso: string | null): string | null {
  const d = paraData(iso);
  if (!d) return null;
  const p = partes(FORMATO_DIA_PRAZO, d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Mesma chave, montada a partir de um quadradinho do calendário. */
export function chaveDoDia(ano: number, mes: number, dia: number): string {
  const mm = String(mes + 1).padStart(2, "0");
  const dd = String(dia).padStart(2, "0");
  return `${ano}-${mm}-${dd}`;
}

/** "14/08/2026 08:50" — a hora que consta no edital. */
export function dataHoraDoPrazo(iso: string | null): string {
  const d = paraData(iso);
  if (!d) return "não informada";
  const p = partes(FORMATO_DATA_HORA_PRAZO, d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Dia de hoje em Brasília (instante real), na mesma chave do calendário. */
export function hojeEmBrasilia(): string {
  const p = partes(FORMATO_DIA_REAL, new Date());
  return `${p.year}-${p.month}-${p.day}`;
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
 * comparação com as licitações acontece pela chave.
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
