import { novoId } from "../lib/uuid.ts";
import { rpc } from "../lib/rpc";
import { dinheiro } from "../lib/formatacao";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { atualizarConsultas } from "../lib/atualizarConsultas";

import { Dialogo } from "./Dialogo";
import "../pages/OficinaAgil.css";
const rotulos: Record<string, string> = {
  nome: "Nome",
  telefone_e164: "Telefone",
  email: "E-mail",
  endereco: "Endereço",
  observacoes: "Observações",
  tipo: "Tipo",
  descricao: "Descrição",
  unidade: "Unidade",
  preco_padrao_centavos: "Preço",
  favorito: "Favorito",
};
function valorPrevia(chave: string, valor: unknown) {
  if (chave === "preco_padrao_centavos") return dinheiro(Number(valor));
  if (chave === "favorito") return valor ? "Sim" : "Não";
  if (chave === "tipo")
    return (
      (
        {
          service: "Serviço",
          part: "Peça",
          pessoa_fisica: "Pessoa física",
          pessoa_juridica: "Empresa",
        } as Record<string, string>
      )[String(valor)] || String(valor)
    );
  return valor ? String(valor) : "—";
}
export function ImportarCadastros({
  tipo,
  somenteServicos = false,
}: {
  tipo: "clientes" | "catalogo";
  somenteServicos?: boolean;
}) {
  const a = useAcesso(),
    cache = useQueryClient(),
    [aberto, setAberto] = useState(false),
    [linhas, setLinhas] = useState<Record<string, unknown>[]>([]),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [resultado, setResultado] = useState(""),
    [chave, setChave] = useState(() => novoId());
  function modelo() {
    const s =
      tipo === "clientes"
        ? "nome;telefone;email;endereco;observacoes\nCliente de exemplo;16999990000;cliente@example.com;Rua Exemplo, 10;Prefere contato à tarde\n"
        : somenteServicos
          ? "descricao;tipo;unidade;preco;favorito\nTroca de óleo;servico;serv;80,00;sim\n"
          : "descricao;tipo;unidade;preco;favorito\nTroca de óleo;servico;un;80,00;sim\nFiltro de óleo;peca;un;35,90;nao\n";
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + s], { type: "text/csv;charset=utf-8" }),
    );
    const el = document.createElement("a");
    el.href = url;
    el.download = `modelo-${tipo}.csv`;
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <button
        className="botao-secundario"
        onClick={() => {
          setAberto(true);
          setResultado("");
          setErro("");
        }}
      >
        Importar{" "}
        {tipo === "clientes" ? "clientes" : somenteServicos ? "serviços" : "catálogo"}
      </button>
      <Dialogo
        aberto={aberto}
        titulo={`Importar ${tipo === "clientes" ? "clientes" : somenteServicos ? "serviços" : "serviços e peças"}`}
        fechar={() => !busy && setAberto(false)}
      >
        <div className="agil-pagina">
          <p>
            1. Baixe o modelo. 2. Preencha no Excel ou Google Planilhas e salve em CSV.
            3. Confira antes de importar.
          </p>
          <button className="botao-secundario" onClick={modelo}>
            Baixar planilha modelo
          </button>
          <label>
            Planilha CSV · até 500 linhas
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={async (e) => {
                setErro("");
                setResultado("");
                setLinhas([]);
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 3_000_000) throw new Error("Arquivo acima de 3 MB.");
                  const { lerCSV, prepararCadastros } =
                    await import("../lib/importacao");
                  const dados = prepararCadastros(lerCSV(await f.text()), tipo);
                  if (somenteServicos && dados.some((r) => r.tipo !== "service"))
                    throw new Error(
                      "Importe somente serviços aqui. Cadastre as peças no estoque.",
                    );
                  setLinhas(dados);
                  setChave(novoId());
                } catch (e) {
                  setErro(erroPublico(e));
                }
              }}
            />
          </label>
          {linhas.length > 0 && (
            <>
              <p>
                <strong>{linhas.length} registros prontos para conferir.</strong>{" "}
                Cadastros equivalentes serão ignorados; os existentes não serão
                sobrescritos.
              </p>
              <div className="agil-tabela">
                <table>
                  <thead>
                    <tr>
                      {Object.keys(linhas[0]).map((k) => (
                        <th key={k}>{rotulos[k] || k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.slice(0, 20).map((r, n) => (
                      <tr key={n}>
                        {Object.entries(r).map(([k, v]) => (
                          <td key={k}>{valorPrevia(k, v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {linhas.length > 20 && (
                <small>Prévia das primeiras 20 linhas. Todas foram validadas.</small>
              )}
              <button
                className="botao-primario"
                disabled={busy || a.demo || a.oficina!.perfil === "staff"}
                onClick={async () => {
                  setBusy(true);
                  setErro("");
                  try {
                    const r = await rpc<{
                      importados: number;
                      ignorados: number;
                      repetida?: boolean;
                    }>("importar_cadastros", {
                      p_oficina: a.oficina!.id,
                      p_chave: chave,
                      p_tipo: tipo,
                      p_linhas: linhas,
                    });
                    await atualizarConsultas(
                      cache,
                      [
                        ["clientes"],
                        ["catalogo"],
                        ["auxiliares"],
                        ["onboarding-agil"],
                        ["selecao-operacao"],
                      ],
                      [[tipo]],
                    );
                    setResultado(
                      r.repetida
                        ? "Este arquivo já foi importado. Nenhum registro foi duplicado."
                        : `${r.importados} importados e ${r.ignorados} existentes ignorados.`,
                    );
                    setLinhas([]);
                  } catch (e) {
                    setErro(erroPublico(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Importando…" : "Conferi. Importar cadastros"}
              </button>
            </>
          )}
          {a.demo && <p>Importação disponível na conta real.</p>}
          {erro && (
            <p role="alert" className="agil-alerta">
              {erro}
            </p>
          )}
          {resultado && (
            <p role="status" className="agil-ok">
              {resultado}
            </p>
          )}
        </div>
      </Dialogo>
    </>
  );
}
