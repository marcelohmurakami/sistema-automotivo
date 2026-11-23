// Dados inteiramente fictícios, descartáveis, sem chamadas à rede.
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
import { novaFichaEspecialidade } from "../../src/lib/perfisAtendimento.ts";
import { concluirReparo } from "../../src/lib/assistenciaTecnica.ts";

export async function criarCenarioReparos({ digitais = false } = {}) {
  const db = await criarBancoLocal("20261016000300");
  const donos = digitais ? ["celulares", "informatica"] : ["eletro", "placas"];
  const configuracoes = {
    eletro: ["assistencia_eletrodomesticos", "Lavadora frontal QA", "Bomba de drenagem QA", "Troca de bomba QA"],
    placas: ["assistencia_eletronica", "Placa fonte TV QA", "Capacitor 470 µF QA", "Diagnóstico de placa QA"],
    celulares: ["assistencia_celulares", "Celular modelo QA", "Tela celular QA", "Troca de tela QA"],
    informatica: ["assistencia_informatica", "Notebook modelo QA", "SSD 500 GB QA", "Instalação SSD QA"],
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
  for (const [nome, id] of Object.entries(ids)) await db.query("insert into auth.users values($1,$2,now())", [id, nome + "@reparos.test"]);
  const empresas = {};
  for (const nome of [...donos, "basico"]) {
    await login(ids[nome]);
    const [perfil, equipamento, peca, servico] = configuracoes[nome === "basico" ? donos[0] : nome];
    const w = await one("select public.configurar_nova_empresa($1,$2,'','{}','assistencia_tecnica',$3)", [randomUUID(), `QA LOCAL · ${nome}`, perfil]);
    empresas[nome] = w;
    await db.exec("reset role");
    await db.query("update public.assinaturas_oficina set codigo_plano=$1 where oficina_id=$2", [nome === "basico" ? "basic" : "complete", w]);
    if (nome === donos[0]) await db.query("insert into public.membros_oficina(oficina_id,usuario_id,perfil) values($1,$2,'staff')", [w, ids.staff]);
    await login(ids[nome]);
    const call = (fn, args) => one(`select public.${fn}(${args.map((_,i)=>`$${i+1}`).join(",")})`, args);
    const cliente = await call("salvar_cliente", [w, { nome: `Ana Cliente ${nome} QA`, email: "customer@reparos.test", telefone_e164:"+5511999999999" }]);
    const objeto = randomUUID();
    await call("salvar_objeto_atendimento", [w,objeto,{cliente_id:cliente.id,nome:equipamento,dados:{marca:"Marca fictícia",modelo:"Modelo QA",serie:`SERIE-${nome}-001`,acessorios:"Cabo original",condicao:"Riscos externos registrados"}}]);
    if (nome === "basico") continue;
    const produto = randomUUID(), funcionario = randomUUID(), recurso = randomUUID();
    await call("salvar_produto_estoque", [w,{descricao:peca,unidade:"un",codigo:`QA-${nome}`,custo_centavos:5000,preco_padrao_centavos:9500},produto]);
    await call("movimentar_estoque", [w,produto,"entrada",10,"Saldo fictício de auditoria",randomUUID(),1]);
    await call("salvar_item_catalogo", [w,randomUUID(),{descricao:servico,tipo:"service",unidade:"un",preco_padrao_centavos:18000}]);
    await call("salvar_funcionario", [w,funcionario,{nome:"Técnico Alex QA",funcao:"Técnico",ativo:true}]);
    await call("salvar_recurso_agenda", [w,recurso,"Técnico Alex QA",true]);
    const hoje = new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
    let proposta;
    for (let i=0;i<4;i++) {
      const id=randomUUID(), ficha=novaFichaEspecialidade(perfil);
      ficha.etapa="";
      ficha.campos=nome === "placas" ? {objeto_recebido:"Placa avulsa",placa:"PCB-QA-001",revisao_placa:"REV B",equipamento_origem:"TV QA",defeito:"Não liga",diagnostico:"Componente em curto",condicao_ensaio:"Somente placa / módulo",resultado_teste:"Teste parcial",limitacoes_teste:"Sem equipamento original",medicoes_entrada:"TP1: 0 V",medicoes_saida:"TP1: 5 V"} : {familia:"Lavadora",modalidade:i === 3 ? "Domicílio" : "Bancada",defeito:"Não drena a água",codigo_produto:"PNC-QA-001",diagnostico:"Bomba com falha",resultado_teste:"Aprovado nos testes",testes:"Ciclo completo conferido",...(i===3 ? {endereco_visita:"Endereço fictício, 123",contato_visita:"Ana QA"} : {})};
      if (digitais) ficha.campos = {defeito:nome === "celulares" ? "Tela sem imagem" : "Não inicia o sistema",backup:"Cliente orientado",autorizacao_dados:"Não autorizada",modo_manutencao:"Acesso acompanhado pelo cliente",diagnostico:"Diagnóstico fictício",testes:"Teste final registrado",...(nome === "celulares" ? {liga:"Liga com falhas",funcoes_entrada:"Tela sem imagem; demais funções não testadas"} : {configuracao:"Notebook, 16 GB RAM, SSD 500 GB",armazenamento:"Falha de leitura no armazenamento"})};
      const at={cliente_id:cliente.id,objeto_id:objeto,titulo:`${i===0 ? "Orçamento" : i===1 ? "Reparo em execução" : i===2 ? "Reparo pronto" : "Atendimento no local"} QA`,situacao:"orcamento",valor_centavos:27500,dados:{execucao:"Serviço fictício registrado",observacoes_cliente:"Observação visível ao cliente QA"},data_servico:hoje,vencimento:hoje,ficha_especialidade:ficha};
      await call("salvar_atendimento_servico",[w,id,at]);
      if(i===0) proposta=id;
      let d=await call("consultar_detalhes_atendimento",[w,id]);
      await call("salvar_itens_atendimento",[w,id,d.atendimento.revisao,[{id:randomUUID(),tipo:"servico",descricao:"Mão de obra QA",quantidade:1,unidade:"un",preco_centavos:18000,custo_centavos:2000,origem:"externa"},{id:randomUUID(),tipo:"material",descricao:"Peça controlada QA",quantidade:1,unidade:"un",preco_centavos:9500,origem:"estoque",produto_id:produto}],0,0,""]);
      d=await call("consultar_detalhes_atendimento",[w,id]);
      await call("salvar_equipe_atendimento",[w,id,d.atendimento.revisao,[{funcionario_id:funcionario,percentual:10,custo_hora_centavos:3000}]]);
      if (i>0) {
        d=await call("consultar_detalhes_atendimento",[w,id]);
        await call("salvar_atendimento_servico",[w,id,{...d.atendimento,situacao:"em_execucao"},d.atendimento.revisao]);
      }
      if (i>1) {
        d=await call("consultar_detalhes_atendimento",[w,id]);
        await call("salvar_atendimento_servico",[w,id,concluirReparo(d.atendimento,perfil),d.atendimento.revisao]);
        await call("faturar_atendimento_servico",[w,id]);
      }
      if (i===1) await call("salvar_agenda_servico",[w,randomUUID(),{atendimento_id:id,recurso_id:recurso,inicio:`${hoje}T09:00:00-03:00`,fim:`${hoje}T10:00:00-03:00`,situacao:"agendado",observacoes:"Agenda fictícia"}]);
    }
    await call("configurar_site",[w,{identificador_url:`qa-local-${nome}`,titulo:`Assistência ${nome} QA`,descricao:"Reparos e diagnóstico especializado",publicado:true,portal_habilitado:true,pedidos_pecas_habilitados:true}]);
    await call("definir_acesso_portal",[w,cliente.id,"customer@reparos.test"]);
    const propostaAtual=await call("consultar_detalhes_atendimento",[w,proposta]);
    await call("compartilhar_atendimento_cliente",[w,proposta,propostaAtual.atendimento.revisao,true,"Diagnóstico concluído. Consulte serviços e valor para aprovar o reparo QA."]);
  }
  return {db,ids,office:empresas[donos[0]],empresas,login};
}
