import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage

root = Path('output/regressao-mapa-orcamentos-os-20261116').resolve()
out = Path('output/pdf/relatorio-regressao-mapa-orcamentos-os-20261116.pdf').resolve()
out.parent.mkdir(parents=True, exist_ok=True)
load = lambda p: json.loads((root / p).read_text(encoding='utf-8-sig'))
s = load('sumario.json')
suite = load('regressao/resultado.json')
offline = load('compartilhado/offline-reteste/resultado.json')
pdfs = load('compartilhado/pdfs-conferencia.json')
for nome, arquivo in [('Arial', 'arial.ttf'), ('Arial-Bold', 'arialbd.ttf'), ('Arial-Italic', 'ariali.ttf')]:
    pdfmetrics.registerFont(TTFont(nome, str(Path('C:/Windows/Fonts') / arquivo)))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold', italic='Arial-Italic', boldItalic='Arial-Bold')
ink, green, pale, border = map(colors.HexColor, ['#19352c', '#16634d', '#eef4ef', '#d4dfd7'])
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='CorpoQA', fontName='Arial', fontSize=9.4, leading=14, textColor=ink, spaceAfter=8))
styles.add(ParagraphStyle(name='CelulaQA', fontName='Arial', fontSize=8, leading=11, textColor=ink))
styles.add(ParagraphStyle(name='CabecalhoQA', parent=styles['CelulaQA'], fontName='Arial-Bold', textColor=colors.white))
styles.add(ParagraphStyle(name='NumeroQA', parent=styles['CelulaQA'], alignment=TA_RIGHT))
styles.add(ParagraphStyle(name='TituloQA', fontName='Arial-Bold', fontSize=28, leading=32, textColor=ink, spaceAfter=16))
styles.add(ParagraphStyle(name='H1QA', fontName='Arial-Bold', fontSize=18, leading=23, textColor=green, spaceBefore=15, spaceAfter=10, keepWithNext=True))
styles.add(ParagraphStyle(name='H2QA', fontName='Arial-Bold', fontSize=12, leading=17, textColor=ink, spaceBefore=10, spaceAfter=7, keepWithNext=True))
styles.add(ParagraphStyle(name='H2TabelaQA', parent=styles['H2QA'], keepWithNext=False))
styles.add(ParagraphStyle(name='PequenoQA', parent=styles['CorpoQA'], fontSize=8, leading=11, textColor=colors.HexColor('#5b7065')))
story = []
def p(text, style='CorpoQA', raw=False):
    return Paragraph(text if raw else escape(str(text)), styles[style])
def add(text, style='CorpoQA', raw=False):
    story.append(p(text, style, raw))
def table(headers, rows, widths, compact=False):
    data = [[p(x, 'CabecalhoQA') for x in headers]] + [[p(x) if isinstance(x, str) and '<br/>' in x else p(x, 'CelulaQA') for x in row] for row in rows]
    t = Table(data, colWidths=[x * mm for x in widths], repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), green), ('VALIGN',(0,0),(-1,-1),'TOP'), ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,pale]), ('LINEBELOW',(0,0),(-1,-1),0.4,border), ('LEFTPADDING',(0,0),(-1,-1),7), ('RIGHTPADDING',(0,0),(-1,-1),7), ('TOPPADDING',(0,0),(-1,-1),6), ('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    if compact:
        t.setStyle(TableStyle([('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3)]))
    story.extend([t, Spacer(1, 10)])
def image(path, maxw=176*mm, maxh=170*mm):
    file = root/path
    with PILImage.open(file) as im:
        w,h = im.size
    scale = min(maxw/w, maxh/h)
    return Image(str(file), width=w*scale, height=h*scale)
def link(label, path):
    return '<link color="#16634d" href="'+escape((root/path).as_uri(), {'"':'&quot;'})+'">'+escape(label)+'</link>'
def seconds(n):
    return '—' if n is None else f'{n:.3f}'.replace('.', ',')
def footer(c, doc):
    c.saveState()
    c.setStrokeColor(border);c.line(17*mm, 16*mm, 193*mm, 16*mm)
    c.setFont('Arial', 7.5);c.setFillColor(ink)
    c.drawString(17*mm, 11*mm, 'Pátio · Testes de 16/11/2026 · Empresas fictícias')
    c.drawRightString(193*mm, 11*mm, f'{doc.page}')
    c.restoreState()

add('PÁTIO / RELATÓRIO DE TESTES', 'H2QA')
add('Mapa da oficina,\norçamentos e OS'.replace('\n', '<br/>'), 'TituloQA', True)
add('Rodada ampla de regressão funcional, integrações e velocidade — 16/11/2026')
table(['Regressão inicial', 'Site publicado', 'Sem internet'], [['230/230 suítes', '10 perfis automotivos', '26 subsistemas / 260 verificações']], [58,59,59])
add('Foram executados fluxos simples e completos, edição, consulta, aprovação, pagamento, impressão, estoque e falhas controladas. Os casos finais incluídos neste relatório passaram. Houve duas correções de produto, publicadas e novamente testadas.')
table(['Módulo', 'Baterias', 'Registros de interface'], [[{'mapa':'Mapa da oficina','orcamentos':'Orçamentos','os':'Ordens de serviço'}[k], str(v['baterias']), str(v['registros'])] for k,v in s['modulos'].items()], [100,30,46])
add(f"Versão inicial: {s['buildInicial']}. Versão final publicada: {s['build']}. Foram conferidos os hashes de 332 arquivos publicados. Não houve migração de banco nesta rodada.")
add('Relatórios detalhados, com cada caso e suas evidências:', 'H2QA')
for nome, path in [('Índice completo', 'relatorio.html'), ('Todos os casos do mapa', 'mapa.html'), ('Todos os casos de orçamentos', 'orcamentos.html'), ('Todos os casos de OS', 'os.html')]:
    add(link(nome, path), raw=True)
add('Os links abrem os arquivos locais do projeto. O PDF reúne os resultados, as medições e as evidências selecionadas; os HTMLs permitem consultar e filtrar cada registro individual.', 'PequenoQA')

story.append(PageBreak())
add('O que foi encontrado e corrigido', 'H1QA')
table(['Problema', 'Correção e reteste'], [
 ['Fotos se recolhiam sozinhas após arquivo inválido e novo envio.', 'A abertura da seção preserva a escolha do usuário. Foram 24 verificações locais em 320, 390 e 1920 pixels, temas claro/escuro. As fotos de orçamentos e OS passaram por 80 verificações no site nas dez empresas.'],
 ['Falha temporária na consulta de acesso podia desmontar o formulário em uso.', 'As consultas de acesso repetem erros temporários no máximo duas vezes. Recusa de permissão continua imediata; erro persistente continua bloqueando. Foram 20 verificações locais e 20 no site publicado.'],
 ['Houve erro HTTP 500 ao criar uma OS pronta e demora para abrir o mapa.', 'Os logs registraram timeouts de servidor. Os fluxos foram repetidos e passaram. Uma resposta perdida depois de gravar foi simulada: o reenvio preservou a mesma OS, sem duplicar recebimento ou baixa de estoque.']
 ], [58,118])
add('Os retestes demonstram recuperação nos cenários executados. Eles não comprovam a eliminação de toda indisponibilidade do servidor. Não foram adicionadas retentativas automáticas de pagamentos ou outras gravações.')
add('Ajustes dos próprios testes', 'H2QA')
add('Os preparadores foram ajustados ao cadastro da retífica, ao retorno 204 do cancelamento e aos seletores corretos dos formulários. A simulação de foco e a espera pelos controles prontos foram corrigidas. A consulta de OS completa foi repetida depois da criação de todos os documentos necessários. As tentativas iniciais estão preservadas nos logs.')
add(f"Depois das correções, {s['suitesRepetidasAposCorrecoes']}/{s['suitesRepetidasAposCorrecoes']} suítes de código passaram novamente. Essa repetição se sobrepõe à bateria inicial; os totais não foram somados como suítes distintas.")
add('Como interpretar as medições', 'H2QA')
add('Os segundos medem a automação preenchendo e clicando rapidamente, incluindo as esperas pela interface. Não representam o tempo de digitação de uma pessoa nem uma comparação antes/depois. As baterias funcionais puderam executar em paralelo. Os testes de volume foram executados separadamente, ao final, com CPU quatro vezes mais lenta e revalidação artificial de dois segundos.')

escopos = {
'mapa':['Busca, quadro/lista, filtros, resumos e ordenação.', 'Avançar, voltar, parar por seis motivos, retomar, concluir e entregar.', 'Falha, clique duplo, revisão antiga e conferência independente do financeiro.', '100 e 500 OS, desktop/celular e três repetições de volume.'],
'orcamentos':['Criação simples, com cadastros e proposta completa de 12 itens.', 'Consulta e edição de quantidade, preço, desconto, observações, custos e condições.', 'Aprovação total/parcial pelo link, dependências, recusa, revisão, revogação e conversão sem duplicação.', 'Anexos, PDF, preservação de valores e documento de 100 itens.'],
'os':['Criação simples, com cadastros e OS completa de 12 itens.', 'Consulta e edição; serviços, fotos, lucro/custos, histórico e pagamento.', 'Pagamento antes de imprimir, recebimento total/parcial, data futura e adiamento.', 'Entrega sem repetir pagamento, peça reconhecida pelo vínculo, baixa única e custo no lucro.', 'Edição de documento de 100 itens e recuperação após resposta perdida.']}
evidencias={
'mapa':[('mapa/fluxos/mecanica-desktop-pronta.png','Mapa no desktop'),('mapa/fluxos/mecanica-celular-pronta.png','Mapa no celular')],
'orcamentos':[('orcamentos/simples-edicao/mecanica-celular-consulta.png','Consulta no celular'),('orcamentos/reteste-fotos-final/escuro-390.png','Seção de fotos permanece aberta após corrigir o envio')],
'os':[('os/entrega-sem-repeticao/retifica/tentativa-2.png','Pagamento antes de imprimir'),('os/interface/consulta-escuro-390.png','Consulta da OS em 390 pixels')]}
nomes={'mapa':'Mapa da oficina','orcamentos':'Orçamentos','os':'Ordens de serviço'}
for mod,dados in s['modulos'].items():
    story.append(PageBreak());add(nomes[mod],'TituloQA')
    add(f"{dados['baterias']} baterias / {dados['registros']} registros de interface. Cada cenário pode conter várias verificações internas. Os registros individuais estão no HTML deste módulo.")
    for item in escopos[mod]: add('• '+item)
    if mod=='mapa': add('Inclui 40 conferências adicionais do histórico financeiro, apresentadas separadamente.')
    add('Tempos por processo', 'H2TabelaQA')
    rows=[]
    for g in dados['tempos']:
        rows.append([g['nome'],str(g['n']),seconds(g.get('min'))+' / '+seconds(g.get('med'))+' / '+seconds(g.get('max')),g['cliques']])
    table(['Processo / cenário', 'Casos', 'Mín. / mediana / máx. (s)', 'Cliques'],rows,[83,15,55,23],compact=True)
    add('Traço significa não medido, não zero. Os cenários de erro e persistência não receberam um tempo de atendimento fictício.', 'PequenoQA')
    story.append(PageBreak());add('Evidências — '+nomes[mod], 'H1QA')
    if mod != 'mapa':
        figuras = evidencias[mod]
        t = Table([[p(caption,'PequenoQA') for file,caption in figuras], [image(file,maxw=83*mm,maxh=185*mm) for file,caption in figuras]],colWidths=[88*mm,88*mm])
        t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(0,0),(-1,-1),'CENTER'),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
        story.append(t)
    else:
        for file,caption in evidencias[mod]:
            story.append(KeepTogether([p(caption,'H2QA'),image(file,maxh=110*mm),Spacer(1,10)]))
    add(link('Consultar todos os registros deste módulo',mod+'.html'),raw=True)

story.append(PageBreak());add('Integração entre OS, caixa e estoque', 'H1QA')
table(['Dado', 'Valor conferido'],[['Serviço + peça','R$ 120,00 + R$ 30,00 = R$ 150,00'],['Custos','R$ 20,00 do serviço + R$ 10,00 da peça'],['Resultado sem taxa','R$ 120,00'],['Resultado com taxa de cartão de R$ 3,00','R$ 117,00'],['Estoque','10 unidades no início; apenas uma baixa por entrega'],['Recebimento parcial','R$ 50,00 recebidos; saldo e vencimento preservados'],['Reenvio depois de perder a resposta','Mesma OS e chave de envio; sem duplicação']], [92,84])
add('Quatro modos foram executados em cada empresa automotiva: adiar, receber tudo, receber parte e combinar data futura. A entrega posterior não repetiu a pergunta quando o pagamento já havia sido informado.')
add('Impressão e PDFs', 'H2QA')
add(f"{len(pdfs['resultados'])} arquivos conferidos: 52 documentos offline e 60 propostas públicas. Foram checados texto, valores esperados e limites geométricos. As amostras abaixo foram renderizadas e inspecionadas.")
story.append(PageBreak());add('Exemplo de documento impresso','H1QA')
story.append(KeepTogether([image('compartilhado/pdf-evidencias/orcamento.png',maxh=220*mm),p('Orçamento original: R$ 170,00 menos R$ 17,00 de desconto = R$ 153,00.','PequenoQA')]))
story.append(PageBreak());add('Sem internet e sincronização', 'H1QA')
add('26 subsistemas / 260 verificações. Navegador, IndexedDB e Service Worker reais, com rede do navegador desativada e banco local isolado.')
add('Em cada perfil: OS e orçamento completos, três itens, catálogo e avulso, preços/quantidades editados, desconto, observações, condições, reabertura e impressão. Depois da reconexão, o teste perdeu uma resposta após gravar e reenviou a partir de duas abas. O banco terminou com exatamente dois documentos por empresa, ambos com o total de R$ 180,00.')
table(['Perfil testado','Verificações','Resultado'],[[r['perfil'],str(len(r['checks'])),'Passou'] for r in offline['resultados']],[112,32,32],compact=True)
add(link('Conferir cada verificação offline','compartilhado/offline-reteste/resultado.json'),raw=True)
story.append(PageBreak());add('Limites e rastreabilidade', 'H1QA')
add('Os testes online de interface cobrem os dez perfis automotivos. Os 26 subsistemas aparecem na bateria compartilhada offline e nas suítes que usam essa matriz. Celular significa viewport móvel em Chrome automatizado; não foram usados aparelhos físicos ou Safari.')
add('A impressão foi acionada no navegador e os PDFs foram baixados. Não houve impressão em papel, mensagens a clientes reais nem cobrança em cartão real. Os lançamentos de pagamento e estoque foram feitos apenas nas empresas fictícias autorizadas.')
add('A rodada não demonstra ausência absoluta de bugs. Os registros de servidor indicaram timeouts intermitentes; a recuperação foi retestada, com limites explícitos. As evidências iniciais foram mantidas para permitir comparação com os retestes.')
for label,path in [('Confirmação dos arquivos publicados','publicacao.json'),('Consolidação final dos retestes','retestes-concluidos.json'),('Conferência dos PDFs','compartilhado/pdfs-conferencia.json'),('Diagnóstico do servidor','falhas/diagnostico-servidor.json'),('Manifesto SHA-256 das evidências','manifesto-evidencias.json')]: add(link(label,path),raw=True)
add('Todos os testes locais da bateria inicial', 'H2QA')
add('Duração da suíte é tempo de execução do teste, não duração de um atendimento do usuário. As 230 linhas a seguir passaram; o reteste de 102 suítes está separado no índice HTML.')
table(['Suíte','Duração (s)','Resultado'],[[r['arquivo'],seconds(r['duracaoMs']/1000),'Passou'] for r in suite['resultados']],[130,26,20])
doc=SimpleDocTemplate(str(out),pagesize=(210*mm,297*mm),rightMargin=17*mm,leftMargin=17*mm,topMargin=17*mm,bottomMargin=22*mm,title='Pátio — testes de mapa, orçamentos e OS',author='Pátio / QA',allowTableBoundsErrors=0)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
(root/'relatorio.pdf').write_bytes(out.read_bytes())
print(json.dumps({'pdf':str(out),'bytes':out.stat().st_size},ensure_ascii=False))

