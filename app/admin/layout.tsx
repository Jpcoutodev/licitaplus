import { redirect } from "next/navigation";
import Link from "next/link";
import { criarClientServidor } from "@/lib/supabase/server";
import { Logo } from "../logo";

export const metadata = { robots: { index: false, follow: false } };

/**
 * Área interna da equipe — fora do fluxo do cliente de propósito.
 *
 * O portão é este layout (sessão + tabela admins) e, no banco, cada função de
 * leads confere admin outra vez. Redundância intencional: se algum dia esta
 * rota vazar, o banco continua fechado.
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

  const { data: admin } = await supabase
    .from("admins")
    .select("email")
    .eq("email", user.email ?? "")
    .maybeSingle();
  if (!admin) redirect("/painel");

  return (
    <div className="admin-area">
      <header className="admin-topo">
        <div className="container admin-topo-linha">
          <Link href="/painel" aria-label="SentinelaGov">
            <Logo tamanho={26} />
          </Link>
          <span className="etiqueta admin-etiqueta">Interno · equipe</span>
          <nav className="admin-nav">
            <Link href="/admin/leads">Leads</Link>
            <Link href="/painel/metricas">Métricas</Link>
            <Link href="/painel">Voltar ao painel</Link>
          </nav>
        </div>
      </header>
      <main className="container admin-conteudo">{children}</main>
    </div>
  );
}
