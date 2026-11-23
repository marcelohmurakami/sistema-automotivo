import {operacoes} from './jornadas-operacoes.mjs';
// Os limites terminam em uma condição de negócio conferida pelo teste existente.
export const jornadas = [...operacoes,
 {arquivo:'verificar-contas-mensais-servicos',perfil:'perfil',marcacoes:[
  {nome:'Criar conta mensal fixa',inicio:"await p.getByRole('button',{name:'Nova conta mensal',exact:true}).click();",fim:"check(perfil,'Cadastrar conta fixa, opcionais recolhidos e geração do mês');"},
  {nome:'Criar conta mensal variável',inicio:"await p.getByRole('button',{name:'Nova conta mensal',exact:true}).click();await p.getByLabel('Nome da conta',{exact:true}).fill('Água QA');",fim:"check(perfil,'Variável sem valor aparece como pendência e não distorce financeiro');"},
  {nome:'Resolver conta variável pelo sininho',inicio:"await p.locator('.sininho-alertas').click();",fim:"check(perfil,'Sininho → informar valor → conta financeira sem pagamento automático');"},
  {nome:'Alterar valor futuro da conta mensal',inicio:"await p.getByRole('link',{name:'Financeiro QA',exact:true}).click();await p.locator('.mensais-lista",fim:"check(perfil,'Editar valor futuro preserva conta do mês já gerada');"},
  {nome:'Cadastrar serviço completo com custos e consultar margem',inicio:"await p.getByRole('link',{name:'Catálogo QA',exact:true}).click();",fim:"check(perfil,'Detalhes pela linha, custos discriminados e margem de R$ 70');"},
  {nome:'Incluir serviço e custos na OS',inicio:"await p.getByRole('button',{name:'Fechar janela',exact:true}).click();await p.getByRole('link',{name:'OS QA',exact:true}).click();",fim:"check(perfil,'Selecionar no editor de OS herda custo; adaptação de todos os ramos preserva valor');"},
 ]},
 {arquivo:'verificar-laudos',perfil:'perfil',marcacoes:[
  {nome:'Preencher laudo detalhado e salvar rascunho',inicio:"await p.getByRole('button',{name:'Novo laudo',exact:true}).click();",fim:"check(perfil,'Preencher, salvar e visualizar rascunho');"},
  {nome:'Emitir versão do laudo',inicio:"await p.getByRole('button',{name:'Emitir laudo',exact:true}).click();",fim:"check(perfil,'Emissão e prévia da versão preservada');"},
  {nome:'Imprimir laudo emitido',inicio:"const popupPromise=p.waitForEvent('popup');",fim:"check(perfil,'Impressão abre e contém cliente, serviços, conclusão, identificação e assinaturas');"},
  {nome:'Revisar laudo, emitir e consultar versão anterior',inicio:"await p.getByRole('button',{name:'Criar nova revisão',exact:true}).click();",fim:"check(perfil,'Revisão e consulta da versão anterior sem sobrescrever conteúdo');"},
  {nome:'Cancelar laudo preservando histórico',inicio:"await p.getByText('Histórico e outras opções',{exact:true}).click();",fim:"check(perfil,'Cancelamento visível, mantendo o histórico e as duas versões');"},
  {nome:'Reabrir laudo persistido',inicio:"await p.getByRole('button',{name:'Fechar janela',exact:true}).click();await p.reload();",fim:"check(perfil,'Persistência após recarregar e abertura pela listagem');"},
 ]},
 {arquivo:'verificar-agendamento-separado',perfil:'perfil',marcacoes:[
  {nome:'Salvar agendamento único',inicio:'let d=await abrir(false);',fim:'assert.equal(salvo.dados.p_dados.regra_calendario,undefined);'},
  {nome:'Salvar série recorrente com prévia',inicio:'d=await abrir(true);',fim:"assert.equal(salvo.dados.p_dados.regra_calendario.frequencia,'semanal');"},
 ]},
];
