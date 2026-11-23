import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { ImportarCadastros } from "../components/ImportarCadastros";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import "./OficinaAgil.css";
export function Comecar() {
  const a = useAcesso();
  return (
    <div className="agil-pagina">
      <header className="agil-cabecalho">
        <div>
          <small>SEU PRIMEIRO ATENDIMENTO</small>
          <h1>
            Comece sem complicar<span>.</span>
          </h1>
          <p>
            Traga os cadastros que já tem e deixe os favoritos prontos para atender.
          </p>
        </div>
        <CheckCircle2 size={36} />
      </header>
      <div className="agil-cartoes">
        <section className="agil-card agil-passo">
          <span>1</span>
          <div>
            <h3>Deixe com a cara da sua empresa</h3>
            <p>Nome, telefone e logo aparecerão nos documentos entregues ao cliente.</p>
            <Link className="botao-secundario" to="/configuracoes">
              Conferir identidade <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
        <section className="agil-card agil-passo">
          <span>2</span>
          <div>
            <h3>Traga seus clientes</h3>
            <p>
              Já tem uma planilha? Importe em lote. Ou cadastre o primeiro cliente
              durante o atendimento.
            </p>
            <div className="agil-acoes">
              <ImportarCadastros tipo="clientes" />
              <Link to="/clientes">Ver clientes</Link>
            </div>
          </div>
        </section>
        <section className="agil-card agil-passo">
          <span>3</span>
          <div>
            <h3>Prepare peças e serviços</h3>
            <p>
              Cadastre seus preços e marque como favoritos os itens usados todos os
              dias.
            </p>
            <div className="agil-acoes">
              <ImportarCadastros tipo="catalogo" />
              <Link to="/catalogo">Organizar catálogo</Link>
            </div>
          </div>
        </section>
        <section className="agil-card agil-passo">
          <span>4</span>
          <div>
            <h3>Faça o primeiro atendimento</h3>
            <p>
              {a.permite("quotes")
                ? "Selecione o cliente, informe o que será atendido, escolha os serviços e confira o valor da proposta."
                : "Registre o cliente e os itens na notinha de atendimento."}
            </p>
            <Link
              className="botao-primario"
              to={
                a.permite("quotes")
                  ? a.oficina?.ramo && a.oficina.ramo !== "automotivo"
                    ? "/orcamentos"
                    : "/orcamentos?novo=1"
                  : "/notinhas"
              }
            >
              {a.permite("quotes") ? "Criar meu orçamento" : "Abrir notinhas"}{" "}
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
      </div>
      {a.permite("work_orders") && (
        <section className="agil-card">
          <h3>Precisa trabalhar sem internet?</h3>
          <p>
            Prepare seu aparelho enquanto estiver conectado. Depois, guarde relatos e
            fotos para sincronizar quando o sinal voltar.
          </p>
          <Link className="botao-secundario" to="/execucao-offline">
            Preparar atendimentos sem internet
          </Link>
        </section>
      )}
      <p>
        <small>
          Você pode voltar a este guia a qualquer momento. Dados importados são reais;
          confira a prévia antes de confirmar.
        </small>
      </p>
    </div>
  );
}
