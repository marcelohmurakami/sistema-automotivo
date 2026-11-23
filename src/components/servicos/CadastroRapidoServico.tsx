import { novoId } from "../../lib/uuid.ts";
import { atualizarConsultas } from "../../lib/atualizarConsultas";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAcesso } from "../../auth/contexto";
import { interfaceRamo } from "../../lib/interfaceRamo";
import { ramos, type Ramo } from "../../lib/ramos";
import { erroPublico } from "../../lib/supabase";
import { salvarCliente, normalizarTelefone } from "../../services/clientes";
import { buscarSelecaoServicos } from "../../services/painelServicos";
import { gravarServico, type ObjetoServico } from "../../services/servicos";

/** Cria os vínculos sem desmontar o formulário ou perder a ficha em preenchimento. */
export function CadastroRapidoServico({
  ramo,
  especialidade,
  cliente,
  selecionarCliente,
  selecionarObjeto,
  aoAbrir,
}: {
  ramo: Ramo;
  especialidade: string;
  cliente: string;
  selecionarCliente: (id: string) => void;
  selecionarObjeto: (objeto: ObjetoServico) => void;
  aoAbrir: (aberto: boolean) => void;
}) {
  const a = useAcesso(),
    cache = useQueryClient(),
    oficina = a.oficina!.id;
  const linguagem = interfaceRamo(ramo, especialidade);
  const [painel, setPainel] = useState<"cliente" | "objeto" | null>(null);
  const [nome, setNome] = useState(""),
    [telefone, setTelefone] = useState("");
  const [objeto, setObjeto] = useState(""),
    [identificacao, setIdentificacao] = useState("");
  const [endereco, setEndereco] = useState(""),
    [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false),
    [aviso, setAviso] = useState("");
  const processando = useRef(false),
    objetoId = useRef(novoId());
  const emCampo = ramo === "manutencao_campo" || ramo === "limpeza";
  const nomeObjeto = ramos[ramo].objeto.toLocaleLowerCase("pt-BR");
  function abrir(p: typeof painel) {
    if (processando.current) return;
    setPainel(p);
    aoAbrir(!!p);
    setErro("");
    setAviso("");
  }
  async function cadastrar() {
    if (processando.current || !painel) return;
    processando.current = true;
    setOcupado(true);
    setErro("");
    try {
      if (painel === "cliente") {
        if (nome.trim().length < 2) throw Error("Informe o nome do cliente.");
        const c = await salvarCliente(a.demo, oficina, {
          nome: nome.trim(),
          telefone_e164: normalizarTelefone(telefone),
          email: "",
          tipo: "pessoa_fisica",
          endereco: "",
          observacoes: "",
        });
        cache.setQueryData(
          ["selecao-operacao", oficina, a.demo, "clientes", "", "id", c.id],
          [c],
        );
        selecionarCliente(c.id);
        setNome("");
        setTelefone("");
        setPainel("objeto");
        setAviso(`${c.nome} cadastrado e selecionado. Agora informe o ${nomeObjeto}.`);
      } else {
        if (!cliente) throw Error("Selecione o cliente primeiro.");
        if (objeto.trim().length < 2) throw Error(`Informe o nome do ${nomeObjeto}.`);
        if (emCampo && !endereco.trim())
          throw Error("Informe o endereço completo do atendimento.");
        const id = objetoId.current;
        await gravarServico(
          "salvar_objeto_atendimento",
          oficina,
          {
            p_id: id,
            p_dados: {
              cliente_id: cliente,
              nome: objeto.trim(),
              arquivado: false,
              dados: emCampo
                ? { endereco: endereco.trim() }
                : { serie: identificacao.trim() },
            },
          },
          a.demo,
        );
        const [registro] = await buscarSelecaoServicos(
          oficina,
          a.demo,
          "objetos",
          "",
          cliente,
          id,
        );
        if (!registro)
          throw Error("Cadastro salvo. Atualize a busca para selecioná-lo.");
        cache.setQueryData(
          ["selecao-operacao", oficina, a.demo, "objetos", cliente, "id", id],
          [registro],
        );
        selecionarObjeto(registro);
        setObjeto("");
        setIdentificacao("");
        setEndereco("");
        objetoId.current = novoId();
        setPainel(null);
        aoAbrir(false);
        setAviso(`${registro.nome} cadastrado e selecionado.`);
      }
      await atualizarConsultas(
        cache,
        [["selecao-operacao", oficina], ["servicos", oficina], ["clientes"]],
        [],
      );
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      processando.current = false;
      setOcupado(false);
    }
  }
  return (
    <section className="cadastro-rapido-servico" aria-label="Cadastro rápido">
      <div className="cadastro-rapido-acoes">
        <button
          type="button"
          className="botao-secundario"
          disabled={ocupado}
          onClick={() => abrir(painel === "cliente" ? null : "cliente")}
        >
          <Plus size={16} /> Novo cliente
        </button>
        <button
          type="button"
          className="botao-secundario"
          disabled={ocupado || !cliente}
          onClick={() => abrir(painel === "objeto" ? null : "objeto")}
        >
          <Plus size={16} /> Novo {nomeObjeto}
        </button>
      </div>
      {painel && (
        <fieldset
          key={painel}
          className="cadastro-rapido-campos"
          disabled={ocupado}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
              e.preventDefault();
              void cadastrar();
            }
          }}
        >
          <legend>
            {painel === "cliente" ? "Novo cliente" : `Novo ${nomeObjeto}`}
          </legend>
          {painel === "cliente" ? (
            <>
              <label>
                Nome do novo cliente
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={160}
                  autoFocus
                  autoComplete="off"
                />
              </label>
              <label>
                Telefone do novo cliente (opcional)
                <input
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  maxLength={24}
                  autoComplete="off"
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Nome do {nomeObjeto}
                <input
                  value={objeto}
                  onChange={(e) => setObjeto(e.target.value)}
                  maxLength={160}
                  autoFocus
                  placeholder={
                    linguagem.assistencia
                      ? linguagem.exemploEquipamento
                      : "Identificação do local ou bem atendido"
                  }
                />
              </label>
              {emCampo ? (
                <label>
                  Endereço completo
                  <input
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    maxLength={1500}
                  />
                </label>
              ) : (
                <label>
                  {linguagem.identificacao} (opcional)
                  <input
                    value={identificacao}
                    onChange={(e) => setIdentificacao(e.target.value)}
                    maxLength={1500}
                  />
                </label>
              )}
            </>
          )}
          <div className="cadastro-rapido-acoes">
            <button
              type="button"
              className="botao-primario"
              onClick={() => void cadastrar()}
            >
              {ocupado ? "Cadastrando…" : "Cadastrar e selecionar"}
            </button>
            <button
              type="button"
              className="botao-secundario"
              onClick={() => abrir(null)}
            >
              Cancelar cadastro
            </button>
          </div>
        </fieldset>
      )}
      {erro && (
        <p role="alert" className="mensagem-erro">
          {erro}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
    </section>
  );
}
