import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,Image,KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage
root=Path('output/regressao-assistencia-manutencao-limpeza-20261116').resolve()
out=Path('output/pdf/relatorio-regressao-assistencia-manutencao-limpeza-20261116.pdf').resolve()
out.parent.mkdir(parents=True,exist_ok=True)
s=json.loads((root/'sumario.json').read_text(encoding='utf-8'))
for n,f in [('Arial','arial.ttf'),('Arial-Bold','arialbd.ttf')]:pdfmetrics.registerFont(TTFont(n,'C:/Windows/Fonts/'+f))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold',italic='Arial',boldItalic='Arial-Bold')
ink,green,pale,border=[colors.HexColor(c) for c in ['#19352c','#17644c','#eff5f0','#d2dfd6']]
styles=getSampleStyleSheet()
for name,size,leading,color,bold in [('BodyQ',9.2,13.5,ink,False),('CellQ',8,11,ink,False),('HeadQ',8,11,colors.white,True),('TitleQ',28,33,ink,True),('H1Q',18,23,green,True),('H2Q',12,17,ink,True),('SmallQ',7.8,11,ink,False)]:
 styles.add(ParagraphStyle(name=name,fontName='Arial-Bold' if bold else 'Arial',fontSize=size,leading=leading,textColor=color,spaceAfter=8,keepWithNext=name in ['H1Q','H2Q']))
story=[]
def p(t,style='BodyQ',raw=False):return Paragraph(str(t) if raw else escape(str(t)),styles[style])
def add(t,style='BodyQ',raw=False):story.append(p(t,style,raw))
def table(heads,rows,widths):
 data=[[p(h,'HeadQ') for h in heads]]+[[p(c,'CellQ') for c in r] for r in rows]
 t=Table(data,colWidths=[w*mm for w in widths],repeatRows=1,hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),green),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,pale]),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.4,border),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
 story.extend([t,Spacer(1,10)])
def sec(n):return '—' if n is None else f'{n:.3f}'.replace('.',',')
def picture(path,w=176*mm,h=150*mm):
 with PILImage.open(path) as i:x,y=i.size
 scale=min(w/x,h/y);return Image(str(path),width=x*scale,height=y*scale)
def footer(c,d):
 c.saveState();c.setStrokeColor(border);c.line(17*mm,16*mm,193*mm,16*mm);c.setFont('Arial',7.5);c.setFillColor(ink)
 c.drawString(17*mm,11*mm,'Pátio | Testes de 16/11/2026 | Empresas fictícias');c.drawRightString(193*mm,11*mm,str(d.page));c.restoreState()
def link(label,file):return '<link color="#17644c" href="'+escape((root/file).as_uri(),{'"':'&quot;'})+'">'+escape(label)+'</link>'
add('PÁTIO / TESTES E TEMPOS','H2Q')
add('Assistência técnica,<br/>manutenção e limpeza','TitleQ',True)
add('Criação, edição e consulta de orçamentos e ordens de serviço no site publicado. Desktop e celular emulado. Rodada de 16/11/2026.')
table(['Subsistemas','Casos completos','Operações medidas'],[[16,len(s['documentos']),len(s['tempos'])]],[58,59,59])
add('Esta rodada testa os 16 subsistemas não automotivos. Os testes das dez oficinas pertencem ao relatório anterior e não foram somados aqui. Todos os registros foram criados em empresas fictícias identificadas por ZZ [TESTE 20261019].')
table(['Ramo','Casos completos','Operações'],[[r['nome'],r['documentos'],r['operacoes']] for r in s['resumo'].values()],[100,38,38])
add('Atenção à estabilidade','H2Q')
add('A rodada simultânea encontrou timeouts reais do banco (57014), incluindo gravação, consulta e validação de acesso. Os casos pendentes foram repetidos sequencialmente. Retestes funcionais aprovados não provam a eliminação de toda indisponibilidade do servidor. As tentativas com falha estão documentadas.')
add('Relatórios completos, com filtro e evidência de cada caso:','H2Q')
for label,f in [('Índice da rodada','relatorio.html'),('Assistência técnica','assistencia.html'),('Manutenção de campo','manutencao.html'),('Limpeza','limpeza.html')]:add(link(label,f),raw=True)
add('Os links abrem arquivos locais do projeto. Este PDF reúne a matriz, os tempos e evidências selecionadas; os HTMLs detalham cada ação, clique, campo e tentativa.','SmallQ')
story.append(PageBreak())
add('Método e limites da medição','H1Q')
add('Os segundos incluem as ações rápidas da automação e as esperas pela interface. Não representam o tempo de digitação de uma pessoa. Não são uma comparação antes/depois nem um teste de capacidade de produção.')
add('Foi usada a CPU e a conexão do computador de teste, sem limitação artificial. A impressão foi conferida pela abertura da nota e pelo PDF; não foi utilizada impressora de papel.','SmallQ')
table(['Aspecto','Condição'],[['Desktop','Chromium, 1920 × 1080.'],['Celular','Chromium com toque, 390 × 844 e escala 2. Layout complementar em 320 px. Não houve teste em aparelho físico nem Safari.'],['Rodada inicial','Três navegadores de teste e um roteiro de API em paralelo.'],['Retestes','Um fluxo por vez, com registro separado das tentativas.'],['Consulta','Número, cliente e equipamento/local pela listagem. Usa o cache normal do produto.'],['Simples','Cliente, equipamento/local e um serviço cadastrado.'],['Completo','12 itens, catálogo e estoque, dez avulsos, quantidades, custos, desconto, data, descrição, observações e ficha específica.']],[42,134])
add('O que é conferido em cada documento','H2Q')
add('Total inicial, quantidade de itens, tipo de documento, ficha do ramo, vínculo do material com estoque e custos. Depois: alteração de preço, quantidade e desconto; edição de ficha e data; recarga completa; histórico e PDF. A escolha de desconto na impressão é validada sem alterar a conta financeira.')
add('Cálculos de referência','H2Q')
table(['Cenário','Inicial','Após edição'],[['Simples','1 × R$ 200,00','2 × R$ 225,00 − R$ 20,00 = R$ 430,00'],['Completo','R$ 925,00 − 10% = R$ 832,50','R$ 1.200,00 − R$ 20,00 = R$ 1.180,00']],[37,62,77])
add('No orçamento, o desconto da proposta aparece. Na OS, quando ocultado, a nota mostra o total bruto de R$ 1.200,00, enquanto o valor interno permanece R$ 1.180,00. Quando habilitado, a nota simples mostra R$ 430,00 e o desconto de R$ 20,00.','SmallQ')
story.append(PageBreak())
add('Correção e conferências adicionais','H1Q')
add('Login: falha de infraestrutura era apresentada como e-mail ou senha incorretos. A mensagem passou a distinguir indisponibilidade, problema de conexão, limite de tentativas, e-mail não confirmado e credenciais inválidas. Não expõe detalhes internos nem cria novas tentativas automáticas de gravação.')
add('Busca de cliente/equipamento: acrescentado Tentar novamente, preservando o termo, os campos e o foco por toque ou teclado. A busca não repete silenciosamente a consulta após uma falha. Opções antigas não podem ser confirmadas enquanto houver erro ou carregamento.')
add('Ao selecionar um cadastro já encontrado, seu nome fica disponível imediatamente no cache da empresa. Nos testes de recuperação, não houve nova consulta por ID para obter o mesmo nome.','SmallQ')
add('Não houve alteração de esquema de banco nesta rodada. O código de produto alterado está no tratamento de erro de entrada e na recuperação das buscas. Os demais arquivos novos são roteiros de teste e relatórios. Os ajustes de seletores/esperas nos pilotos não são contados como bugs do produto.')
table(['Verificação','Resultado'],[['Matriz de criação, edição e consulta',f"{len(s['documentos'])}/128 casos; {s['checks']} verificações"],['Ciclo de integrações no banco publicado',f"{sum(bool(x.get('ok')) for x in s['banco'])}/16 perfis"],['Jornada completa pela interface',f"{sum(bool(x.get('ok')) for x in s['ciclo'])}/16 perfis"],['Exceções e layout estreito',f"{sum(bool(x.get('ok')) for x in (s.get('excecoes') or {}).get('resultados',[]))}/16 perfis"],['PDFs conferidos',s.get('pdfs')],['Regressão local',f"{s.get('suitesOk')}/{s.get('suites')} suítes"]],[112,64])
add('Integrações verificadas','H2Q')
add('Aprovação total e parcial e recusa pelo link; conflito de revisão; execução, pausa e retomada; conclusão e reabertura com estorno e nova baixa; retirada ou aceite; pagamento parcial e quitação com taxa de cartão; bloqueio de recebimento excedente; retrabalho; margem e relatórios.')
add('Referência financeira: receita R$ 405,00, serviços R$ 50,00, materiais R$ 60,00, retrabalho R$ 12,50 e taxa R$ 5,00. Custo total R$ 127,50; margem R$ 277,50; caixa líquido R$ 400,00. No ciclo UI: receita R$ 360,00, custo R$ 100,00 e margem R$ 260,00.')
add('Publicação','H2Q');add('Build inicial: -131017089. Build final: '+str((s.get('publicacao') or {}).get('build','não registrada'))+'. Site: https://patio-gestao-peach.vercel.app. Os testes reais desta rodada estão vinculados ao build registrado em cada evidência.')
add(f"Na versão final: {len((s.get('login') or {}).get('resultados',[]))}/15 respostas controladas de login e {sum(bool(x.get('ok')) for x in (s.get('busca') or {}).get('resultados',[]))}/32 recuperações de busca, seguidas de criação real de OS/orçamento. O login controlado não envia tentativas ao provedor. A matriz principal ocorreu no build inicial; 15 jornadas completas e as 32 criações de recuperação validam o build final.",'SmallQ')
if s.get('concorrencia'):
 c=s['concorrencia'];story.append(PageBreak());add('Repetição simultânea após publicação','H1Q')
 add(c['metodo'])
 table(['Camada','Resultado'],[['Criação, edição, consulta e PDF',f"{len(c['casos'])}/12 casos completos"],['Operações de interface cronometradas',len(c['operacoes'])],['Leituras extras de alertas e detalhes',f"{sum(bool(x['ok']) for x in c['rpc'])}/{len(c['rpc'])}"],['Falhas de interface',len(c['falhas'])],['Duração total da execução',sec(c['segundos'])+' s']],[112,64])
 add('Os três navegadores usaram celulares, climatização e limpeza pós-obra, com orçamentos e OS simples e completos. O quarto cliente consultou alertas e detalhes de uma empresa fictícia de informática. Foram verificados totais, alterações, consulta, recarga, histórico, PDF e layout de 390 px.')
 add('A repetição limitada passou sem timeouts. Ela melhora a evidência de estabilidade, mas não isola a causa da falha anterior nem certifica capacidade para muitos usuários. Não foram alterados plano de infraestrutura, limite de banco ou permissões.')
 add('Seus tempos e casos adicionais estão em concorrencia-publicado/resultado.json e não foram misturados com a matriz principal de 128 casos.','SmallQ')
for g,r in s['resumo'].items():
 story.append(PageBreak());add(r['nome']+' | tempos gerais','H1Q')
 add('Segundos por operação. Mediana descreve a amostra central; P95 inclui as esperas mais lentas. Apenas casos que chegaram ao PDF entram nesta tabela; as falhas ficam em seção separada.')
 table(['Operação','N','Mediana','P95','Maior'],[[n,t['n'],sec(t['mediana']),sec(t['p95']),sec(t['maximo'])] for n,t in r['tempos'].items()],[82,16,26,26,26])
 add('Fluxos completos e simples estão combinados nas estatísticas gerais. As páginas seguintes separam cada subsetor e cenário.','SmallQ')
 for perfil,nome in s['nomes'].items():
  ds=[d for d in s['documentos'] if d['perfil']==perfil and d['ramo']==g]
  if not ds:continue
  story.append(PageBreak());add(nome,'H1Q')
  add(f'{len(ds)}/8 casos concluídos: orçamento e OS, simples e completo, desktop e celular.')
  def tempo(d,n):return next((t['segundos'] for t in s['tempos'] if all(t.get(k)==d.get(k) for k in ['perfil','width','caso','pasta']) and t['nome']==n),None)
  table(['Tela / documento','OS / proposta','Criar','Buscar nº','Editar itens','Editar ficha'],[[f"{d['width']} px / {d['caso']}",'#'+str(d['numero']),sec(tempo(d,'Criar documento')),sec(tempo(d,'Consultar pelo número')),sec(tempo(d,'Editar itens e valores')),sec(tempo(d,'Editar ficha e data'))] for d in sorted(ds,key=lambda d:(-d['width'],d['caso']))],[53,27,24,24,24,24])
  rows=[]
  for label,items in [('Banco',s['banco']),('Jornada na interface',s['ciclo']),('Exceções e layout',(s.get('excecoes') or {}).get('resultados',[]))]:
   x=next((x for x in items if x['perfil']==perfil),{});rows.append([label,'Aprovado' if x.get('ok') else 'Pendente / falha',x.get('checks') if isinstance(x.get('checks'),int) else len(x.get('checks',[]))])
  table(['Complemento','Situação','Verificações'],rows,[85,60,31])
  add('A consulta também foi realizada pelo nome do cliente e pelo equipamento/local. O documento foi recarregado, seu histórico aberto e seu PDF baixado. O detalhamento de todas as ações e seus cliques está no HTML do ramo.','SmallQ')
  add('Rodadas: '+', '.join(sorted(set('sequencial' if d['pasta'].startswith('retestes') else 'inicial simultânea' for d in ds)))+'.','SmallQ')
story.append(PageBreak());add('Falhas da matriz principal e retestes','H1Q')
add('As falhas de servidor são mantidas como evidência, mesmo quando a repetição posterior passou. O encerramento de uma execução de teste não é apresentado como caso aprovado.')
table(['Subsetor / tela','Etapa','Erro / cobertura final'],[[s['nomes'][f['perfil']]+' / '+str(f['width']),f['etapa'],('Timeout de banco' if '57014' in f['erro'] else 'Espera da interface esgotada')+f". Cobertura posterior: {sum(d['perfil']==f['perfil'] and d['width']==f['width'] for d in s['documentos'])}/4."] for f in s['falhas']],[52,60,64])
add('Diagnóstico: foram consultados logs de cancelamento, estatísticas de execução, conexões e saúde da API. A tabela maior tinha cerca de 11 mil registros; não houve evidência de bloqueio prolongado no instante observado. Não foi comprovada uma causa única dos timeouts.','SmallQ')
add('Os JSONs de banco também preservam falhas anteriores. Em Vidros, uma tentativa de concluir serviço suspenso foi corretamente bloqueada: a preparação do teste foi ajustada, sem mudança na regra do produto.','SmallQ')
for g in s['resumo']:
 ds=[d for d in s['documentos'] if d['ramo']==g and d['tipo']=='ordem' and d['completo']]
 desktop=next((d for d in ds if d['width']==1920),None);mobile=next((d for d in ds if d['width']==390),None)
 if not desktop or not mobile:continue
 story.append(PageBreak());add(s['grupos'][g]+' | evidências','H1Q')
 add('Exemplos capturados no site publicado. As imagens originais de todos os casos estão nos relatórios HTML.','SmallQ')
 for d,limit in [(desktop,75*mm),(mobile,110*mm)]:
  path=root/d['pasta']/f"{d['perfil']}-{d['width']}-{d['caso']}-resumo.png"
  add(s['nomes'][d['perfil']]+' | '+str(d['width'])+' px | #'+str(d['numero']),'H2Q');story.append(picture(path,h=limit));story.append(Spacer(1,8))
SimpleDocTemplate(str(out),pagesize=(210*mm,297*mm),leftMargin=17*mm,rightMargin=17*mm,topMargin=18*mm,bottomMargin=23*mm,title='Pátio - assistência, manutenção e limpeza: testes e tempos',author='Codex').build(story,onFirstPage=footer,onLaterPages=footer)
print(str(out))
