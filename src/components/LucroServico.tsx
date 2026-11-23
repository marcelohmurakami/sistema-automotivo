import { AjudaContextual } from "./AjudaContextual";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { dinheiro } from "../lib/formatacao";
import { erroPublico } from "../lib/supabase";
import { vocabularioEstoque } from "../lib/interfaceRamo";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { categoriasCusto } from "../services/custeio";
import {
  consultarLucroDocumento,
  salvarCustoItem,
  type ItemLucro,
} from "../services/lucroServico";
import { DetalheCusto } from "./financeiro/CustosServicos";
import { CustoMargemItem } from "./CustoMargemItem";
import "./LucroServico.css";

export function LucroServico({ id }: { id: string }) {
  const a = useAcesso(),
    qc = useQueryClient(),
    navegar = useNavigate();
  const estoque = vocabularioEstoque(a.oficina?.ramo);
  const [conferir, setConferir] = useState(false);
  const permitido = a.oficina?.perfil !== "staff" && a.permite("finance");
  const q = useQuery({
    queryKey: ["lucro-documento", a.oficina!.id, id],
    queryFn: () => consultarLucroDocumento(a.oficina!.id, id),
    enabled: permitido && !a.demo,
    refetchInterval: 30000,
  });
  if (!permitido) return null;
  if (a.demo)
    return (
      <p>
        O demonstrativo completo usa os custos e pagamentos da empresa conectada. Na
        demonstração, você pode preencher os custos no editor dos itens.
      </p>
    );
  if (q.isPending) return <p role="status">Calculando lucro e custos…</p>;
  if (q.isError)
    return (
      <div>
        <p role="alert">{erroPublico(q.error)}</p>
        <button onClick={() => void q.refetch()}>Tentar novamente</button>
      </div>
    );
  const d = q.data,
    desconsideradas = d.conferencia?.dados?.desconsideradas ?? {};
  const categorias: Record<string, number> = {};
  for (const f of d.fontes)
    if (!desconsideradas[f.chave])
      categorias[f.categoria] = (categorias[f.categoria] || 0) + (f.valor || 0);
  return (
    <section className="lucro-servico" aria-label="Lucro e custos da OS">
      <header>
        <h3>Lucro e custos</h3>
        <p>Valores internos desta OS. O desconto já está considerado.</p>
      </header>
      <div className="lucro-destaque" data-negativo={d.margem < 0}>
        <span>
          {d.conferido ? "Lucro após os custos conferidos" : "Lucro estimado"}
        </span>
        <strong>{dinheiro(d.margem)}</strong>
        <small>
          {d.receita > 0
            ? `${((d.margem / d.receita) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de margem · `
            : ""}
          {d.conferido ? "Custos conferidos" : "Ainda há custos a conferir"}
        </small>
      </div>
      <dl className="lucro-valores">
        <Linha
          nome={`Serviços e ${estoque.plural}, antes do desconto`}
          valor={d.bruto}
        />
        <Linha nome="Descontos e abatimentos" valor={-d.desconto} />
        <Linha nome="Valor final da OS" valor={d.receita} />
        <Linha nome="Já recebido (descontados os estornos)" valor={d.pago} />
        <Linha nome="Falta receber" valor={d.aberto} />
        {Object.entries(categoriasCusto)
          .filter(([k]) => categorias[k])
          .map(([k, n]) => (
            <Linha key={k} nome={n} valor={-(categorias[k] || 0)} />
          ))}
        {!!d.mao_obra_apropriada && (
          <Linha nome="Mão de obra apropriada" valor={-d.mao_obra_apropriada} />
        )}
        {!!d.indiretos && (
          <Linha nome="Despesas indiretas rateadas" valor={-d.indiretos} />
        )}
        <Linha nome="Total dos custos" valor={d.custo} />
        <Linha nome="Lucro: valor final menos custos" valor={d.margem} />
      </dl>
      <small>
        Resultado das vendas, não do caixa. Custos não registrados ou pendentes podem
        alterar o lucro.
      </small>
      <div className="plano-acoes">
        <button className="botao-secundario" onClick={() => setConferir(true)}>
          Conferir / adicionar outros custos
        </button>
      </div>
      <section className="lucro-itens">
        <h3>Margem por serviço e {estoque.singular}</h3>
        <AjudaContextual titulo="Como a margem é calculada">
          <p>
            O desconto é distribuído proporcionalmente entre os itens. A margem abaixo
            considera o custo direto; comissões, taxas e custos compartilhados entram no
            lucro da OS acima.
          </p>
        </AjudaContextual>
        {d.itens.map((i) => (
          <Item
            key={`${i.id}:${d.revisao}`}
            item={i}
            revisao={d.revisao}
            documento={id}
            atualizar={() => atualizarIntegracoes(qc)}
          />
        ))}
        {!d.itens.length && <p>Nenhum item registrado nesta OS.</p>}
      </section>
      {conferir && (
        <DetalheCusto
          id={id}
          fechar={() => {
            setConferir(false);
            void q.refetch();
          }}
          abrirParametros={() => navegar("/financeiro?aba=precos")}
        />
      )}
    </section>
  );
}
function Linha({ nome, valor }: { nome: string; valor: number }) {
  return (
    <div>
      <dt>{nome}</dt>
      <dd>{dinheiro(valor || 0)}</dd>
    </div>
  );
}
function Item({
  item: i,
  revisao,
  documento,
  atualizar,
}: {
  item: ItemLucro;
  revisao: number;
  documento: string;
  atualizar: () => Promise<unknown>;
}) {
  const a = useAcesso(),
    trava = useRef(false);
  const [editar, setEditar] = useState(false),
    [custo, setCusto] = useState<number | null>(i.custo_unitario),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false);
  async function salvar() {
    if (trava.current) return;
    if (
      custo !== null &&
      (!Number.isSafeInteger(custo) || custo < 0 || custo > 100000000)
    ) {
      setErro("Confira o custo unitário.");
      return;
    }
    trava.current = true;
    setBusy(true);
    setErro("");
    try {
      await salvarCustoItem(a.oficina!.id, documento, i.id, revisao, custo);
      setEditar(false);
      await atualizar();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  return (
    <article className="lucro-item">
      <header>
        <div>
          <strong>{i.descricao}</strong>
          <small>
            {i.quantidade} unidade(s) ·{" "}
            {i.custo_ajustado
              ? "Custo ajustado nesta OS"
              : i.origem === "estoque"
                ? "Custo do estoque"
                : "Custo do item"}
          </small>
        </div>
        {i.origem !== "cliente" && (
          <button
            className="botao-secundario"
            onClick={() => setEditar(!editar)}
            disabled={busy}
          >
            Ajustar custo
          </button>
        )}
      </header>
      <dl className="lucro-valores">
        <Linha nome="Venda após desconto" valor={i.receita} />
        <div>
          <dt>Custo direto</dt>
          <dd>{i.custo === null ? "Não informado" : dinheiro(i.custo)}</dd>
        </div>
        <div data-negativo={i.margem != null && i.margem < 0}>
          <dt>Margem do item</dt>
          <dd>{i.margem === null ? "Informe o custo" : dinheiro(i.margem)}</dd>
        </div>
      </dl>
      {editar && (
        <fieldset disabled={busy}>
          <CustoMargemItem
            aberta
            custo={custo}
            preco={i.preco}
            quantidade={i.quantidade}
            desconto={Math.round(i.quantidade * i.preco) - i.receita}
            alterar={setCusto}
          />
          <p>
            <small>
              Altera somente o custo desta OS, preservando o catálogo, o preço cobrado e
              os movimentos de estoque. Vazio remove o ajuste; itens do estoque voltam
              ao custo das movimentações.
            </small>
          </p>
          <button className="botao-primario" onClick={() => void salvar()}>
            {busy ? "Salvando…" : "Salvar custo nesta OS"}
          </button>
        </fieldset>
      )}
      {erro && <p role="alert">{erro}</p>}
    </article>
  );
}
