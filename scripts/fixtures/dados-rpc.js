import{especialidades}from'../../src/lib/especialidades';
const perfil=new URLSearchParams(location.search).get('perfil')||'mecanica';
function baseExecucao(){return {id:'os-existente',agenda_id:null,documento_id:'os-existente',automotivo:especialidades[perfil].ramo==='automotivo',agenda_revisao:null,documento_revisao:window.fixtureConflito?2:1,cliente:'Cliente QA',objeto:'Atendimento existente '+perfil,titulo:'OS para continuar',numero:'10',inicio:null,fim:null,endereco:'',situacao:especialidades[perfil].ramo==='automotivo'?'open':'em_execucao',agenda_situacao:null,ficha:null,especialidade:perfil,itens:[]};}
window.fixtureChamadas=[];const dados={configuracao:null,solicitacoes:[],importacoes:[]},permissoes=[];
export async function rpc(n,a={}){window.fixtureChamadas.push({n,a});
 if(n==='exportar_dados_empresa'){
  if(!a.p_tabela)return{formato:'patio.exportacao.v1',empresa:{nome:'Empresa QA'},tabelas:[{tabela:'clientes',quantidade:501,assinatura:a.p_conferir&&window.fixtureExportacaoMudou?'mudou':'clientes-1'},{tabela:'arquivos',quantidade:1,assinatura:'anexo-1'}]};
  if(a.p_tabela==='clientes'){const inicio=Number(a.p_cursor||0),linhas=Array.from({length:Math.min(500,501-inicio)},(_,i)=>({id:'cliente-'+(inicio+i),nome:'Cliente QA '+(inicio+i)}));return{linhas,cursor:linhas.length?String(inicio+linhas.length):null};}
  if(a.p_tabela==='arquivos')return a.p_cursor?{linhas:[],cursor:null}:{linhas:[{id:'foto-1',situacao:'ready',recipiente:'workshop-files',caminho_arquivo:'qa/foto.png'}],cursor:'1'};
 }
 if(n==='consultar_identidade')return {nome:'Empresa QA'};
 if(n==='pagina_servicos')return {objetos:[],proximo:null};
 if(n==='consultar_dados_empresa')return structuredClone(dados);
 if(n==='consultar_restricoes_acesso')return structuredClone(permissoes);
 if(n==='salvar_restricoes_acesso'){permissoes[0]={usuario_id:a.p_usuario,regras:a.p_regras,revisao:1};return;}
 if(n==='salvar_configuracao_dados'){dados.configuracao={dados:a.p_dados,revisao:(dados.configuracao?.revisao||0)+1};return;}
 if(n==='salvar_solicitacao_privacidade'){dados.solicitacoes.push({...a.p_dados,id:a.p_id,revisao:1});return;}
 if(n==='importar_pacote_empresa'){const resumo={novos:a.p_pacote.registros.length,repetidos:0};if(a.p_confirmar)dados.importacoes.push({id:a.p_id,origem:a.p_pacote.origem,resumo,criado_em:new Date().toISOString()});return resumo;}
 if(n==='preparar_execucao_offline')return {usuario:'qa-user',empresa:'Empresa QA',oficina:a.p_oficina,itens:new URLSearchParams(location.search).has('execucao')?[baseExecucao()]:[]};
 if(n==='sincronizar_execucao_offline'){if(window.fixtureConflito&&a.p_base.documento_revisao!==2)throw Object.assign(Error('A OS mudou no sistema. Confira antes de enviar.'),{code:'PT409'}); return {...baseExecucao(),documento_revisao:3,situacao:a.p_dados.situacao,ficha:a.p_dados.ficha};}
 if(n==='reservar_foto_os_offline'||n==='reservar_foto_servico_offline'){if(window.fixtureFalharFoto){window.fixtureFalharFoto=false;throw Error('Envio da foto interrompido');}return{id:a.p_chave,caminho:'qa/'+a.p_chave};}
 if(n==='confirmar_foto_os'||n==='confirmar_foto_atendimento')return null;
 if(n==='criar_rascunho_servico_offline')return a.p_id;
 if(n==='salvar_ordem_servico')return {id:a.p_chave};
 if(n==='reservar_anexo_portabilidade')return a.p_oficina+'/'+a.p_id;
 if(n==='confirmar_anexo_portabilidade')return;
 throw Error('RPC sem simulação: '+n);
}
