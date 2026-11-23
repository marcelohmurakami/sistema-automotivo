import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const out = path.dirname(fileURLToPath(import.meta.url));
const topics = {
  3: 'Atendimento e orçamento', 4: 'Execução e agenda', 5: 'Financeiro e cobrança',
  6: 'Estoque e compras', 7: 'Qualidade e garantia', 8: 'Equipe e produtividade',
  9: 'Relatórios', 10: 'Comunicação e clientes', 11: 'Dados, segurança e adoção',
};
const data = [];
function add(chapter, feature, status, delivery, gap = '', nature = '') {
  const n = data.filter(x => x.chapter === chapter).length + 1;
  data.push({ id: `C${chapter}.${String(n).padStart(2, '0')}`, chapter, topic: topics[chapter], feature, status, delivery, gap, nature });
}
const E = 'Presente', P = 'Parcial', A = 'Ausente', X = 'Externo';

add(3,'Buscar clientes',E,'Localiza clientes cadastrados e permite consultar o histórico relacionado.');
add(3,'Reaproveitar dados anteriores',E,'Reutiliza cliente e veículo ou equipamento em novos atendimentos.');
add(3,'Orçamento com catálogo',E,'Seleciona serviços e produtos previamente cadastrados, com seus valores.');
add(3,'Itens avulsos',E,'Inclui serviço ou peça sem exigir cadastro prévio no catálogo.');
add(3,'Quantidade e preço',E,'Permite ajustar quantidade e preço dos itens, respeitando o tipo de unidade.');
add(3,'Orçamento para OS',E,'Reaproveita os dados na conversão automotiva ou na continuidade do atendimento nos demais ramos.');
add(3,'Aprovação parcial do orçamento',P,'No automotivo, permite aprovação por grupos e dependências.','Completar a equivalência da aprovação parcial nos demais ramos.','Desenvolvimento');
add(3,'Aprovação remota',P,'Automotivo oferece proposta por link. Demais atendimentos têm aprovação pelo portal autenticado.','Simplificar o acesso nos demais ramos, mantendo identificação, versão e registro da autorização.','Desenvolvimento');
add(3,'Quem aprovou e qual versão',E,'Registra aprovações e controla revisões nas operações implementadas.','Os detalhes e a experiência variam entre os fluxos. Não apresentar como assinatura certificada universal.');
add(3,'Taxa de diagnóstico com abatimento',P,'Valores e descontos podem ser lançados manualmente.','Criar política de cobrança do diagnóstico e abatimento ao aprovar, com registro e comprovação.','Desenvolvimento');
add(3,'Campos opcionais separados',E,'Organiza informações complementares em blocos opcionais recolhidos.','A facilidade para iniciantes ainda precisa ser medida com usuários.');
add(3,'Documento de orçamento',E,'Gera documento com identificação, itens, valores e dados do atendimento.','Documento de atendimento não equivale a nota fiscal.');
add(3,'Comprovação completa da autorização',P,'Há registros de aprovação e revisão.','Padronizar a prova de manifestação do cliente; aprovação interna não comprova sozinha a autorização externa.','Desenvolvimento');
add(3,'Localização física de aparelhos e peças',P,'A OS identifica o atendimento e o equipamento.','Integrar etiqueta, leitura e localização de aparelho, acessórios, chaves e peças.','Desenvolvimento');

add(4,'Etapas dos serviços',E,'Mostra a situação dos atendimentos em painéis e listagens.');
add(4,'Paradas e motivos',E,'Registra pausas por aprovação, peças e outras pendências.');
add(4,'Ações rápidas',E,'Permite avançar ou interromper o serviço pelo painel.');
add(4,'Pronto versus entregue',E,'Distingue a conclusão do trabalho da entrega ou retirada.');
add(4,'Recebimento na retirada',E,'Abre o fluxo de pagamento e permite manter saldo pendente.');
add(4,'Prazos e atrasos',E,'Destaca datas, prazos e atrasos nos atendimentos e relatórios.');
add(4,'Agenda e conflitos',E,'Oferece agenda e validações de sobreposição de horários.');
add(4,'Deslocamento de visitas',P,'Permite informar duração de deslocamento.','Calcular trajetos entre visitas e incorporar a logística completa ao planejamento.','Desenvolvimento');
add(4,'Roteirização geográfica',A,'Não foi identificada implementação de otimização de rotas.','Planejar visitas por região, distância e trajeto.','Desenvolvimento e integração');
add(4,'Alocação automática de técnicos',A,'Não foi identificada seleção automática do profissional adequado.','Combinar habilidade, certificação, disponibilidade, distância e materiais.','Desenvolvimento');
add(4,'Reserva de técnico, box e equipamento',P,'Há responsáveis, agenda e capacidade básica.','Reservar e validar recursos simultaneamente, considerando indisponibilidades.','Desenvolvimento');
add(4,'Horas efetivamente trabalhadas',E,'Registra horas por apontamento.','O indicador depende de iniciar e encerrar os apontamentos corretamente.');
add(4,'Visitas recorrentes',P,'Há repetição e programação de visitas, especialmente na limpeza.','Completar recorrência por calendário, exceções, feriados e regras de contrato.','Desenvolvimento');
add(4,'Contratos preventivos completos',P,'Registra referências de contrato e próximas visitas.','Controlar cobertura, franquia, reajuste, excedentes, vigência e faturamento contratual.','Desenvolvimento');
add(4,'Execução integral sem internet',P,'Existe rascunho offline para entrada automotiva.','Ampliar para visitas, fotos, execução e sincronização nos demais ramos.','Desenvolvimento e validação');
add(4,'Calendários externos',A,'Não foi identificada sincronização com Google Calendar ou Outlook.','Implementar integração e tratamento de conflitos de sincronização.','Integração');

add(5,'Vendido versus recebido',E,'Distingue valor dos atendimentos de contas e movimentações financeiras.');
add(5,'Contas a pagar e a receber',E,'Controla valores, vencimentos, pagamentos e saldos.');
add(5,'Pagamento parcial',E,'Registra recebimentos parciais e preserva o saldo em aberto.');
add(5,'Parcelamento',E,'Permite contas parceladas com vencimentos.');
add(5,'Despesas recorrentes',E,'Registra recorrência financeira e trata valores variáveis.');
add(5,'Inadimplência',E,'Mostra contas vencidas, saldos e ranking de devedores.');
add(5,'Conta do cliente com seleção de OS',E,'Gera documento da conta escolhendo os atendimentos incluídos.');
add(5,'Custo dos serviços',P,'Soma custos informados de itens, trabalho e outros componentes registrados.','Melhorar captura e conferência dos custos; valores não informados não são descobertos automaticamente.','Desenvolvimento e processo');
add(5,'Margem por serviço e cliente',P,'Calcula margem com base nos custos cadastrados.','Explicitar custos faltantes e completar critérios de apropriação quando necessário.','Desenvolvimento e processo');
add(5,'Lucro líquido completo',P,'Oferece resultado gerencial e despesas gerais.','Completar apuração e integração contábil antes de prometer fechamento contábil integral.','Desenvolvimento e integração');
add(5,'Formação automática de preço',P,'Disponibiliza preços, custos e indicadores.','Criar cálculo guiado com custo, capacidade, impostos aplicáveis e margem desejada.','Desenvolvimento');
add(5,'Custo real da hora produtiva',P,'Usa custo-hora informado e horas apontadas.','Incorporar encargos, ociosidade e despesas indiretas ao cálculo da hora.','Desenvolvimento');
add(5,'Orçado versus final',E,'Compara dados comerciais e valores, com maior profundidade no automotivo.','Demonstrar o fluxo do ramo vendido; não prometer equivalência integral entre módulos.');
add(5,'Serviços e peças que mais rendem',E,'Exibe rankings de receita e margem.','Margem depende dos custos registrados.');
add(5,'Múltiplas contas bancárias',P,'Controla os agrupamentos caixa e banco.','Criar contas bancárias individuais, saldos e transferências entre elas.','Desenvolvimento');
add(5,'Conciliação bancária automática',A,'Não foi identificada conciliação por extrato ou Open Finance.','Importar extratos ou conectar bancos e conciliar lançamentos.','Desenvolvimento e integração');
add(5,'Pix com confirmação integrada',X,'Há implementação com Mercado Pago.','Configurar credenciais e validar cobrança, confirmação e operação real por empresa.','Ativação externa e validação');
add(5,'Boleto e integração com maquininhas',A,'É possível registrar formas de pagamento, sem fluxo completo de emissão ou conciliação.','Integrar emissão de boletos, adquirentes e confirmação dos recebimentos.','Desenvolvimento e integração');
add(5,'Emissão fiscal',A,'Não foi identificada emissão fiscal integrada.','Implementar emissão adequada de NFS-e/NF-e e suas operações, conforme o escopo comercial.','Desenvolvimento e integração');
add(5,'Importação de XML de compra',E,'Lê XML de NF-e para auxiliar a entrada da compra.','Importação não equivale a emissão fiscal nem a verificação completa na SEFAZ.');
add(5,'Integração com contador',A,'Não foi identificada integração contábil pronta.','Criar exportação ou integração contábil compatível com o processo do cliente.','Integração');
add(5,'Mensalidades de contratos dos clientes',P,'Contas recorrentes ajudam no registro financeiro.','Ligar cobrança a contrato, vigência, reajuste, franquia e serviços excedentes.','Desenvolvimento');
add(5,'Assinatura do nosso software',X,'Há integração para cobrança da assinatura do SaaS.','Configurar e validar o ambiente comercial de assinaturas. É distinto da cobrança dos serviços do cliente.','Ativação externa e validação');

add(6,'Saldo de estoque',E,'Controla produtos, movimentações e saldo.');
add(6,'Estoque zerado e abaixo do mínimo',E,'Destaca itens que precisam de atenção.');
add(6,'Custo médio de compra',E,'Atualiza o custo médio a partir das entradas de compra.');
add(6,'Consumo vinculado ao serviço',E,'Relaciona itens consumidos ao atendimento e ao estoque.');
add(6,'Proteção contra consumo duplicado',E,'Usa controles transacionais para evitar repetir movimentações em operações críticas.');
add(6,'Peça própria ou do cliente',E,'Diferencia origem e tratamento de custo do item.');
add(6,'Reserva de estoque para OS',P,'Calcula quantidades comprometidas e disponíveis nos relatórios.','Completar reserva transacional, liberação e prevenção de conflitos em todos os fluxos.','Desenvolvimento');
add(6,'Estoque parado',E,'Identifica itens sem movimentação, com maior detalhamento no automotivo.','Confirmar o conjunto de indicadores disponível no ramo apresentado.');
add(6,'Compra integrada a estoque e contas',E,'Relaciona fornecedor, itens, estoque e financeiro.');
add(6,'Pedidos com entregas parciais',P,'Registra compras e recebimentos nos fluxos existentes.','Completar pedido, múltiplas entregas, saldo pendente e reposições.','Desenvolvimento');
add(6,'Cotação com vários fornecedores',A,'Não foi identificada rodada estruturada de cotações.','Comparar propostas, preços, prazos e condições, com escolha e histórico.','Desenvolvimento');
add(6,'Sugestão automática de compra',P,'Estoque mínimo indica necessidade de atenção.','Calcular reposição com consumo, prazo do fornecedor e estoque de segurança.','Desenvolvimento');
add(6,'Estoque por série ou IMEI',A,'Série/IMEI do equipamento atendido não constitui estoque serializado.','Rastrear cada unidade desde a entrada até venda, instalação e garantia.','Desenvolvimento');
add(6,'Estoque por lote e validade',P,'Algumas fichas registram lote como informação.','Criar saldo, consumo e rastreabilidade por lote e vencimento.','Desenvolvimento');
add(6,'Etiquetas e código de barras',A,'Não foi identificado fluxo completo de impressão e leitura.','Implementar etiquetas de produtos/equipamentos e leitura integrada às operações.','Desenvolvimento');
add(6,'Estoque por depósito e veículo',A,'Não foi identificado controle completo por múltiplos locais.','Separar saldos e transferir materiais entre loja, depósito e veículo do técnico.','Desenvolvimento');
add(6,'Devolução e crédito do fornecedor',P,'Há ajustes e registros de estoque.','Controlar solicitação, análise, envio, substituição, crédito e encerramento da devolução.','Desenvolvimento');
add(6,'Catálogos externos de fornecedores',A,'Não foi identificada consulta integrada a distribuidores.','Integrar aplicações, preços e disponibilidade de peças.','Integração');

add(7,'Fotos de entrada e saída',E,'Registra imagens e observações do estado inicial e resultado.');
add(7,'Testes antes e depois',E,'Oferece fichas e verificações específicas por especialidade.');
add(7,'Retorno em garantia',E,'Registra ocorrências relacionadas ao atendimento.');
add(7,'Motivo e custo de retrabalho',E,'Registra motivo, solução, horas e custos de qualidade.');
add(7,'Vínculo com serviço e funcionário',E,'Relaciona ocorrências aos atendimentos e responsáveis registrados.');
add(7,'Determinação automática da causa',A,'O sistema registra a atribuição informada, sem comprovar tecnicamente a causa.','Não prometer culpa automática. Pode evoluir para análise orientada de causa com evidências.','Análise especializada');
add(7,'Tempo para resolver reclamação',E,'Usa datas e situação das ocorrências para acompanhar resolução.');
add(7,'Garantia com fabricante',P,'Registra referência e tipo de garantia.','Completar solicitação, autorização, peças, comprovação e ressarcimento do fabricante.','Desenvolvimento e integração');
add(7,'Satisfação de todos os clientes',P,'Mostra avaliações registradas em ocorrências.','Coletar avaliações de uma população definida e mostrar cobertura; não chamar a média atual de satisfação geral.','Desenvolvimento e processo');
add(7,'Pesquisa automática pós-atendimento',A,'Não foi identificada rotina universal de pesquisa após cada serviço.','Criar convite, resposta, acompanhamento e tratamento de insatisfação.','Desenvolvimento e integração');
add(7,'Aceite de manutenção e limpeza',E,'Registra aceite, ressalvas, recusa e histórico.');
add(7,'Assinatura eletrônica especializada',P,'Existem registros de confirmação e aceite.','Integrar processo especializado quando o comprador exigir esse tipo de assinatura.','Integração');
add(7,'Custódia de itens não retirados',P,'Há estados e acompanhamento de serviços prontos.','Completar notificações, documentos e histórico de custódia e retirada.','Desenvolvimento e processo');

add(8,'Funcionário sem login',E,'Cadastra o funcionário sem criar acesso ao sistema.');
add(8,'Dados de contratação e salário',E,'Registra admissão, salário, função e contato na ficha.');
add(8,'Férias, ausências e recados',E,'Guarda registros administrativos do funcionário.');
add(8,'Vales e empréstimos',E,'Registra valores e acompanha seus lançamentos.');
add(8,'Comissões',E,'Calcula e acompanha comissões nos fluxos implementados.','Depende das regras e percentuais cadastrados.');
add(8,'Horas por atendimento',E,'Registra apontamentos de trabalho associados ao serviço.');
add(8,'Faturamento por funcionário',P,'Nos não automotivos, rateia a receita entre participantes do atendimento.','Criar atribuição por serviço, participação ou outro critério explícito quando necessário.','Desenvolvimento e processo');
add(8,'Contribuição individual exata',P,'Disponibiliza rateio, horas e registros relacionados.','Relacionar efetivamente produção, venda, execução e custo por participante; rateio não comprova contribuição exata.','Desenvolvimento e processo');
add(8,'Produtividade e retrabalho da equipe',E,'Combina horas, atendimentos e ocorrências registradas.','Depende da qualidade dos apontamentos e da atribuição das ocorrências.');
add(8,'Folha, eSocial e ponto legal',A,'A ficha de funcionário é administrativa.','Implementar ou integrar folha e obrigações específicas se fizerem parte da oferta.','Desenvolvimento e integração');
add(8,'Escala automática da equipe',A,'Não foi identificada montagem automática considerando férias e qualificações.','Combinar jornada, ausências, competências e demanda.','Desenvolvimento');
add(8,'Validade de treinamentos e aptidões',P,'Registros administrativos podem guardar informações.','Criar matriz de aptidões e vencimentos ligada à atribuição dos serviços.','Desenvolvimento');

add(9,'Vendas e recebimentos no período',E,'Apresenta receita dos atendimentos e movimentos financeiros.','Conferir a data e o critério usados por cada quadro.');
add(9,'Ranking de devedores',E,'Mostra clientes com valores em aberto.');
add(9,'Clientes por faturamento',E,'Ordena clientes pela receita registrada.');
add(9,'Clientes por margem',P,'Calcula o resultado a partir dos custos informados.','Mostrar completude dos custos e completar a apropriação necessária.','Desenvolvimento e processo');
add(9,'Clientes por custo de garantia',E,'Relaciona custos de ocorrências aos clientes.','É necessário registrar e vincular corretamente o retrabalho.');
add(9,'Serviços vendidos e rentáveis',E,'Apresenta rankings de venda e margem.','Rentabilidade depende dos custos registrados.');
add(9,'Tempo até o serviço ficar pronto',E,'Calcula o tempo decorrido até a conclusão.','Tempo decorrido inclui espera; não equivale a horas produtivas.');
add(9,'Tempo de trabalho versus espera',P,'Há histórico de etapas e apontamentos.','Consolidar a separação de espera e trabalho com critérios uniformes.','Desenvolvimento e processo');
add(9,'Motivos de parada',E,'Analisa os motivos registrados nas pausas.');
add(9,'Ocupação da oficina',P,'Há capacidade informada e indicadores.','Aprofundar a ocupação por recurso, capacidade real e disponibilidade.','Desenvolvimento');
add(9,'Resultado por contrato',P,'Existem dados de atendimentos e custos.','Estruturar contratos e apropriar receita, visitas, materiais e despesas por contrato.','Desenvolvimento');
add(9,'Resolução na primeira visita',P,'Há atendimentos, retornos e ocorrências.','Definir e calcular indicador próprio com vínculo entre problema, visita e retorno.','Desenvolvimento');
add(9,'Custo histórico por equipamento',P,'Existe histórico de atendimentos.','Consolidar custos por ativo ao longo de seu ciclo de vida.','Desenvolvimento');
add(9,'Reparar ou substituir equipamento',A,'Não foi identificada análise dedicada dessa decisão.','Comparar custo histórico, falhas, indisponibilidade e custo de substituição.','Desenvolvimento');
add(9,'Rentabilidade por filial',A,'Acesso a várias empresas não equivale a consolidação de filiais.','Consolidar unidades e tratar custos, receitas e transferências entre elas.','Desenvolvimento');
add(9,'Completude dos dados de margem',P,'Há avisos sobre custos não registrados.','Criar sinalização mais clara de completude e confiança dos dados usados no resultado.','Desenvolvimento');

add(10,'Abrir WhatsApp do cliente',E,'Abre a conversa usando o contato cadastrado.');
add(10,'Avisar que o serviço está pronto',E,'Prepara a comunicação e abre a conversa por ação do usuário.','Não é envio automático universal.');
add(10,'Conversa centralizada na OS',A,'Não foi identificada caixa de entrada bidirecional completa.','Integrar mensagens recebidas e enviadas ao histórico do atendimento.','Desenvolvimento e integração');
add(10,'Aprovação automática a partir do WhatsApp',A,'A conversa externa não vira automaticamente prova estruturada.','Implementar autorização vinculada à versão, identidade e evidência da mensagem.','Desenvolvimento e integração');
add(10,'Lista de clientes para contatar',E,'Identifica acompanhamentos e pendências, com maior profundidade no automotivo.','Validar os motivos e a cobertura disponíveis no ramo apresentado.');
add(10,'Recontato de troca de óleo com IA',X,'A previsão e o texto padrão usam dados informados; a IA de texto foi preparada.','Ativar e validar a IA externamente. Não há leitura automática da quilometragem real.','Ativação externa e validação');
add(10,'Lembretes automáticos',X,'Há fluxos de automação preparados.','Configurar canais, segredos, planos e destinatários e validar os fluxos suportados.','Ativação externa e validação');
add(10,'Mini site da empresa',E,'Oferece apresentação e conteúdo personalizável conforme o plano.');
add(10,'Portal do cliente',E,'Permite consultar serviços e atualizações com acesso controlado.','Exige plano e liberação de acesso.');
add(10,'Agendamento público pelo cliente',A,'Não foi identificado fluxo público completo de escolha de disponibilidade.','Implementar horários disponíveis, regras, reserva e confirmação.','Desenvolvimento');
add(10,'Loja virtual completa',P,'Permite exposição de peças e pedidos.','Completar carrinho, pagamento, frete e processamento de pedidos.','Desenvolvimento e integração');
add(10,'Solicitação de avaliação pública',A,'Não foi identificada automação universal de avaliações.','Criar solicitação e acompanhamento de avaliações pós-serviço.','Desenvolvimento e integração');

add(11,'Importar clientes e catálogo',E,'Importa CSV com validações e limite por arquivo.','Até 500 linhas e 3 MB por arquivo no importador examinado.');
add(11,'Migrar histórico completo',P,'Importadores disponíveis atendem partes dos cadastros.','Migrar OS, financeiro, anexos e histórico dos sistemas de origem.','Desenvolvimento e implantação');
add(11,'Exportar todos os dados da empresa',P,'Há documentos e consultas exportáveis.','Oferecer exportação completa e organizada por empresa, incluindo anexos.','Desenvolvimento');
add(11,'Separação de dados entre empresas',E,'Usa autenticação e regras de acesso por empresa.','Existência da estrutura não é uma certificação de segurança.');
add(11,'Permissões personalizadas',P,'Oferece perfis de acesso e controle por plano.','Criar permissões mais granulares e personalizáveis por função.','Desenvolvimento');
add(11,'Autenticação multifator',A,'Não foi encontrado fluxo de multifator na experiência examinada.','Implementar ativação, recuperação e uso de autenticação adicional.','Desenvolvimento e configuração');
add(11,'Proteção contra operações duplicadas',E,'Há mecanismos para evitar repetição de pagamentos e estoque em operações críticas.');
add(11,'Proteção contra edição desatualizada',E,'Controla revisões para evitar sobrescrever silenciosamente alterações recentes.');
add(11,'Recuperação após falha grave',P,'Existem ferramentas e procedimentos de backup e restauração.','Executar e documentar restauração completa no ambiente operacional, incluindo arquivos.','Validação operacional');
add(11,'Offline em todos os ramos',P,'O offline disponível se restringe à entrada automotiva.','Ampliar cobertura e validar conflitos e recuperação da sincronização.','Desenvolvimento e validação');
add(11,'Escala com concorrência real',P,'Há paginação, índices e evidências de testes locais com muitos registros.','Validar concorrência real, rede, fotos, relatórios e limites da infraestrutura.','Validação de desempenho');
add(11,'Aprendizado por usuários iniciantes',P,'Há simplificações e recursos de ajuda.','Realizar testes de tarefas com iniciantes e corrigir os obstáculos medidos.','Validação de usabilidade');
add(11,'Suporte com prazo definido',X,'Há acesso à ajuda e diagnóstico para suporte.','Definir equipe, canais, horário e prazo de resposta na operação comercial.','Operação comercial');
add(11,'Processos completos de privacidade',P,'Há proteções técnicas e controle de acesso.','Completar retenção, solicitações dos titulares, exportação e procedimentos operacionais.','Desenvolvimento e operação');

const expected = {3:14,4:16,5:23,6:18,7:13,8:12,9:16,10:12,11:14};
for (const [k, count] of Object.entries(expected)) {
  const actual = data.filter(x => x.chapter === Number(k)).length;
  if (actual !== count) throw new Error(`Capítulo ${k}: ${actual}, esperado ${count}`);
}
if (new Set(data.map(x=>x.id)).size !== data.length) throw new Error('IDs duplicados');
const pending = data.filter(x => x.status !== E);
if (pending.some(x => !x.gap || !x.nature)) throw new Error('Pendência sem explicação');

const wb = Workbook.create();
const pend = wb.worksheets.add('Pendências');
const full = wb.worksheets.add('Funcionalidades');
function makeSheet(sheet, title, headers, rows, widths, tableName) {
  const end = 7 + rows.length;
  sheet.showGridLines = false;
  sheet.tabColor = '#243B53';
  sheet.getRange(`A1:F${end}`).format.font = {name:'Arial',size:11,color:'#243B53'};
  sheet.getRange('A2').values = [[title]];
  sheet.getRange('A2').format.font = {name:'Arial',size:16,bold:true,color:'#172B4D'};
  sheet.getRange('A2:F2').format.rowHeight = 28;
  sheet.getRange('A3').values = [['Base: relatório de 21/10/2026. Organização em 22/10/2026. Capítulos 3 a 11.']];
  sheet.getRange('A4').values = [['Presente: implementado. Parcial: limitado. Ausente: não identificado. Externo: ativação ou operação pendente.']];
  sheet.getRange('A5').values = [['A disponibilidade depende do ramo e do plano. Esta organização não representa nova auditoria ou teste de produção.']];
  sheet.getRange('A3:F5').format.font = {name:'Arial',size:11,color:'#526579'};
  sheet.getRange('A3:F5').format.rowHeight = 22;
  sheet.getRange('A6:F6').format.borders = {bottom:{style:'thin',color:'#9FB3C8'}};
  sheet.getRange('A7:F7').values = [headers];
  sheet.getRange(`A8:F${end}`).values = rows;
  sheet.getRange(`A7:F${end}`).format.wrapText = true;
  sheet.getRange(`A7:F${end}`).format.verticalAlignment = 'center';
  sheet.getRange(`A8:F${end}`).format.rowHeight = 82;
  widths.forEach((w,i)=>sheet.getRange(`${String.fromCharCode(65+i)}1:${String.fromCharCode(65+i)}${end}`).format.columnWidthPx=w);
  const table = sheet.tables.add(`A7:F${end}`,true,tableName);
  table.showFilterButton = true;
  sheet.getRange('A7:F7').format = {fill:'#243B53',font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},rowHeight:34,horizontalAlignment:'center',verticalAlignment:'center',wrapText:true};
  sheet.getRange(`A8:D${end}`).format.font = {name:'Arial',size:11,color:'#243B53'};
  sheet.getRange(`A8:A${end}`).format.horizontalAlignment = 'center';
  sheet.getRange(`D8:D${end}`).format.horizontalAlignment = 'center';
  sheet.getRange(`D8:D${end}`).dataValidation = {rule:{type:'list',values:[E,P,A,X]}};
  const palette = {[E]:['#E5F2EA','#23613E'],[P]:['#FFF0CC','#845B0F'],[A]:['#FCE8E6','#A02B26'],[X]:['#E3EFFB','#245A89']};
  for (const [s,[bg,fg]] of Object.entries(palette)) sheet.getRange(`D8:D${end}`).conditionalFormats.add('containsText',{text:s,format:{fill:bg,font:{color:fg,bold:true}}});
  let previous = '';
  rows.forEach((row,i)=>{
    const r=i+8;
    sheet.getRange(`A${r}:F${r}`).format.fill = i % 2 ? '#FFFFFF' : '#F3F6FA';
    if (row[1]!==previous) sheet.getRange(`A${r}:F${r}`).format.borders={top:{style:'medium',color:'#9FB3C8'}};
    previous=row[1];
    const lines = Math.max(...row.map((v,j)=>Math.ceil(String(v).length/Math.max(8,Math.floor(widths[j]/7)))));
    sheet.getRange(`A${r}:F${r}`).format.rowHeight=Math.max(44,Math.min(110,lines*15+12));
  });
  sheet.freezePanes.freezeRows(7);
  sheet.freezePanes.freezeColumns(3);
}
makeSheet(pend,'Pendências por tópico',
  ['ID','Tópico','Funcionalidade','Situação','O que falta ou precisa melhorar','Tipo de pendência'],
  pending.map(x=>[x.id,`${x.chapter}. ${x.topic}`,x.feature,x.status,x.gap,x.nature]),
  [65,205,265,115,560,225],'PendenciasProduto');
makeSheet(full,'Funcionalidades para consulta comercial',
  ['ID','Tópico','Funcionalidade','Situação','Como explicar o que existe hoje','Limite ou próximo passo'],
  data.map(x=>[x.id,`${x.chapter}. ${x.topic}`,x.feature,x.status,x.delivery,x.gap]),
  [65,205,265,115,490,490],'CatalogoFuncionalidades');

wb.recalculate();
const stats = Object.fromEntries([E,P,A,X].map(s=>[s,data.filter(x=>x.status===s).length]));
console.log(JSON.stringify({total:data.length,pendencias:pending.length,porSituacao:stats,porCapitulo:expected}));
console.log((await wb.inspect({kind:'table',range:'Funcionalidades!A7:F10',include:'values,formulas',tableMaxRows:4,tableMaxCols:6,maxChars:2000})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!',options:{useRegex:true,maxResults:12},summary:'Erros na matriz'})).ndjson);
for (const name of ['Pendências','Funcionalidades']) {
  const image = await wb.render({sheetName:name,range:'A1:F11',scale:1,format:'png'});
  await fs.writeFile(path.join(out,`${name}-preview.png`),new Uint8Array(await image.arrayBuffer()));
}
const file = await SpreadsheetFile.exportXlsx(wb);
await file.save(path.join(out,'funcionalidades-e-pendencias.xlsx'));
await fs.writeFile(path.join(out,'dados.json'),JSON.stringify(data,null,2));
await fs.writeFile(path.join(out,'validacao.json'),JSON.stringify({total:data.length,pendencias:pending.length,porSituacao:stats,porCapitulo:expected,fonte:'Relatório da conversa de 21/10/2026',organizadoEm:'2026-10-22'},null,2));
