import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { assinaturaConta, totaisConta } from "../lib/contasClientes";
import { dataDocumento } from "../lib/documentoCliente";
import { dinheiro } from "../lib/formatacao";
import { consultarContaFicha, type ContaFicha } from "../services/contaFichaCliente";
import { Dialogo } from "./Dialogo";
import "./ContaFichaCliente.css";

export function ContaFichaCliente({
  cliente,
  nome,
  fechar,
}: {
  cliente: string;
  nome: string;
  fechar: () => void;
}) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: [
      "conta-ficha",
      a.demo,
      a.usuario,
      a.oficina?.id,
      a.oficina?.recursos,
      cliente,
    ],
    queryFn: () => consultarContaFicha(a, cliente),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  return (
    <Dialogo
      aberto
      titulo={`Conta de ${nome}`}
      fechar={fechar}
      classe="conta-ficha-dialogo"
    >
      {q.isPending ? (
        <p role="status">Consultando as OS e os pagamentos…</p>
      ) : q.isError ? (
        <div>
          <p role="alert">{erroPublico(q.error)}</p>
          <button className="botao-secundario" onClick={() => void q.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <SelecaoConta
          key={`${a.oficina?.id}:${cliente}`}
          cliente={cliente}
          inicial={q.data}
        />
      )}
    </Dialogo>
  );
}
function SelecaoConta({ cliente, inicial }: { cliente: string; inicial: ContaFicha }) {
  const a = useAcesso();
  const [dados, setDados] = useState(inicial),
    [pagina, setPagina] = useState(0);
  const [ids, setIds] = useState(() => inicial.ordens.map((o) => o.id));
  const [busy, setBusy] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const trava = useRef(false),
    ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);
  const idsSelecionados = useMemo(() => new Set(ids), [ids]);
  const selecionadas = useMemo(
    () => dados.ordens.filter((o) => idsSelecionados.has(o.id)),
    [dados.ordens, idsSelecionados],
  );
  const total = useMemo(() => totaisConta(selecionadas), [selecionadas]);
  async function executar(fn: () => Promise<void>) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      await fn();
    } catch (e) {
      if (ativo.current) setErro(erroPublico(e));
    } finally {
      trava.current = false;
      if (ativo.current) setBusy(false);
    }
  }
  async function mais() {
    await executar(async () => {
      const r = await consultarContaFicha(a, cliente, pagina + 1);
      if (!ativo.current) return;
      const existentes = new Set(dados.ordens.map((o) => o.id));
      const novos = r.ordens.filter((o) => !existentes.has(o.id));
      setDados({ ...r, ordens: [...dados.ordens, ...novos] });
      setPagina(pagina + 1);
      setIds((at) => [...at, ...novos.map((o) => o.id)].slice(0, 500));
    });
  }
  async function gerar() {
    if (!selecionadas.length) return;
    await executar(async () => {
      const r = await consultarContaFicha(a, cliente, 0, ids);
      if (!ativo.current) return;
      if (assinaturaConta(selecionadas) !== assinaturaConta(r.ordens)) {
        setDados((at) => ({
          ...at,
          consultado_em: r.consultado_em,
          hoje: r.hoje,
          identidade: r.identidade,
          total: Math.max(0, at.total - ids.length + r.ordens.length),
          ordens: at.ordens.filter((o) => !idsSelecionados.has(o.id)).concat(r.ordens),
        }));
        setIds(r.ordens.map((o) => o.id));
        setAviso(
          "Os pagamentos ou as OS mudaram. Confira o total atualizado e gere o PDF novamente.",
        );
        return;
      }
      const { gerarPdfContaCliente } = await import("../services/pdfContaCliente");
      if (!ativo.current) return;
      const nome = r.ordens[0].cliente
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .slice(0, 65);
      gerarPdfContaCliente(r.ordens, r.identidade, r.consultado_em, r.hoje).save(
        `conta-${nome}-${r.hoje}.pdf`,
      );
      setAviso("PDF baixado. Agora é só anexar e enviar ao cliente.");
    });
  }
  return (
    <div className="conta-ficha">
      <p className="conta-ficha-ajuda">
        Marque as OS que entram na conta. Os pagamentos já estão descontados.
      </p>
      <div className="conta-ficha-resumo">
        <span>
          Saldo selecionado<strong>{dinheiro(total.aberto)}</strong>
        </span>
        <span>
          {ids.length} OS selecionada{ids.length === 1 ? "" : "s"}
          <small>{dados.total} com saldo em aberto</small>
        </span>
      </div>
      {!!dados.ordens.length && (
        <div className="conta-ficha-selecao">
          <button
            className="botao-secundario"
            disabled={busy || (!ids.length && dados.ordens.length > 500)}
            onClick={() => setIds(ids.length ? [] : dados.ordens.map((o) => o.id))}
          >
            {ids.length ? "Desmarcar todas" : "Selecionar exibidas"}
          </button>
          <span>
            {dados.ordens.length} OS exibida{dados.ordens.length === 1 ? "" : "s"}
          </span>
        </div>
      )}
      <div className="conta-ficha-lista">
        {dados.ordens.map((o) => (
          <label
            className={`conta-ficha-linha ${idsSelecionados.has(o.id) ? "marcada" : ""}`}
            key={o.id}
          >
            <input
              type="checkbox"
              aria-label={`Incluir OS ${o.numero}`}
              disabled={busy || (!idsSelecionados.has(o.id) && ids.length >= 500)}
              checked={idsSelecionados.has(o.id)}
              onChange={(e) =>
                setIds((at) =>
                  e.target.checked ? [...at, o.id] : at.filter((id) => id !== o.id),
                )
              }
            />
            <span className="conta-ficha-descricao">
              <strong>
                OS #{o.numero}
                <small>{dataDocumento(o.data, false)}</small>
              </strong>
              <span>
                {[o.veiculo, o.placa].filter(Boolean).join(" · ") ||
                  "Serviço sem identificação"}
              </span>
              {o.servicos && <small>{o.servicos}</small>}
              <small>
                Valor {dinheiro(o.total_centavos)} · Pago {dinheiro(o.pago_centavos)}
              </small>
            </span>
            <span className="conta-ficha-valor">
              <strong>{dinheiro(o.aberto_centavos)}</strong>
              <small>em aberto</small>
            </span>
          </label>
        ))}
      </div>
      {!dados.ordens.length && (
        <p className="conta-ficha-vazia">
          Este cliente não tem cobranças de OS em aberto.
        </p>
      )}
      {dados.ordens.length < dados.total && (
        <button
          className="botao-secundario"
          disabled={busy}
          onClick={() => void mais()}
        >
          Carregar mais OS
        </button>
      )}
      {dados.ordens.length > 500 && <p>Selecione até 500 OS por PDF.</p>}
      <small className="conta-ficha-ajuda">
        Cobranças canceladas, provisórias e OS já quitadas ficam fora desta conta.
      </small>
      {erro && <p role="alert">{erro}</p>}
      {aviso && <p role="status">{aviso}</p>}
      <footer className="conta-ficha-rodape">
        <span>
          Total a pagar<strong>{dinheiro(total.aberto)}</strong>
        </span>
        <button
          className="botao-primario"
          disabled={busy || !selecionadas.length}
          onClick={() => void gerar()}
        >
          <Download size={18} />
          {busy ? "Conferindo…" : "Baixar conta em PDF"}
        </button>
      </footer>
    </div>
  );
}
