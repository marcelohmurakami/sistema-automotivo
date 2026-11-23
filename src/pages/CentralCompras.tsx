import { lazy, Suspense } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import {
  destinoCompras,
  destinoSuprimentosAntigo,
  secaoCompras,
  secoesCompras,
  type SecaoCompras,
} from "../lib/navegacaoCompras";
import "./CentralCompras.css";

const ComprasRecebidas = lazy(() =>
  import("./Compras").then((m) => ({ default: m.Compras })),
);
const Suprimentos = lazy(() =>
  import("./Suprimentos").then((m) => ({ default: m.Suprimentos })),
);
const principais: SecaoCompras[] = ["recebidas", "pedidos", "cotacoes", "sugestoes"];

export function RedirecionarSuprimentos() {
  const local = useLocation();
  return <Navigate to={destinoSuprimentosAntigo(local.search) + local.hash} replace />;
}

export function CentralCompras() {
  const a = useAcesso();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const aba = secaoCompras(params);
  const gerente =
    a.oficina?.perfil !== "staff" && a.permite("finance") && a.permite("inventory");
  return (
    <div className="central-compras">
      <header className="central-compras-cabecalho">
        <div>
          <h1>
            Compras<span>.</span>
          </h1>
        </div>
        <div className="central-compras-atalhos">
          <Link to="/estoque">Estoque →</Link>
          <Link to="/fornecedores">Fornecedores →</Link>
        </div>
      </header>
      {gerente ? (
        <>
          <nav className="central-compras-abas" aria-label="Seções de compras">
            {principais.map((id) => (
              <Link
                key={id}
                to={destinoCompras(id)}
                aria-current={aba === id ? "page" : undefined}
              >
                {secoesCompras[id]}
              </Link>
            ))}
            <select
              aria-label="Mais opções de compras"
              className={
                !principais.includes(aba) ? "central-compras-selecao" : undefined
              }
              value={principais.includes(aba) ? "" : aba}
              onChange={(e) => navegar(destinoCompras(e.target.value as SecaoCompras))}
            >
              <option value="" disabled>
                Mais opções
              </option>
              <option value="devolucoes">Devoluções e créditos</option>
              <option value="catalogos">Catálogos dos fornecedores</option>
            </select>
          </nav>
          <section className="central-compras-conteudo" aria-label={secoesCompras[aba]}>
            <Suspense fallback={<p role="status">Carregando compras…</p>}>
              {aba === "recebidas" ? (
                <ComprasRecebidas integrada />
              ) : (
                <Suprimentos
                  aba={aba}
                  alterarAba={(id) => navegar(destinoCompras(id))}
                />
              )}
            </Suspense>
          </section>
        </>
      ) : (
        <p>
          O proprietário ou gerente pode acessar as compras com permissão para estoque e
          financeiro.
        </p>
      )}
    </div>
  );
}
