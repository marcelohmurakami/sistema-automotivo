// Dados inteiramente fictícios, descartáveis, sem chamadas à rede.
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
import { novaFichaEspecialidade } from "../../src/lib/perfisAtendimento.ts";

export async function criarCenarioManutencao() {
  const db = await criarBancoLocal("20261019000500");
  const donos = ["climatizacao", "eletrica", "hidraulica", "equipamentos", "geral"];
  const configuracoes = {
    climatizacao: ["manutencao_climatizacao", "Split sala QA", "Tubo cobre QA", "Manutenção de climatização QA"],
    eletrica: ["manutencao_eletrica", "Quadro apartamento QA", "Cabo elétrico QA", "Revisão elétrica QA"],
    hidraulica: ["manutencao_hidraulica", "Rede apartamento QA", "Tubo PPR QA", "Reparo hidráulico QA"],
    equipamentos: ["manutencao_equipamentos", "Bomba industrial QA", "Mangueira QA", "Manutenção bomba QA"],
    geral: ["manutencao_geral", "Residência QA", "Material residencial QA", "Reparo residencial QA"],
  };
  const ids = Object.fromEntries([...donos, "staff", "basico", "customer", "stranger"].map(k => [k, randomUUID()]));
  const one = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const login = async (id = "", role = "authenticated") => {
    if (!["authenticated", "anon"].includes(role)) throw Error("Papel inválido");
    await db.exec("reset role");
    await one("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  };
  await db.exec("alter table auth.users add column email text, add column email_confirmed_at timestamptz");
  for (const [nome, id] of Object.entries(ids)) await db.query("insert into auth.users values($1,$2,now())", [id, nome + "@manutencao.test"]);
  const empresas = {};
  for (const nome of [...donos, "basico"]) {
    await login(ids[nome]);
    const [perfil, equipamento, peca, servico] = configuracoes[nome === "basico" ? donos[0] : nome];
    const w = await one("select public.configurar_nova_empresa($1,$2,'','{}','manutencao_campo',$3)", [randomUUID(), `QA LOCAL · ${nome}`, perfil]);
    empresas[nome] = w;
    await db.exec("reset role");
    await db.query("update public.assinaturas_oficina set codigo_plano=$1 where oficina_id=$2", [nome === "basico" ? "basic" : "complete", w]);
    if (nome === donos[0]) await db.query("insert into public.membros_oficina(oficina_id,usuario_id,perfil) values($1,$2,'staff')", [w, ids.staff]);
    await login(ids[nome]);
    const call = (fn, args) => one(`select public.${fn}(${args.map((_,i)=>`$${i+1}`).join(",")})`, args);
    const cliente = await call("salvar_cliente", [w, { nome: `Ana Cliente ${nome} QA`, email: "customer@manutencao.test", telefone_e164:"+5511999999999" }]);
    const objeto = randomUUID();
    await call("salvar_objeto_atendimento", [w,objeto,{cliente_id:cliente.id,nome:equipamento,dados:{endereco:"Rua Fictícia, 123 · unidade 4",equipamento:equipamento,serie:`ATIVO-${nome}-001`,contato:"Ana QA",acesso:"Agendar com a portaria"}}]);
    if (nome === "basico") continue;
    const produto = randomUUID(), funcionario = randomUUID(), recurso = randomUUID();
    await call("salvar_produto_estoque", [w,{descricao:peca,unidade:"m",codigo:`QA-${nome}`,custo_centavos:5000,preco_padrao_centavos:9500},produto]);
    await call("movimentar_estoque", [w,produto,"entrada",10,"Saldo fictício de auditoria",randomUUID(),1]);
    await call("salvar_item_catalogo", [w,randomUUID(),{descricao:servico,tipo:"service",unidade:"un",preco_padrao_centavos:18000}]);
    await call("salvar_funcionario", [w,funcionario,{nome:"Técnico Alex QA",funcao:"Técnico",ativo:true}]);
    await call("salvar_recurso_agenda", [w,recurso,"Técnico Alex QA",true]);
    const hoje = new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
    let proposta;
    for (let i=0;i<4;i++) {
      const id=randomUUID(), ficha=novaFichaEspecialidade(perfil);
      ficha.etapa="";
      ficha.campos={natureza:"Corretiva",ambiente:"Residencial",ativo:"ATIVO-"+nome,endereco_visita:"Rua Fictícia, 123 · unidade 4",solicitacao:"Falha intermitente relatada pelo cliente",medicoes_entrada:"Condição inicial registrada",medicoes_saida:"Resultado final registrado",resultado_teste:"Teste parcial",limitacoes_teste:"Acompanhamento em operação necessário",condicao_uso:"Uso com restrições",restricoes_uso:"Seguir orientação do responsável",proxima_data:hoje};
      const at={cliente_id:cliente.id,objeto_id:objeto,titulo:`${i===0 ? "Orçamento" : i===1 ? "Serviço em execução" : i===2 ? "Serviço concluído" : "Atendimento no local"} QA`,situacao:"orcamento",valor_centavos:27500,dados:{execucao:"Serviço fictício registrado",observacoes_cliente:"Observação visível ao cliente QA"},data_servico:hoje,vencimento:hoje,ficha_especialidade:ficha};
      await call("salvar_atendimento_servico",[w,id,at]);
      if(i===0) proposta=id;
      let d=await call("consultar_detalhes_atendimento",[w,id]);
      await call("salvar_itens_atendimento",[w,id,d.atendimento.revisao,[{id:randomUUID(),tipo:"servico",descricao:"Mão de obra QA",quantidade:1,unidade:"un",preco_centavos:18000,custo_centavos:2000,origem:"externa"},{id:randomUUID(),tipo:"material",descricao:"Peça controlada QA",quantidade:1.5,unidade:"m",preco_centavos:9500,origem:"estoque",produto_id:produto}],0,0,""]);
      d=await call("consultar_detalhes_atendimento",[w,id]);
      await call("salvar_equipe_atendimento",[w,id,d.atendimento.revisao,[{funcionario_id:funcionario,percentual:10,custo_hora_centavos:3000}]]);
      if (i>0) {
        d=await call("consultar_detalhes_atendimento",[w,id]);
        await call("salvar_atendimento_servico",[w,id,{...d.atendimento,situacao:"em_execucao"},d.atendimento.revisao]);
      }
      if (i>1) {
        d=await call("consultar_detalhes_atendimento",[w,id]);
        await call("salvar_atendimento_servico",[w,id,{...d.atendimento,situacao:"concluido"},d.atendimento.revisao]);
        await call("faturar_atendimento_servico",[w,id]);
      }
      if (i===1) await call("salvar_agenda_servico",[w,randomUUID(),{atendimento_id:id,recurso_id:recurso,inicio:`${hoje}T09:00:00-03:00`,fim:`${hoje}T10:00:00-03:00`,situacao:"agendado",observacoes:"Agenda fictícia"}]);
    }
    await call("configurar_site",[w,{identificador_url:`qa-local-${nome}`,titulo:`Manutenção ${nome} QA`,descricao:"Visitas e manutenção especializada",publicado:true,portal_habilitado:true,pedidos_pecas_habilitados:true}]);
    await call("definir_acesso_portal",[w,cliente.id,"customer@manutencao.test"]);
    const propostaAtual=await call("consultar_detalhes_atendimento",[w,proposta]);
    await call("compartilhar_atendimento_cliente",[w,proposta,propostaAtual.atendimento.revisao,true,"Diagnóstico concluído. Consulte serviços e valor para aprovar o serviço QA."]);
  }
  return {db,ids,office:empresas[donos[0]],empresas,login};
}
