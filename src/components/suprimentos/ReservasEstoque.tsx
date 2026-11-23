import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { suprimentos, type ReservaItem } from "../../services/suprimentos";
import { Dialogo } from "../Dialogo";
import { SeletorUnidades } from "./Unidades";
import { EstadoConsulta } from "./Comum";
import { numero, useSuprimentos, passoProduto } from "./helpers";
import "./Suprimentos.css";
import { EscolherDeposito } from "./Depositos";
export function ReservasEstoque({
  documento,
  ramo,
  bloqueado = false,
}: {
  documento: string;
  ramo: "os" | "atendimento";
  bloqueado?: boolean;
}) {
  const { a, w, erro, ocupado, executar } = useSuprimentos();
  const [alvo, setAlvo] = useState<ReservaItem | null>(null),
    [deposito, setDeposito] = useState<string | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [quantidade, setQuantidade] = useState(1);
  const q = useQuery({
    queryKey: ["suprimentos", "reservas", w, documento, ramo],
    queryFn: () => suprimentos.reservas(w, documento, ramo),
    enabled: !a.demo && a.permite("inventory"),
  });
  if (a.demo || !a.permite("inventory")) return null;
  async function reservar(
    i: ReservaItem,
    n: number,
    unidades: string[] = [],
    local: string | null = i.deposito_id ?? null,
  ) {
    return executar(() =>
      suprimentos.executar(w, "reservar_estoque_deposito", {
        p_deposito: local,
        p_documento: documento,
        p_ramo: ramo,
        p_item: i.item_id,
        p_quantidade: n,
        p_revisao: q.data!.revisao,
        p_unidades: unidades,
        p_reserva_revisao: i.reserva_revisao,
      }),
    );
  }
  return (
    <section className="supr supr-painel">
      <div className="supr-barra">
        <h3>Reserva de materiais</h3>
        <small>O saldo fica separado para este atendimento.</small>
      </div>
      <EstadoConsulta loading={q.isPending} error={q.error} />
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {q.data?.itens.length === 0 && (
        <p>Adicione um material do estoque para reservar.</p>
      )}
      {q.data?.itens.map((i) => (
        <div className="supr-linha" key={i.item_id}>
          <div>
            <strong>{i.descricao}</strong>
            <small>
              {numero(i.reservado)} de {numero(i.quantidade)} reservados ·{" "}
              {numero(i.disponivel)} livres
            </small>
            {i.unidades.length > 0 && (
              <small>{i.unidades.map((u) => u.serie).join(", ")}</small>
            )}
          </div>
          <div className="supr-barra">
            {i.ativo && !bloqueado && (
              <>
                <button
                  disabled={ocupado}
                  onClick={() => {
                    setAlvo(i);
                    setDeposito(i.deposito_id ?? null);
                    setIds(i.unidades.map((u) => u.id));
                    setQuantidade(i.reservado || i.quantidade);
                  }}
                >
                  {i.rastreado
                    ? "Selecionar unidades"
                    : i.reservado
                      ? "Alterar reserva"
                      : "Reservar"}
                </button>
                {!i.rastreado && !i.reservado && i.disponivel >= i.quantidade && (
                  <button
                    disabled={ocupado}
                    onClick={() => void reservar(i, i.quantidade)}
                  >
                    Reservar tudo
                  </button>
                )}
                {i.reservado > 0 && (
                  <button disabled={ocupado} onClick={() => void reservar(i, 0)}>
                    Liberar
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
      <Dialogo
        aberto={!!alvo}
        fechar={() => !ocupado && setAlvo(null)}
        titulo="Separar material para este atendimento"
      >
        {alvo && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await reservar(
                  alvo,
                  alvo.rastreado ? ids.length : quantidade,
                  ids,
                  deposito,
                )
              )
                setAlvo(null);
            }}
          >
            <fieldset disabled={ocupado}>
              <h3>{alvo.descricao}</h3>
              <EscolherDeposito
                produto={alvo.produto_id}
                valor={deposito}
                alterar={(v) => {
                  setDeposito(v);
                  setIds([]);
                }}
              />
              <p>
                Necessário: {numero(alvo.quantidade)} · Disponível para esta reserva:{" "}
                {numero(alvo.disponivel + alvo.reservado)}
              </p>
              {alvo.rastreado ? (
                <SeletorUnidades
                  produto={alvo.produto_id}
                  deposito={deposito}
                  selecionados={ids}
                  alterar={setIds}
                  reserva={alvo.reserva_id}
                />
              ) : (
                <label>
                  Quantidade
                  <input
                    type="number"
                    min={passoProduto(alvo.unidade)}
                    step={passoProduto(alvo.unidade)}
                    max={Math.min(alvo.quantidade, alvo.disponivel + alvo.reservado)}
                    value={quantidade}
                    onChange={(e) => setQuantidade(Number(e.target.value))}
                    required
                  />
                </label>
              )}
              {erro && <p role="alert">{erro}</p>}
              <button
                className="botao-primario"
                disabled={
                  alvo.rastreado && (!ids.length || ids.length > alvo.quantidade)
                }
              >
                {ocupado ? "Reservando…" : "Confirmar reserva"}
              </button>
            </fieldset>
          </form>
        )}
      </Dialogo>
    </section>
  );
}
