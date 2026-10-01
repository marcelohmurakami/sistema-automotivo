import { useState } from "react";
import { Plus, Trash2, ArrowUpRight, FileText } from "lucide-react";
import { catalogo, moeda } from "../data/demonstracao";
import type { Orcamento } from "../data/demonstracao";

export function NovoOrcamento({
  salvar,
}: {
  salvar: (dados: Omit<Orcamento, "id">) => void;
}) {
  const [itens, setItens] = useState<{ descricao: string; valor: number }[]>(
    [],
  );
  const [escolha, setEscolha] = useState("0");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        salvar({
          cliente: String(dados.get("cliente")).trim(),
          placa: String(dados.get("placa")).trim().toUpperCase(),
          descricao: itens.map((i) => i.descricao).join(" + "),
          valor: itens.reduce((s, i) => s + i.valor, 0),
          situacao: "Rascunho",
          itens,
        });
      }}
    >
      <div className="aviso-demo">
        <FileText size={17} />
        <span>Rascunho demonstrativo. Nenhuma mensagem será enviada.</span>
      </div>
      <div className="etapa-formulario">
        <span>01</span>
        <div>
          <h3>Quem vamos atender?</h3>
          <p>Comece pelo cliente e pela placa.</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Nome do cliente
          <input
            name="cliente"
            placeholder="Ex.: João da Silva"
            required
            maxLength={100}
            pattern=".*\S.*"
            autoComplete="name"
          />
        </label>
        <label>
          Placa do veículo
          <input
            name="placa"
            placeholder="ABC1D23"
            required
            minLength={7}
            maxLength={8}
            pattern="[A-Za-z]{3}-?[0-9][A-Za-z0-9][0-9]{2}"
            title="Informe uma placa como ABC1234 ou ABC1D23"
            className="uppercase"
          />
        </label>
      </div>
      <div className="etapa-formulario">
        <span>02</span>
        <div>
          <h3>Peças e serviços</h3>
          <p>Seus itens frequentes, a um toque.</p>
        </div>
      </div>
      <div className="adicionar-item">
        <label className="sr-only" htmlFor="item-catalogo">
          Selecione o serviço ou produto
        </label>
        <select
          id="item-catalogo"
          value={escolha}
          onChange={(e) => setEscolha(e.target.value)}
        >
          {catalogo.map((item, i) => (
            <option key={item.nome} value={i}>
              {item.nome} · {moeda(item.valor)}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Adicionar item ao orçamento"
          className="botao-secundario"
          onClick={() => {
            const item = catalogo[Number(escolha)];
            setItens([...itens, { descricao: item.nome, valor: item.valor }]);
          }}
        >
          <Plus size={18} />
          <span>Adicionar</span>
        </button>
      </div>
      <div className="itens-orcamento">
        {itens.length === 0 ? (
          <p className="texto-suave">
            Adicione um item para montar o orçamento.
          </p>
        ) : (
          itens.map((item, i) => (
            <div className="linha-item" key={`${item.descricao}-${i}`}>
              <span>{item.descricao}</span>
              <strong>{moeda(item.valor)}</strong>
              <button
                type="button"
                className="botao-icone"
                aria-label={`Remover ${item.descricao}`}
                onClick={() =>
                  setItens(itens.filter((_, indice) => indice !== i))
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="total-orcamento">
        <span>Total do orçamento</span>
        <strong>{moeda(itens.reduce((s, i) => s + i.valor, 0))}</strong>
      </div>
      <button
        type="submit"
        className="botao-primario w-full"
        disabled={!itens.length}
      >
        Salvar rascunho de demonstração
        <ArrowUpRight size={18} />
      </button>
      <p className="nota-formulario">
        Os dados ficam apenas nesta sessão de visualização.
      </p>
    </form>
  );
}
