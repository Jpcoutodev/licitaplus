/**
 * Validação de CPF e CNPJ com dígitos verificadores (mod 11). Usada no
 * onboarding para impedir documento inventado; a unicidade (anti-burla de
 * trial) fica no banco (índice único em contas.cpf_cnpj).
 */

/** Remove tudo que não é dígito. */
export function normalizarDocumento(entrada: string): string {
  return entrada.replace(/\D/g, "");
}

function todosIguais(s: string): boolean {
  return s.split("").every((c) => c === s[0]);
}

function validarCpf(cpf: string): boolean {
  if (cpf.length !== 11 || todosIguais(cpf)) return false;
  for (const posicao of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < posicao; i++) {
      soma += Number(cpf[i]) * (posicao + 1 - i);
    }
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(cpf[posicao])) return false;
  }
  return true;
}

function validarCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14 || todosIguais(cnpj)) return false;
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, ...pesos1];
  for (const [posicao, pesos] of [[12, pesos1], [13, pesos2]] as const) {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += Number(cnpj[i]) * pesos[i];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(cnpj[posicao])) return false;
  }
  return true;
}

/** Valida um CPF (11 dígitos) ou CNPJ (14). Aceita com ou sem máscara. */
export function validarCpfCnpj(entrada: string): boolean {
  const doc = normalizarDocumento(entrada);
  if (doc.length === 11) return validarCpf(doc);
  if (doc.length === 14) return validarCnpj(doc);
  return false;
}

/** Formata para exibição: 000.000.000-00 ou 00.000.000/0000-00. */
export function formatarDocumento(doc: string): string {
  const d = normalizarDocumento(doc);
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return doc;
}
