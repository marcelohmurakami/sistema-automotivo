import type { Fornecedor } from "../../services/compras";
import { SecaoRecolhivel } from "../SecaoRecolhivel";
export function FormFornecedor({
  valor,
  ocupado,
  salvar,
}: {
  valor: Fornecedor;
  ocupado: boolean;
  salvar: (f: Fornecedor) => void;
}) {
  return (
    <form
      className="formulario-cliente"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        salvar({
          ...valor,
          nome: String(f.get("nome")).trim(),
          documento: String(f.get("documento")).replace(/\D/g, ""),
          telefone: String(f.get("telefone")),
          email: String(f.get("email")).trim(),
          endereco: String(f.get("endereco")),
          observacoes: String(f.get("observacoes")),
        });
      }}
    >
      <fieldset disabled={ocupado}>
        <label>
          Nome do fornecedor
          <input
            name="nome"
            defaultValue={valor.nome}
            minLength={2}
            maxLength={160}
            required
            autoFocus
          />
        </label>
        <SecaoRecolhivel titulo="Mais informações (opcional)">
          <div className="dupla-campos">
            <label>
              CNPJ ou CPF
              <input
                name="documento"
                inputMode="numeric"
                defaultValue={valor.documento}
                maxLength={25}
              />
            </label>
            <label>
              Telefone / WhatsApp
              <input
                type="tel"
                name="telefone"
                defaultValue={valor.telefone}
                placeholder="(16) 99999-9999"
              />
            </label>
          </div>
          <label>
            E-mail
            <input
              type="email"
              name="email"
              defaultValue={valor.email}
              maxLength={254}
            />
          </label>
          <label>
            Endereço
            <input name="endereco" defaultValue={valor.endereco} maxLength={500} />
          </label>
          <label>
            Observações
            <textarea
              name="observacoes"
              defaultValue={valor.observacoes}
              maxLength={2000}
              placeholder="Contato comercial, prazo habitual, informações úteis…"
            />
          </label>
        </SecaoRecolhivel>
        <button className="botao-primario" disabled={ocupado}>
          {ocupado ? "Salvando…" : "Salvar fornecedor"}
        </button>
      </fieldset>
    </form>
  );
}
