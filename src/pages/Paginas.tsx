import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CarFront,
  ChevronRight,
  FileText,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Store,
  Users,
  Wrench,
} from "lucide-react";
import { catalogo, etapas, moeda, normalizar } from "../data/demonstracao";
import { useOficina } from "../layouts/contexto";
import { Dialogo } from "../components/Dialogo";
import type { Orcamento } from "../data/demonstracao";

const titulos = {
  orcamentos: ["Orçamentos", "Propostas claras. Aprovações mais rápidas."],
  "ordens-servico": [
    "Ordens de serviço",
    "Cada serviço, do primeiro diagnóstico à entrega.",
  ],
  clientes: [
    "Clientes e veículos",
    "Conheça quem confia o carro à sua oficina.",
  ],
  catalogo: [
    "Peças e serviços",
    "Seu catálogo pronto para o próximo orçamento.",
  ],
};
export function PaginaRegistros({ tipo }: { tipo: keyof typeof titulos }) {
  const { veiculos, orcamentos, abrirOrcamento, abrirVeiculo } = useOficina();
  const [parametros, setParametros] = useSearchParams();
  const busca = parametros.get("busca") ?? "";
  const [detalhe, setDetalhe] = useState<Orcamento | null>(null);
  const inclui = (texto: string) =>
    normalizar(texto).includes(normalizar(busca));
  const registros = veiculos.filter((v) =>
    inclui(`${v.modelo} ${v.placa} ${v.cliente} ${v.id}`),
  );
  const propostas = orcamentos.filter((o) =>
    inclui(`${o.placa} ${o.cliente} ${o.id} ${o.descricao}`),
  );
  const produtos = catalogo.filter((c) => inclui(`${c.nome} ${c.tipo}`));
  const quantidade =
    tipo === "orcamentos"
      ? propostas.length
      : tipo === "catalogo"
        ? produtos.length
        : registros.length;
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" /> SUA OFICINA, MAIS SIMPLES
          </div>
          <h1>
            {titulos[tipo][0]}
            <span>.</span>
          </h1>
          <p>{titulos[tipo][1]}</p>
        </div>
        <button className="botao-primario" onClick={abrirOrcamento}>
          <Plus size={19} />
          Novo orçamento
          <ArrowUpRight size={17} />
        </button>
      </div>
      <section className="painel-registros">
        <div className="registros-cabecalho">
          <div>
            <h2>
              {tipo === "catalogo"
                ? "Seu catálogo"
                : tipo === "clientes"
                  ? "Seus clientes"
                  : "Visão geral"}{" "}
              <span className="contagem-total">{quantidade}</span>
            </h2>
            <p>Dados de demonstração para explorar o layout.</p>
          </div>
          <label className="campo-busca">
            <Search size={17} />
            <input
              aria-label="Buscar registros"
              placeholder="Buscar nesta página..."
              value={busca}
              onChange={(e) =>
                setParametros(e.target.value ? { busca: e.target.value } : {})
              }
            />
          </label>
        </div>
        {quantidade === 0 ? (
          <div className="estado-vazio">
            <Search size={32} />
            <h3>Nenhum resultado encontrado</h3>
            <p>Experimente buscar por outro nome ou placa.</p>
            <button
              className="botao-secundario"
              onClick={() => setParametros({})}
            >
              Limpar busca
            </button>
          </div>
        ) : tipo === "catalogo" ? (
          <div className="catalogo-grid">
            {produtos.map((item) => (
              <article className="produto" key={item.nome}>
                <span
                  className={`icone-suave ${item.tipo === "Serviço" ? "azul" : "verde"}`}
                >
                  {item.tipo === "Serviço" ? (
                    <Wrench size={22} />
                  ) : (
                    <Package size={22} />
                  )}
                </span>
                <small>{item.tipo}</small>
                <h3>{item.nome}</h3>
                <div>
                  <strong>{moeda(item.valor)}</strong>
                  <span>/ {item.unidade}</span>
                </div>
                <button className="botao-secundario" onClick={abrirOrcamento}>
                  Montar orçamento
                  <Plus size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : tipo === "clientes" ? (
          <div className="clientes-grid">
            {registros.map((v) => (
              <button
                className="cliente-perfil"
                key={v.id}
                onClick={() => abrirVeiculo(v)}
              >
                <span className={`avatar-cliente ${v.cor}`}>
                  {v.cliente
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <h3>{v.cliente}</h3>
                  <p>
                    <CarFront size={14} />
                    {v.modelo}
                  </p>
                  <span className="placa">{v.placa}</span>
                </div>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <div className="tabela-scroll">
            <table className="tabela-registros">
              <caption className="sr-only">
                {titulos[tipo][0]} de demonstração
              </caption>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente / veículo</th>
                  <th>Serviço</th>
                  <th>Situação</th>
                  <th>Valor</th>
                  <th>
                    <span className="sr-only">Detalhes</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tipo === "orcamentos"
                  ? propostas.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <span className="identificador-registro">
                            <FileText size={17} />#{o.id}
                          </span>
                        </td>
                        <td>
                          <strong>{o.cliente}</strong>
                          <small>{o.placa}</small>
                        </td>
                        <td>{o.descricao}</td>
                        <td>
                          <span
                            className={`etiqueta-etapa ${o.situacao === "Aprovado" ? "pronto" : o.situacao === "Rascunho" ? "recepcao" : "aguardando"}`}
                          >
                            {o.situacao}
                          </span>
                        </td>
                        <td className="valor-tabela">{moeda(o.valor)}</td>
                        <td>
                          <button
                            className="botao-icone"
                            aria-label={`Ver orçamento ${o.id}`}
                            onClick={() => setDetalhe(o)}
                          >
                            <ArrowUpRight size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  : registros.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <span className="identificador-registro">
                            #{v.id}
                          </span>
                        </td>
                        <td>
                          <strong>{v.modelo}</strong>
                          <small>
                            {v.cliente} · {v.placa}
                          </small>
                        </td>
                        <td>{v.servico}</td>
                        <td>
                          <span className={`etiqueta-etapa ${v.etapa}`}>
                            {etapas.find((e) => e.id === v.etapa)?.nome}
                          </span>
                        </td>
                        <td className="valor-tabela">{moeda(v.valor)}</td>
                        <td>
                          <button
                            className="botao-icone"
                            aria-label={`Ver ordem de serviço ${v.id}`}
                            onClick={() => abrirVeiculo(v)}
                          >
                            <ArrowUpRight size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="nota-pagina">
        <ShieldCheck size={16} />
        Este esboço usa dados fictícios. Cadastros reais serão conectados ao
        Supabase na próxima etapa.
      </div>
      <Dialogo
        aberto={detalhe !== null}
        fechar={() => setDetalhe(null)}
        titulo={`Orçamento #${detalhe?.id ?? ""}`}
      >
        {detalhe && (
          <>
            <div className="aviso-demo">{detalhe.situacao} · Demonstração</div>
            <dl className="detalhes-grade">
              <div>
                <dt>Cliente</dt>
                <dd>{detalhe.cliente}</dd>
              </div>
              <div>
                <dt>Placa</dt>
                <dd>{detalhe.placa}</dd>
              </div>
            </dl>
            <p>{detalhe.descricao}</p>
            <div className="total-orcamento">
              <span>Total</span>
              <strong>{moeda(detalhe.valor)}</strong>
            </div>
            <p className="texto-suave">
              Geração de PDF e envio pelo WhatsApp serão integrados em uma
              próxima etapa.
            </p>
          </>
        )}
      </Dialogo>
    </>
  );
}
export function Configuracoes() {
  const { nomeOficina, definirOficina, avisar } = useOficina();
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" /> DO SEU JEITO
          </div>
          <h1>
            Sua oficina<span>.</span>
          </h1>
          <p>Uma experiência com a identidade de quem está no comando.</p>
        </div>
      </div>
      <div className="config-grid">
        <form
          className="painel-config"
          onSubmit={(e) => {
            e.preventDefault();
            definirOficina(
              String(new FormData(e.currentTarget).get("nome")).trim(),
            );
            avisar("Nome atualizado nesta demonstração.");
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="icone-suave verde">
              <Store size={24} />
            </span>
            <div>
              <h2>Dados da oficina</h2>
              <p className="texto-suave">Personalize a visualização.</p>
            </div>
          </div>
          <label>
            Nome da oficina
            <input
              name="nome"
              defaultValue={nomeOficina}
              required
              maxLength={60}
              pattern=".*\S.*"
            />
          </label>
          <label>
            Cidade
            <input value="Franca, SP" readOnly />
          </label>
          <button className="botao-primario mt-6" type="submit">
            Salvar visualização
            <ArrowUpRight size={17} />
          </button>
          <p className="nota-formulario">
            Alteração local, válida até recarregar a página.
          </p>
        </form>
        <div className="painel-config">
          <span className="icone-suave azul mb-5">
            <Users size={24} />
          </span>
          <h2>Feito para a sua equipe</h2>
          <p className="texto-suave mt-3">
            A mesma oficina na tela do computador e na palma da mão. Acesso por
            perfil e separação dos dados já estão previstos no banco.
          </p>
          <div className="aviso-demo mt-6">
            Gestão de equipe, assinatura e personalização completa serão
            conectadas nas próximas etapas.
          </div>
        </div>
      </div>
    </>
  );
}
export function PaginaNaoEncontrada() {
  return (
    <div className="estado-vazio pagina-404">
      <CarFront size={46} />
      <h1>Essa vaga está vazia.</h1>
      <p>A página que você procurou não foi encontrada.</p>
      <Link to="/" className="botao-primario">
        <ArrowLeft size={18} />
        Voltar para a oficina
      </Link>
    </div>
  );
}
