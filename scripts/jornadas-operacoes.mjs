const m=(nome,inicio,fim)=>({nome,inicio,fim});
export const operacoes=[
{arquivo:'conferir-portais-componentes',perfil:"typeof e==='undefined'?'publico':e.perfil",marcacoes:[
 m('Abrir mini site e conferir três tamanhos de tela',"await p.goto(base+'/oficina/'+e.slug);","resultados.push({perfil:e.perfil,teste:'Site público em 1920, 390 e 320px',ok:true});"),
 {...m('Entrar no portal e consultar atendimentos',"await p.locator('.portal-login').getByLabel('E-mail',{exact:true}).fill(c.email);","resultados.push({perfil:e.perfil,teste:'Cliente fictício consulta seus serviços no portal',ok:true});"),expressaoNome:"'Portal: entrar e consultar serviços, cliente '+(e.clientes.indexOf(c)+1)"},
 m('Sair da área do cliente',"await p.getByRole('button',{name:'Sair',exact:true}).click();","await p.locator('.portal-login').waitFor();"),
 {...m('Abrir página pública sem sessão',"await p.goto(base+rota);","resultados.push({rota,teste:'Estado inicial sem sessão ou token',ok:true})"),expressaoNome:"'Abrir estado público '+rota"}
]},
{arquivo:'conferir-interface-desempenho',perfil:'c.especialidade',marcacoes:[
 m('Entrar com conta e carregar painel',"await p.goto(base+'/entrar');",'await pronto();'),
 {...m('Consulta de tela e ações de leitura','await fn();','resultados.push({perfil:c.especialidade,teste:nome,ok:true});'),expressaoNome:'nome'}
]},
{arquivo:'verificar-tabela-precos',perfil:"'compartilhado'",marcacoes:[
 m('Selecionar serviços entre páginas e imprimir preços',"await p.getByRole('button',{name:'Imprimir tabela de preços',exact:true}).click();let d=", "registrar('Nomes tratados como texto; tabela sem custos internos');"),
 m('Selecionar e imprimir catálogo de 80 serviços recuperando popup bloqueado',"await d.getByRole('button',{name:'Limpar seleção',exact:true}).click();", "registrar('Tabela completa em A4 com os 80 serviços');")
]},
{arquivo:'verificar-calendario-layout',perfil:'perfil',marcacoes:[
 m('Editar visita, tratar conflito e conferir horário salvo', "await page.locator('.cal-oficina-evento').filter({hasText:'Ana Maria'}).first().click();", "assert.equal(Date.parse(salvo.dados.p_dados.inicio),Date.parse('2026-11-10T10:35:00-03:00'));"),
 m('Abrir agendamento no horário e recurso escolhidos', "await recurso.selectOption(auto?'Equipe principal':'recurso-0');\n  const grupo=", "assert.equal(await d.locator(auto?'[name=recurso]':'[name=recurso_id]').inputValue(),auto?'Equipe principal':'recurso-0');")
]},
{arquivo:'bancada-offline-unificado',perfil:'perfil',marcacoes:[
 m('Preparar e executar atendimento com foto sem internet', "await page.getByRole('button',{name:'Preparar / atualizar aparelho'}).click();", "checks.push('Reabertura offline preserva execução e foto');"),
 m('Sincronizar execução recuperando falha de envio de foto', "await page.getByRole('button',{name:'Enviar pendências',exact:true}).click();", "checks.push('Reenvio completa fotos sem duplicar OS ou execução');"),
 m('Resolver conflito de versões offline', "await d.getByLabel('Serviço realizado e observações').fill('Conferência '+perfil);", "checks.push('Conflito permanece salvo e pode ser conferido antes de reenviar');")
]},
{arquivo:'verificar-financeiro-estoque',perfil:'perfil',marcacoes:[
 m('Criar receita, receber parcialmente e conferir saldo', 'await page\n      .getByRole("button", { name: "Nova conta a receber", exact: true })', '2900,\n    );'),
 m('Importar extrato e conciliar recebimento', 'await ir(perfil, "/financeiro?aba=conciliacao");', 'await page.getByRole("dialog").waitFor({ state: "hidden" });'),
 m('Estornar recebimento e conferir saldo', 'await ir(perfil, "/financeiro?titulo=" + titulo);', 'await layout("estornar-recebimento-" + perfil);'),
 m('Registrar compra a prazo com depósito', 'await ir(perfil, "/compras");', 'assert.equal(compraEmAberto.aberto_centavos, 4000);'),
 m('Pagar parte da compra e conferir banco e estoque', 'await page\n      .getByRole("button", { name: "Registrar pagamento", exact: true })\n      .click();', '2,\n    );'),
 m('Editar compra quitada por crédito', 'await ir(perfil, "/financeiro?titulo=" + contextos[perfil].tituloCredito);', 'await layout("credito-integral-editar-" + perfil);')
]},
{arquivo:'verificar-logistica-estoque',perfil:'perfil',marcacoes:[
 m('Criar local de estoque', 'await page.getByRole("button", { name: "+ Novo local", exact: true }).click();', 'await page.getByRole("button", { name: /Veículo QA.*Ver saldo/ }).waitFor();'),
 m('Transferir estoque e conferir saldo no destino', 'await page\n      .getByRole("button", { name: "Transferir produtos", exact: true })', 'await page.getByText("3 un livres", { exact: true }).waitFor();'),
 m('Devolver ao fornecedor e registrar análise', 'await page.getByRole("button", { name: "+ Nova devolução", exact: true }).click();', 'await page.getByText(/Em análise · RMA-UI/).waitFor();'),
 m('Registrar crédito do fornecedor', 'await page.getByRole("button", { name: "Registrar crédito", exact: true }).click();', 'await layout("credito-disponivel-" + perfil);'),
 m('Utilizar e estornar crédito, encerrar acompanhamento', 'await page.getByRole("button", { name: new RegExp(nome + ".*RMA-UI") }).click();', 'await page.getByLabel("Mais opções de compras").selectOption("catalogos");'),
 m('Importar catálogo, vincular produto, comprar e receber', 'await page\n      .getByRole("button", { name: "Importar catálogo CSV", exact: true })', 'await layout("catalogo-" + perfil);')
]},
{arquivo:'verificar-simplicidade',perfil:'perfil',marcacoes:[
 m('Adicionar e remover participantes com divisão automática', "await page.locator('.eq-linha-button').click();await page.getByLabel('Adicionar participante').selectOption('a');", "await layout('equipe-'+perfil);"),
 m('Guardar item e mudar sua localização', "await page.getByRole('button',{name:'Guardar item',exact:true}).click();const dlg=page.getByRole('dialog');", "await layout('local-movido-'+perfil);")
]},
{arquivo:'verificar-conta-ficha',perfil:'perfil',marcacoes:[
 m('Selecionar OS e baixar conta do cliente em PDF', "await abrir();await p.getByLabel('Incluir OS 101').uncheck();", "await p.getByRole('status').filter({hasText:'PDF baixado'}).waitFor();")
]},
{arquivo:'verificar-financeiro-detalhe',perfil:'perfil',marcacoes:[
 {...m('Consultar origem de indicador financeiro', "await page.locator('.fin-cartoes article').nth(i).click({position:{x:30,y:55}});", "assert.equal(await page.locator('.fin-hist-total > strong').innerText(),artigos[i]);"),expressaoNome:"'Consultar histórico de '+indicador"},
 {...m('Consultar contas pendentes', 'await page.locator(`.fin-pendencias a[href*="/${indicador}?"]`).click();', "assert.equal(await page.getByLabel('Filtrar por vencimento').isChecked(),false);"),expressaoNome:"'Consultar contas a '+indicador"}
]},
{arquivo:'verificar-analises-gerenciais',perfil:'perfil',marcacoes:[
 {...m('Filtrar e consultar análise gerencial', 'await escolher(tipo);\n          await medir(perfil', 'await page.setViewportSize({ width: 1920, height: 1080 });'),expressaoNome:"'Consultar análise de '+tipo+' e conferir no celular'"},
 m('Editar, retirar e reativar premissa gerencial', 'await escolher("comparacao");\n        await page', 'await medir(perfil + " comparação editar retirar reativar");'),
 m('Exportar análise gerencial', 'const download = page.waitForEvent("download");', 'assert.match(arquivo.suggestedFilename(), /^analise-comparacao-/);')
]},
{arquivo:'verificar-suprimentos',perfil:'perfil',marcacoes:[
 {...m('Criar pedido de compra',"await page.getByRole('button',{name:'+ Novo pedido'}).click();","await page.getByRole('button',{name:'Criar pedido',exact:true}).click();"),validacao:"await page.getByRole('button',{name:'Receber entrega',exact:true}).waitFor();"},
 m('Receber entrega parcial com recusa',"await page.getByRole('button',{name:'Receber entrega',exact:true}).click();","await page.getByRole('dialog').getByText('3 pendentes',{exact:true}).waitFor();"),
 m('Devolver item para reposição',"await page.getByRole('button',{name:'Devolver para reposição',exact:true}).click();","await page.getByRole('dialog').getByText('4 pendentes',{exact:true}).waitFor();"),
 m('Receber reposição e concluir pedido',"await page.getByRole('button',{name:'Receber reposição',exact:true}).click();","await page.getByRole('dialog').getByText('0 pendentes',{exact:true}).waitFor();"),
 m('Cotar dois fornecedores e gerar pedido',"await page.getByRole('link',{name:'Cotações',exact:true}).click();","await page.getByRole('button',{name:'Receber entrega',exact:true}).waitFor();"),
 m('Consultar sugestão de reposição',"await page.getByRole('link',{name:'Reposição',exact:true}).click();","await page.getByText('Estoque suficiente',{exact:true}).first().waitFor();"),
 m('Reservar e liberar estoque da OS',"await page.getByRole('button',{name:'Reservar tudo',exact:true}).click();","await page.getByRole('button',{name:'Reservar tudo',exact:true}).waitFor();"),
 m('Registrar entrada de unidades por série e IMEI',"await page.getByRole('button',{name:'Registrar entrada',exact:true}).click();","await page.getByText('UI-SERIE-1',{exact:true}).waitFor();"),
 m('Registrar saída de unidade rastreada',"await page.getByRole('button',{name:'Registrar saída',exact:true}).click();","await page.getByText('Saída',{exact:true}).waitFor();"),
 m('Localizar histórico pelo IMEI',"await page.getByLabel('Série, IMEI ou produto').fill('123456789012345');","await page.getByRole('heading',{name:'Histórico da unidade'}).waitFor();")
]},
{arquivo:'verificar-qualidade-avancada',perfil:'perfil',marcacoes:[
 m('Registrar análise de falha com evidências',"await page.getByRole('button',{name:'Nova análise',exact:true}).click();","await layout('analise-formulario-'+perfil);await salvar();"),
 m('Converter análise em ocorrência e registrar custo',"await page.getByRole('button',{name:'Registrar ocorrência e custos',exact:true}).click();","await layout('analise-historico-'+perfil);"),
 m('Garantia do fabricante até recebimento',"await page.getByRole('button',{name:'Fabricante',exact:true}).click();","await page.getByText(/80,00 recebido/).waitFor();"),
 m('Combinar retirada e registrar custódia',"await page.getByRole('button',{name:'Não retirados',exact:true}).click();","await salvar();await page.getByRole('button',{name:'Fechar',exact:true}).click();"),
 m('Preparar documento para assinatura especializada',"await page.getByRole('button',{name:'Assinaturas',exact:true}).click();","assert(manifest.suggestedFilename().endsWith('.json'));"),
 m('Responder pesquisa como cliente',"await page.getByRole('radio',{name:'Nota 2',exact:true}).check();","await page.getByRole('heading',{name:'Obrigado pela sua avaliação!'}).waitFor();"),
 m('Resolver reclamação da pesquisa',"await page.getByRole('button',{name:'Gerenciar',exact:true}).click();","await page.getByText('Acompanhamento resolvido',{exact:true}).waitFor();")
]},
{arquivo:'verificar-produtividade-equipe',perfil:'perfil',apos:"await ir(perfil,'resultados');await page.getByLabel('Mostrar').selectOption('todos');",marcacoes:[
 m('Atribuir participantes e dividir execução',"await ir(perfil,'resultados');await page.getByLabel('Mostrar').selectOption('todos');","await esperarAtribuicao(perfil,false);"),
 m('Registrar hora produtiva e calcular participação',"await page.getByText('Registrar tempo produtivo (opcional)',{exact:true}).click();","await esperarAtribuicao(perfil,false);await page.getByRole('button',{name:'Fechar janela',exact:true}).click();"),
 m('Criar habilidade da equipe',"await page.getByRole('button',{name:'Qualificações',exact:true}).click();","await page.getByText('Habilidade salva.',{exact:true}).waitFor();"),
 m('Registrar qualificação e vencimento',"await page.getByRole('button',{name:'Registrar qualificação',exact:true}).click();const dialog=page.getByRole('dialog');","await page.getByText('Qualificação registrada.',{exact:true}).waitFor();"),
 m('Sugerir e confirmar escala',"await page.getByRole('button',{name:'Escala',exact:true}).click();","await page.getByText('Escala confirmada na agenda.',{exact:true}).waitFor();"),
 m('Lançar verba e exportar equipe para contador',"await page.getByRole('button',{name:'Contador',exact:true}).click();","await layout('contador-'+perfil);")
]},
{arquivo:'verificar-dados-seguranca',perfil:'perfil',marcacoes:[
 m('Ativar MFA e recuperar código incorreto',"await page.getByRole('button',{name:'Ativar proteção',exact:true}).click();","await page.getByText('Autenticação confirmada.',{exact:true}).waitFor();"),
 m('Conferir e importar modelo de dados',"await page.getByRole('button',{name:'Importar e exportar',exact:true}).click();","await page.getByText(/Importação concluída/).waitFor();"),
 m('Configurar canais e prazo de suporte',"await page.getByRole('button',{name:'Suporte',exact:true}).click();","await page.getByText('Condições de suporte atualizadas.').waitFor();"),
 m('Registrar solicitação de privacidade',"await page.getByRole('button',{name:'Privacidade',exact:true}).click();","await page.getByText('Solicitação registrada no histórico.').waitFor();")
]},
{arquivo:'verificar-pagamento-entrega',perfil:'perfil',marcacoes:[
 {...m('Criar OS pronta, definir pagamento e imprimir','await preencher();await salvar();await semImpressao();',"await imprimir(modo==='adiar'?'Agora não, só imprimir':'Concluir e imprimir',perfil+'-'+modo);"),expressaoNome:"'OS pronta, pagamento '+modo+' e impressão'"},
 {...m('Entregar pelo mapa sem cobrar novamente','const antes=await financeiro();',"assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);"),expressaoNome:"'Entregar pelo mapa após pagamento '+modo"}
]},
{arquivo:'bancada-documentos-offline',perfil:'perfil',marcacoes:[
 {...m('Documento completo offline com impressão',"await page.getByRole('button',{name:tipo==='os'?'Nova OS':'Novo orçamento',exact:true}).click();", "assert((await locais(page)).filter(r=>r.pronto_envio).length=== (tipo==='os'?1:2));"),expressaoNome:"tipo+' offline com itens, desconto, recuperação de rascunho e PDF'"},
 m('Reconectar e sincronizar com perda de resposta e duas abas',"let perda=0;await ctx.route('**/qa/rpc'","checks.push('Duas abas e reenvio: exatamente dois documentos, com itens, tipo e total conferidos no banco');")
]}
];
