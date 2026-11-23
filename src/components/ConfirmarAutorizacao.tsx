import { useState } from "react";
import { dinheiro } from "../lib/formatacao";

export type ManifestacaoEquipe = { nome: string; canal: string; confirmo: boolean };
export function ConfirmarAutorizacao({
  nomeInicial,
  total,
  ocupado,
  confirmar,
}: {
  nomeInicial: string;
  total: number;
  ocupado: boolean;
  confirmar: (m: ManifestacaoEquipe) => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [canal, setCanal] = useState("presencial");
  const [confirmo, setConfirmo] = useState(false);
  return (
    <form
      className="formulario-cliente"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmo && nome.trim().length >= 2 && !ocupado)
          confirmar({ nome: nome.trim(), canal, confirmo });
      }}
    >
      <p>
        Valor autorizado: <strong>{dinheiro(total)}</strong>
      </p>
      <div className="form-grid">
        <label>
          Quem autorizou?
          <input
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              setConfirmo(false);
            }}
            required
            minLength={2}
            maxLength={160}
            disabled={ocupado}
          />
        </label>
        <label>
          Como o cliente autorizou?
          <select
            value={canal}
            disabled={ocupado}
            onChange={(e) => {
              setCanal(e.target.value);
              setConfirmo(false);
            }}
          >
            <option value="presencial">Presencialmente</option>
            <option value="telefone">Telefone</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">E-mail</option>
          </select>
        </label>
      </div>
      <label className="aprovacao-confirmar">
        <input
          type="checkbox"
          checked={confirmo}
          disabled={ocupado}
          onChange={(e) => setConfirmo(e.target.checked)}
        />
        Confirmo que o cliente autorizou os itens e o valor desta versão.
      </label>
      <button
        className="botao-primario"
        disabled={ocupado || !confirmo || nome.trim().length < 2}
      >
        {ocupado ? "Registrando…" : "Registrar autorização"}
      </button>
    </form>
  );
}
