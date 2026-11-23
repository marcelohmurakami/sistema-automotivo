import { useState } from "react";
import "./CamposAtendimento.css";
export type DadosPagamentoAtendimento = {
  forma_pagamento?: string | null;
  vencimento_pagamento?: string | null;
};
export function CamposPagamentoAtendimento({
  inicial,
  alterar,
  vencimentoDireto = false,
}: {
  inicial?: DadosPagamentoAtendimento;
  alterar?: (dados: DadosPagamentoAtendimento) => void;
  vencimentoDireto?: boolean;
}) {
  const [forma, setForma] = useState(inicial?.forma_pagamento || "Carteira"),
    [data, setData] = useState(inicial?.vencimento_pagamento || ""),
    [manual, setManual] = useState(!!inicial?.vencimento_pagamento);
  const carteira = forma === "Carteira";
  const formas = [
    "Carteira",
    "Pix",
    "Cartão de débito",
    "Cartão de crédito",
    "Crédito parcelado",
    "Cheque",
    "Dinheiro",
  ];
  return (
    <>
      <div className="dupla-campos">
        <label>
          Forma de pagamento (opcional)
          <select
            name="forma_pagamento"
            aria-label="Forma de pagamento (opcional)"
            value={forma}
            onChange={(e) => {
              setForma(e.target.value);
              alterar?.({
                forma_pagamento: e.target.value,
                vencimento_pagamento:
                  e.target.value === "Carteira" && (manual || vencimentoDireto)
                    ? data
                    : null,
              });
            }}
          >
            {!formas.includes(forma) && <option>{forma}</option>}
            {formas.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        {carteira && vencimentoDireto ? (
          <label>
            Vencimento do pagamento (opcional)
            <input
              type="date"
              name="vencimento_pagamento"
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                alterar?.({
                  forma_pagamento: forma,
                  vencimento_pagamento: e.target.value || null,
                });
              }}
            />
          </label>
        ) : (
          carteira && (
            <label>
              Vencimento do pagamento (opcional)
              <select
                value={manual ? "data" : "automatico"}
                onChange={(e) => {
                  const m = e.target.value === "data";
                  setManual(m);
                  alterar?.({
                    forma_pagamento: forma,
                    vencimento_pagamento: m ? data : null,
                  });
                }}
              >
                <option value="automatico">Um mês após a conclusão do serviço</option>
                <option value="data">Escolher uma data</option>
              </select>
            </label>
          )
        )}
      </div>
      {vencimentoDireto ? null : carteira && manual ? (
        <label>
          Data de vencimento
          <input
            type="date"
            name="vencimento_pagamento"
            required
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              alterar?.({
                forma_pagamento: forma,
                vencimento_pagamento: e.target.value,
              });
            }}
          />
        </label>
      ) : (
        <input type="hidden" name="vencimento_pagamento" value="" />
      )}
    </>
  );
}

type DadosResponsavelPrioridade = {
  inicial?: { responsavel?: string | null; prioridade?: string };
  alterar?: (campo: "responsavel" | "prioridade", valor: string) => void;
};
export function CampoResponsavel({ inicial, alterar }: DadosResponsavelPrioridade) {
  return (
    <label>
      Responsável pelo serviço (opcional)
      <input
        name="responsavel"
        maxLength={160}
        defaultValue={inicial?.responsavel || ""}
        onChange={(e) => alterar?.("responsavel", e.target.value)}
      />
    </label>
  );
}
export function CampoPrioridade({ inicial, alterar }: DadosResponsavelPrioridade) {
  return (
    <fieldset className="atendimento-prioridade">
      <legend>Prioridade (opcional)</legend>
      <div className="atendimento-opcoes">
        {[
          ["low", "Baixa"],
          ["normal", "Normal"],
          ["high", "Alta"],
          ["urgent", "Urgente"],
        ].map(([valor, rotulo]) => (
          <label key={valor}>
            <input
              type="radio"
              name="prioridade"
              value={valor}
              defaultChecked={(inicial?.prioridade || "normal") === valor}
              onChange={() => alterar?.("prioridade", valor)}
            />
            {rotulo}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
