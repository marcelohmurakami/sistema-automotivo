import { useState, type FormEvent } from "react";
import { Dialogo } from "../Dialogo";
import { atendeClientes, corFuncionario } from "../../lib/gestaoFuncionario";
import { camposFichaFuncionario } from "../../lib/camposFichaFuncionario";
import type { Funcionario } from "../../services/funcionarios";

export default function FormularioFuncionario({
  f,
  ocupado,
  erro,
  salvar,
  fechar,
}: {
  f: Funcionario;
  ocupado: boolean;
  erro: string;
  salvar: (f: Funcionario) => Promise<void>;
  fechar: () => void;
}) {
  const [validacao, setValidacao] = useState("");
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget),
      texto = (k: string) => String(d.get(k) ?? "").trim();
    if (
      texto("admissao") &&
      texto("desligamento") &&
      texto("desligamento") < texto("admissao")
    ) {
      setValidacao("Desligamento anterior à admissão.");
      return;
    }
    if (!texto("nome")) {
      setValidacao("Informe o nome do funcionário.");
      return;
    }
    setValidacao("");
    void salvar({
      ...f,
      nome: texto("nome"),
      funcao: texto("funcao"),
      telefone: texto("telefone"),
      email: texto("email"),
      ativo: d.has("ativo"),
      admissao: texto("admissao") || null,
      desligamento: texto("desligamento") || null,
      salario_centavos: texto("salario")
        ? Math.round(Number(texto("salario")) * 100)
        : null,
      observacoes: texto("observacoes"),
      dados: {
        ...f.dados,
        ...Object.fromEntries(
          camposFichaFuncionario.map(([k]) => [k, texto(`dados_${k}`)]),
        ),
        atende_clientes: String(d.has("atende_clientes")),
        cor_agenda: texto("cor_agenda"),
      },
    });
  }
  return (
    <Dialogo
      aberto
      fechar={fechar}
      titulo={f.revisao ? "Editar funcionário" : "Novo funcionário"}
      classe="dialogo-func-form"
    >
      <form onSubmit={enviar} className="func-corpo">
        <p className="func-intro">
          Comece pelo nome. Os demais dados podem ser preenchidos depois.
        </p>
        <fieldset disabled={ocupado} className="func-form-grid">
          <label className="func-largura">
            Nome completo *
            <input
              name="nome"
              required
              maxLength={160}
              defaultValue={f.nome}
              autoFocus
              autoComplete="name"
            />
          </label>
          <label>
            Cargo ou função
            <input
              name="funcao"
              maxLength={120}
              defaultValue={f.funcao}
              placeholder="Ex.: técnico, recepcionista"
            />
          </label>
          <label>
            Telefone
            <input
              name="telefone"
              type="tel"
              maxLength={40}
              defaultValue={f.telefone}
              autoComplete="tel"
            />
          </label>
          <label className="func-largura">
            E-mail
            <input
              name="email"
              type="email"
              maxLength={200}
              defaultValue={f.email}
              autoComplete="email"
            />
            <small>
              Contato do funcionário. O acesso ao sistema é configurado separadamente.
            </small>
          </label>
          <div className="func-opcoes func-largura">
            <label className="func-check">
              <input
                name="atende_clientes"
                type="checkbox"
                defaultChecked={atendeClientes(f)}
              />
              Realiza atendimentos
            </label>
            <label className="func-check">
              <input name="ativo" type="checkbox" defaultChecked={f.ativo} />
              Funcionário ativo
            </label>
          </div>
          <details className="func-detalhes func-largura" open={f.revisao > 0}>
            <summary>
              Dados adicionais <span>Documento, contratação e observações</span>
            </summary>
            <div className="func-form-grid">
              {camposFichaFuncionario.slice(0, 2).map(([k, rotulo, tipo]) => (
                <label key={k}>
                  {rotulo}
                  <input
                    name={`dados_${k}`}
                    type={tipo}
                    maxLength={160}
                    defaultValue={f.dados?.[k] ?? ""}
                  />
                </label>
              ))}
              <label>
                Admissão
                <input name="admissao" type="date" defaultValue={f.admissao ?? ""} />
              </label>
              <label>
                Desligamento
                <input
                  name="desligamento"
                  type="date"
                  defaultValue={f.desligamento ?? ""}
                />
              </label>
              <label>
                Cor na agenda
                <input
                  name="cor_agenda"
                  type="color"
                  defaultValue={corFuncionario(f)}
                />
              </label>
              <label>
                Salário-base (R$)
                <input
                  name="salario"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={
                    f.salario_centavos == null ? "" : f.salario_centavos / 100
                  }
                />
              </label>
              <label className="func-largura">
                Endereço
                <input
                  name="dados_endereco"
                  maxLength={500}
                  defaultValue={f.dados?.endereco ?? ""}
                />
              </label>
              <label className="func-largura">
                Observações
                <textarea
                  name="observacoes"
                  rows={3}
                  maxLength={2000}
                  defaultValue={f.observacoes}
                />
              </label>
              <details className="func-detalhes func-largura">
                <summary>Outros dados da ficha</summary>
                <div className="func-form-grid">
                  {camposFichaFuncionario.slice(3).map(([k, rotulo, tipo]) => (
                    <label key={k}>
                      {rotulo}
                      <input
                        name={`dados_${k}`}
                        type={tipo}
                        maxLength={500}
                        defaultValue={f.dados?.[k] ?? ""}
                      />
                    </label>
                  ))}
                </div>
              </details>
            </div>
          </details>
        </fieldset>
        {(erro || validacao) && (
          <p role="alert" className="erro-formulario">
            {validacao || erro}
          </p>
        )}
        <footer className="func-rodape">
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado}
            onClick={fechar}
          >
            Cancelar
          </button>
          <button className="botao-primario" disabled={ocupado}>
            {ocupado ? "Salvando…" : "Salvar funcionário"}
          </button>
        </footer>
      </form>
    </Dialogo>
  );
}
