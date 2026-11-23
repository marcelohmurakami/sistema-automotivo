import { Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { interfaceRamo } from "../lib/interfaceRamo";
import { CobrancaTeste } from "../components/CobrancaTeste";
import { CobrancaAssinatura } from "../components/CobrancaAssinatura";
import "./Planos.css";
import { useAcesso, nomesPlanos, recursosPorPlano, type Plano } from "../auth/contexto";
const descricoes: Record<string, string> = {
  customers: "Clientes e veículos",
  catalog: "Peças e serviços",
  reports: "Relatórios e histórico de gestão",
  finance: "Financeiro integrado à OS",
  inventory: "Estoque integrado à OS",
  simple_notes: "Notas de atendimento",
  quotes: "Orçamentos",
  work_orders: "Ordens de serviço",
  production_board: "Mapa da oficina",
  service_media: "Fotos e checklist",
  website: "Site da oficina",
  customer_portal: "Área do cliente",
  parts_requests: "Pedidos de peças",
  automations: "Automações",
  ai: "Inteligência artificial",
  employee_reports: "Comissões e relatórios de funcionários",
};
const situacoes: Record<string, string> = {
  active: "Ativa",
  trialing: "Em avaliação",
  past_due: "Pagamento pendente",
  cancelled: "Cancelada",
  suspended: "Suspensa",
};
export function Planos() {
  const acesso = useAcesso();
  const oficina = acesso.oficina!;
  const servicos = !!oficina.ramo && oficina.ramo !== "automotivo";
  const descricoesServicos: Record<string, string> = {
    customers: interfaceRamo(oficina.ramo).assistencia
      ? "Clientes e equipamentos"
      : "Clientes, equipamentos e locais",
    catalog: "Serviços e materiais",
    finance: "Financeiro integrado ao atendimento",
    inventory: "Materiais e consumo de estoque",
    simple_notes: "Cadastros e contatos",
    work_orders: interfaceRamo(oficina.ramo).assistencia
      ? "Ordens de reparo e fichas técnicas"
      : "Atendimentos e fichas por especialidade",
    production_board: "Etapas e fila de atendimento",
    service_media: "Checklist técnico",
    website: "Site da empresa",
    parts_requests: "Solicitações de produtos",
    employee_reports: "Equipe, horas, comissões e produtividade",
  };
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" /> NA MEDIDA DA SUA EMPRESA
          </div>
          <h1>
            Seu plano<span>.</span>
          </h1>
          <p>Confira os recursos disponíveis para o seu ramo.</p>
        </div>
      </div>
      <section className="resumo-plano">
        <ShieldCheck size={28} />
        <div>
          <h2>{oficina.nome_plano || "Sem plano contratado"}</h2>
          <p>
            Assinatura {situacoes[oficina.situacao]?.toLowerCase() ?? "indisponível"}
            {oficina.valido_ate &&
              ` · Válida até ${new Date(oficina.valido_ate).toLocaleDateString("pt-BR")}`}
          </p>
        </div>
        <span>{acesso.demo ? "SIMULAÇÃO" : oficina.nome}</span>
      </section>
      {!oficina.recursos.length && (
        <p className="erro-formulario" role="alert">
          Os recursos estão bloqueados. Verifique a situação e a validade da assinatura
          com o responsável pelo contrato.
        </p>
      )}
      {acesso.demo ? (
        <div className="nota-demo">
          <label>
            Simular plano na demonstração{" "}
            <select
              aria-label="Simular plano"
              value={oficina.codigo_plano}
              onChange={(e) => acesso.definirPlanoDemo(e.target.value as Plano)}
            >
              {Object.entries(nomesPlanos).map(([codigo, nome]) => (
                <option key={codigo} value={codigo}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
          <span>Esta simulação não altera nenhuma assinatura no Supabase.</span>
        </div>
      ) : (
        <p className="texto-suave">
          Mudanças de plano são feitas pelo responsável pela contratação. Os recursos
          abaixo dependem da assinatura e da disponibilidade de cada módulo.
        </p>
      )}
      <div className="grade-planos">
        {(Object.keys(nomesPlanos) as Plano[]).map((plano) => (
          <article
            key={plano}
            className={`cartao-plano ${oficina.codigo_plano === plano ? "plano-atual" : ""}`}
          >
            <div className="sobretitulo">
              {oficina.codigo_plano === plano ? "SEU PLANO" : "PÁTIO"}
            </div>
            <h2>{nomesPlanos[plano]}</h2>
            <p className="preco-plano">
              <small>Valor vigente disponível na contratação abaixo</small>
            </p>
            <p>
              {plano === "basic"
                ? "O essencial para organizar o atendimento."
                : plano === "intermediate"
                  ? "Controle do orçamento até a entrega."
                  : "Sua empresa conectada ao cliente."}
            </p>
            <ul>
              {recursosPorPlano[plano]
                .filter(
                  (recurso) => !servicos || !["automations", "ai"].includes(recurso),
                )
                .map((recurso) => (
                  <li key={recurso}>
                    <Check size={16} />
                    {(servicos && descricoesServicos[recurso]) || descricoes[recurso]}
                  </li>
                ))}
            </ul>
          </article>
        ))}
      </div>
      <CobrancaTeste key={oficina.id} />
      <CobrancaAssinatura key={`assinatura-${oficina.id}`} />
      <div className="nota-seguranca">
        <LockKeyhole size={18} />
        <p>
          O acesso real é validado pelo banco em cada operação. Alterar o menu ou o
          navegador não libera recursos adicionais.
        </p>
      </div>
    </>
  );
}
