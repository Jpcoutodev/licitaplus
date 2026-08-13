import { redirect } from "next/navigation";
import Link from "next/link";
import { criarClientServidor } from "@/lib/supabase/server";
import { Logo } from "../logo";

export const metadata = { robots: { index: false, follow: false } };

/**
 * Área interna da equipe — fora do fluxo do cliente de propósito.
 *
 * O portão é este layout (sessão + tabela admins) e, no banco, cada função de
 * leads confere a equipe outra vez. Redundância intencional: se algum dia esta
 * rota vazar, o banco continua fechado.
 *
 * Testador entra aqui (Leads faz parte do teste), mas não recebe o atalho de
 * Métricas — lá estão os números do negócio, e o banco também recusa.
 */
export default async function LayoutAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await criarClientServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: equipe } = await supabase
    .from("admins")
    .select("papel")
    .eq("email", user.email ?? "")
    .maybeSingle();
  if (!equipe) redirect("/painel");
  const ehAdmin = equipe.papel !== "testador";

  return (
    <div className="admin-area">
      <header className="admin-topo">
        <div className="container admin-topo-linha">
          <Link href="/painel" aria-label="SentinelaGov">
            <Logo tamanho={26} />
          </Link>
          <span className="etiqueta admin-etiqueta">
            {ehAdmin ? "Interno · equipe" : "Interno · testador"}
          </span>
          <nav className="admin-nav">
            <Link href="/admin/leads">Leads</Link>
            {ehAdmin && <Link href="/painel/metricas">Métricas</Link>}
            <Link href="/painel">Voltar ao painel</Link>
          </nav>
        </div>
      </header>
      <main className="container admin-conteudo">{children}</main>
    </div>
  );
}
