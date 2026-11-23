import { novoId } from "../lib/uuid.ts";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { salvarCatalogo } from "../services/catalogo";
import { buscarCadastro } from "../services/consultasCadastros";
import type { Auxiliares } from "../services/orcamentos";
import { lerCatalogoDemo, type ItemCatalogo } from "../lib/catalogo";
import { erroPublico } from "../lib/supabase";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { CustoMargemItem } from "./CustoMargemItem";

export function CadastroServicoRapido({
  descricaoInicial,
  limiteAtingido,
  adicionar,
  aoProcessar,
}: {
  descricaoInicial: string;
  limiteAtingido: boolean;
  adicionar: (item: Auxiliares["catalogo"][number]) => void;
  aoProcessar: (ocupado: boolean) => void;
}) {
  const acesso = useAcesso(),
    cache = useQueryClient(),
    salvando = useRef(false);
  const [item, setItem] = useState<ItemCatalogo | null>(null);
  const [preco, setPreco] = useState("0"),
    [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false);
  if (!acesso.permite("catalog")) return null;

  async function salvar() {
    if (!item || salvando.current || limiteAtingido) return;
    setErro("");
    if (!item.descricao.trim() || !preco.trim() || !Number.isFinite(Number(preco))) {
      setErro("Informe o nome e o preço do serviço.");
      return;
    }
    const cadastro = {
      ...item,
      descricao: item.descricao.trim(),
      preco_padrao_centavos: Math.round(Number(preco) * 100),
    };
    salvando.current = true;
    setOcupado(true);
    aoProcessar(true);
    try {
      try {
        await salvarCatalogo(acesso.demo, acesso.oficina!.id, cadastro, true);
      } catch (falha) {
        // Recupera uma criação confirmada no servidor quando a resposta se perdeu.
        const existentes = acesso.demo
          ? lerCatalogoDemo(acesso.oficina!.id)
          : await buscarCadastro(acesso.oficina!.id, "catalogo", {
              id: cadastro.id,
            }).catch(() => []);
        const existente = existentes.find((i) => i.id === cadastro.id);
        if (
          !existente ||
          existente.arquivado_em ||
          existente.tipo !== cadastro.tipo ||
          existente.descricao !== cadastro.descricao ||
          existente.preco_padrao_centavos !== cadastro.preco_padrao_centavos ||
          (existente.custo_centavos ?? null) !== (cadastro.custo_centavos ?? null) ||
          existente.unidade !== cadastro.unidade
        )
          throw falha;
      }
      adicionar(cadastro);
      setItem(null);
      // O cadastro confirmado já foi incluído no formulário; listas secundárias
      // atualizam em paralelo sem impedir a inclusão do próximo serviço.
      await atualizarIntegracoes(cache, []);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      salvando.current = false;
      setOcupado(false);
      aoProcessar(false);
    }
  }

  return (
    <>
      <div className="atalhos-cadastro">
        <button
          type="button"
          disabled={limiteAtingido || ocupado}
          aria-expanded={!!item}
          onClick={() => {
            setErro("");
            setPreco("0");
            setItem(
              item
                ? null
                : {
                    id: novoId(),
                    descricao: descricaoInicial,
                    tipo: "service",
                    unidade: "serv",
                    preco_padrao_centavos: 0,
                    favorito: false,
                    arquivado_em: null,
                    revisao: 1,
                  },
            );
          }}
        >
          <Plus size={15} />
          Cadastrar serviço no catálogo
        </button>
      </div>
      {item && (
        <div
          className="cadastro-inline"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
              e.preventDefault();
              e.stopPropagation();
              void salvar();
            }
          }}
        >
          <strong>Novo serviço</strong>
          <p className="texto-suave">
            Fica disponível no catálogo para os próximos atendimentos.
          </p>
          <div className="dupla-campos">
            <label>
              Nome do serviço
              <input
                autoFocus
                value={item.descricao}
                maxLength={300}
                onChange={(e) => setItem({ ...item, descricao: e.target.value })}
              />
            </label>
            <label>
              Preço padrão (R$)
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
              />
            </label>
          </div>
          {acesso.oficina?.perfil !== "staff" && (
            <CustoMargemItem
              custo={item.custo_centavos}
              preco={Math.round(Number(preco) * 100)}
              alterar={(custo_centavos) => setItem({ ...item, custo_centavos })}
            />
          )}
          {erro && (
            <p className="erro-formulario" role="alert">
              {erro}
            </p>
          )}
          <div className="atalhos-cadastro">
            <button
              className="botao-secundario"
              type="button"
              disabled={ocupado || limiteAtingido}
              onClick={() => void salvar()}
            >
              {ocupado ? "Cadastrando…" : "Cadastrar e adicionar"}
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                setItem(null);
                setErro("");
              }}
            >
              Cancelar cadastro
            </button>
          </div>
        </div>
      )}
    </>
  );
}
