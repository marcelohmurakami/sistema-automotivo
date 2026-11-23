import "./NavegacaoFinanceiro.css";

const grupos = [
  {
    nome: "Dia a dia",
    itens: [
      ["visao", "Resumo"],
      ["contas", "A pagar e receber"],
      ["bancos", "Contas bancárias"],
      ["conciliacao", "Conciliação"],
      ["recorrencias", "Contas mensais"],
      ["contratos", "Cobranças de contratos"],
    ],
  },
  {
    nome: "Análise e gestão",
    itens: [
      ["resultado", "Resultado completo"],
      ["os", "Por serviço"],
      ["comissoes", "Comissões"],
      ["custos", "Custos e margens"],
      ["precos", "Preço e hora"],
    ],
  },
];
const principais = ["visao", "contas", "recorrencias", "bancos", "resultado"];

export function NavegacaoFinanceiro({
  aba,
  automotivo,
  selecionar,
}: {
  aba: string;
  automotivo: boolean;
  selecionar: (aba: string) => void;
}) {
  const opcoes = grupos.map((g) => ({
    ...g,
    itens: g.itens.filter(([id]) =>
      automotivo ? id !== "contratos" : !["os", "comissoes"].includes(id),
    ),
  }));
  return (
    <nav className="fin-navegacao" aria-label="Visões do financeiro">
      <div className="fin-navegacao-direta">
        {opcoes
          .flatMap((g) => g.itens)
          .filter(([id]) => principais.includes(id))
          .map(([id, nome]) => (
            <button
              key={id}
              aria-current={aba === id ? "page" : undefined}
              onClick={() => selecionar(id)}
            >
              {nome}
            </button>
          ))}
      </div>
      <label className="fin-navegacao-outras">
        <span>Mais opções</span>
        <select
          aria-label="Outras consultas do financeiro"
          value={principais.includes(aba) ? "" : aba}
          onChange={(e) => selecionar(e.target.value)}
        >
          <option value="" disabled>
            Escolher consulta
          </option>
          {opcoes.map((g) => (
            <optgroup key={g.nome} label={g.nome}>
              {g.itens
                .filter(([id]) => !principais.includes(id))
                .map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="fin-navegacao-celular">
        <span>O que você quer consultar?</span>
        <select value={aba} onChange={(e) => selecionar(e.target.value)}>
          {opcoes.map((g) => (
            <optgroup key={g.nome} label={g.nome}>
              {g.itens.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </nav>
  );
}
