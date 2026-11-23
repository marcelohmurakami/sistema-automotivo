import json, os, html
from pathlib import Path
from statistics import median
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4

root = Path(__file__).resolve().parent.parent
out = root / 'output/desempenho-20261111'
d = json.loads((out / 'relatorio-dados.json').read_text(encoding='utf-8'))
dest = root / 'output/pdf/auditoria-desempenho-20261111.pdf'
dest.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('ArialQA', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialQAB', 'C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('ArialQA', normal='ArialQA', bold='ArialQAB')
green=colors.HexColor('#183c2d'); ink=colors.HexColor('#233b30'); muted=colors.HexColor('#607369'); pale=colors.HexColor('#eef3ee'); line=colors.HexColor('#d3dfd5')
styles=getSampleStyleSheet()
for s in styles.byName.values(): s.fontName='ArialQA'
styles.add(ParagraphStyle(name='CoverQA',fontName='ArialQAB',fontSize=34,leading=38,textColor=green,spaceAfter=24))
styles.add(ParagraphStyle(name='HQA',fontName='ArialQAB',fontSize=18,leading=23,textColor=green,spaceBefore=12,spaceAfter=14,keepWithNext=True))
styles.add(ParagraphStyle(name='BodyQA',fontSize=9.5,leading=14,textColor=ink,spaceAfter=10))
styles.add(ParagraphStyle(name='SmallQA',fontSize=8,leading=11,textColor=muted,spaceAfter=8))
styles.add(ParagraphStyle(name='CellQA',fontSize=7.5,leading=10,textColor=ink,wordWrap='CJK'))
styles.add(ParagraphStyle(name='HeadQA',fontName='ArialQAB',fontSize=8,leading=11,textColor=green))
styles.add(ParagraphStyle(name='CodeQA',fontSize=6.8,leading=9,textColor=ink,wordWrap='CJK'))
story=[]; width=A4[0]-88
def p(text,style='BodyQA'): return Paragraph(text,styles[style])
def text(s): story.append(p(s))
def title(s): story.append(p(s,'HQA'))
def new(): story.append(PageBreak())
def table(head,rows,widths=None,small=False):
    st='CodeQA' if small else 'CellQA'
    rows=[[p(html.escape(str(x)),st) for x in row] for row in rows]
    t=Table([[p(x,'HeadQA') for x in head]]+rows,colWidths=widths or [width/len(head)]*len(head),repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),pale),('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f8faf7')]),('LINEBELOW',(0,0),(-1,-1),0.35,line),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    story.append(t);story.append(Spacer(1,12))
def footer(c,doc):
    c.setStrokeColor(line);c.line(44,39,A4[0]-44,39);c.setFont('ArialQA',7);c.setFillColor(muted)
    c.drawString(44,25,'PÁTIO | Auditoria de desempenho | 11/11/2026')
    c.drawRightString(A4[0]-44,25,str(doc.page))
    if doc.page>1:
        c.drawString(44,A4[1]-25,'DESEMPENHO, PRESERVAÇÃO E EVIDÊNCIAS')

story.append(Spacer(1,50));story.append(p('AUDITORIA TÉCNICA • 11 NOVEMBRO 2026','SmallQA'))
story.append(p('Menos espera.<br/>As mesmas<br/>funcionalidades.','CoverQA'))
text('Revisão do carregamento, resposta da interface, consultas, sincronização offline e trabalho repetido no navegador e no banco de dados.')
c=d['contagem']
table(['Inventário final','Subsistemas','Regressão'],[[f"{c['arquivosDepois']} arquivos / {c['tsxDepois']} TSX",'26',f"{c['regressao']} suítes aprovadas"]])
text(f"<b>Publicação:</b> {html.escape(d['publicado']['url'])}<br/><b>Build verificado:</b> {html.escape(str(d['publicado']['build']))}")
iniciais = [x for x in d['comparacao']['linhas'] if x['rota'] == '/']
mais_rapidas = sum(x['reducaoPercentual'] > 0 for x in d['comparacao']['linhas'])
text(f"<b>Resultado medido:</b> as páginas iniciais das quatro famílias ficaram entre {min(x['reducaoPercentual'] for x in iniciais):.1f}% e {max(x['reducaoPercentual'] for x in iniciais):.1f}% mais rápidas nas condições do ensaio. Houve redução do tempo em {mais_rapidas} dos 36 cenários de navegação; os demais resultados também estão registrados.")
story.append(Spacer(1,18))
text('<b>Leitura importante:</b> redução do tamanho de um arquivo, rapidez de uma rotina isolada e tempo total de uma tela são medidas diferentes. Este relatório apresenta cada uma separadamente e inclui as telas que não tiveram ganho na medição.')
story.append(p('Evidências completas, scripts, capturas e inventário com hashes acompanham o relatório em output/desempenho-20261111. Nenhuma credencial está incluída neste documento.','SmallQA'))
new();title('1. Escopo e critérios de revisão')
text(f"Foram inventariados os {c['arquivosAntes']} arquivos TS, TSX e CSS existentes no início, incluindo {c['tsxAntes']} arquivos TSX e {c['componentesAntes']} componentes nomeados. O resultado contém {c['arquivosDepois']} arquivos, {c['tsxDepois']} TSX e {c['componentesDepois']} componentes nomeados. {c['alterados']} arquivos da aplicação foram ajustados ou acrescentados.")
table(['Nível de evidência','O que significa'],[['Análise estrutural de todos os arquivos','Inventário de importações, funções de componente, consultas, efeitos, listas, imagens, intervalos, linhas e hash SHA-256.'],['Leitura dirigida','Consultas e efeitos compartilhados, importações pesadas, filas, cache, impressão, dados e trechos alterados examinados para decidir otimizações.'],['Regressão automatizada','Suítes de lógica, contratos de dados, segurança e banco local.'],['Navegador','Rotas das 26 empresas, desktop/celular; interações mais profundas nas quatro famílias; fluxos offline com gravação em banco local.']],[130,width-130])
text('A matriz não afirma que cada estado possível de cada diálogo foi exercitado. Componentes podem aparecer apenas ao executar uma operação específica. A análise estrutural cobre todos os arquivos; os testes de execução têm os escopos registrados nas evidências.')
title('Funcionalidades preservadas')
text('Etapas e campos das OS e orçamentos, valores e descontos, pagamentos, controle de estoque, regras de comissão, permissões, revisão concorrente, impressão, isolamento por empresa e usuário e confirmação única dos envios offline. Não foram removidas funcionalidades nem reduzidas as validações para obter os ganhos.')
new();title('2. Ganhos estruturais medidos')
table(['Arquivo individual','Antes, gzip','Depois, gzip','Variação'],[[m['nome'],f"{m['antes']['gzip']/1024:.1f} KiB",f"{m['depois']['gzip']/1024:.1f} KiB",f"{(m['depois']['gzip']/m['antes']['gzip']-1)*100:.1f}%"] for m in d['metricas']],[200,88,88,width-376])
text('Sinal negativo indica redução. São tamanhos dos arquivos individuais, não o tráfego total do aplicativo. O arquivo de entrada ficou maior para carregar a navegação diretamente, evitando uma etapa adicional de espera. Dependências compartilhadas continuam necessárias. Módulos adiados carregam quando a função é aberta, e a instalação offline ainda prepara todos os arquivos.')
table(['Rotina','Evidência'],[['Diálogos','Formulários de janelas nunca abertas não são montados. Após a primeira abertura, fechar e reabrir mantém campos, estado e componentes.'],['Fila offline','3.004 registros no aparelho; a leitura recorrente passou a selecionar apenas os dois pendentes. Atualização de versão preservou documentos e fotos.'],['Cache de consultas','2.001 consultas no teste: uma passagem pelo cache e um refetch do observador ativo; chaves não relacionadas preservadas.'],['Conferência de peças','Estoque fictício de 2.000 produtos: consulta somente o vínculo da OS, deduplicado, e busca limitada para selecionar outra peça.'],['Contas recorrentes','Na segunda consulta do mesmo cenário: cinco regravações antes, zero depois. Mesmos títulos, pendências e datas nos 26 subsistemas.'],['Instalação offline','Até três downloads simultâneos de baixa prioridade; reutilização de assets com hash já presentes. Ativação somente após completar o cache.'],['Formatação','153 casos com saída idêntica. Formatadores de moeda, quantidade e datas passam a ser reutilizados.']],[130,width-130])
times=d['formatadores']['tempos'];text(f"Microbenchmark de 4.000 formatações por rodada (Node, cinco rodadas): mediana {median(x['antes'] for x in times):.1f} ms antes e {median(x['depois'] for x in times):.1f} ms depois. Esse número mede somente a formatação; não representa o ganho de uma página inteira.")
title('Carregamento inicial completo')
text('JavaScript efetivamente transferido para abrir a página inicial, incluindo dependências e os bytes reportados pelo navegador em transferSize. Recursos atendidos pelo cache não são somados.')
table(['Perfil','Antes','Depois','Arquivos JS'],[[x['perfil'],f"{x['antes']['javascriptTransferido']/1024:.1f} KiB",f"{x['depois']['javascriptTransferido']/1024:.1f} KiB",f"{x['antes']['arquivosJavaScriptBaixados']} / {x['depois']['arquivosJavaScriptBaixados']}"] for x in d['comparacao']['linhas'] if x['rota']=='/'],[235,85,85,width-405])
title('Trabalho evitado nas páginas')
table(['Tela (mecânica)','Consultas antes / depois','Elementos antes / depois'],[[x['rota'],f"{x['antes']['consultas']} / {x['depois']['consultas']}",f"{x['antes']['dom']} / {x['depois']['dom']}"] for x in d['comparacao']['linhas'] if x['perfil']=='mecanica' and x['rota'] in ['/','/compras','/funcionarios','/financeiro']],[180,160,width-340])
text('Os elementos evitados pertencem a janelas ainda fechadas. As funções e os campos continuam disponíveis ao abrir.')
new();title('3. Tempos de navegação')
text('Três rodadas por versão, nove rotas e quatro famílias: 216 navegações. Builds servidos localmente com gzip, consultando as APIs do ambiente conectado. Chrome com CPU limitada em 4x, download de 1,6 Mbps, upload de 0,75 Mbps e latência de 150 ms. Novo contexto por empresa; navegação interna preserva cache. As duas versões consultaram o mesmo backend já atualizado, isolando as alterações do frontend. Service Worker bloqueado para isolar o custo da instalação offline.')
text('O tempo de estabilidade inclui 400 ms sem novas requisições da API ou dos módulos da tela. Consultas ao banco conectado variam com a rede e o servidor. São apresentadas medianas, inclusive resultados mais lentos. Não há base para prometer o mesmo ganho em todo aparelho.')
for perfil in [x['perfil'] for x in d['perfis'] if x['perfil'] in ['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_geral']]:
    title(perfil.replace('_',' '))
    rows=[]
    for x in d['comparacao']['linhas']:
        if x['perfil']!=perfil:continue
        delta=(x['depois']['ms']/x['antes']['ms']-1)*100
        rows.append([x['rota'],f"{x['antes']['ms']/1000:.2f} s",f"{x['depois']['ms']/1000:.2f} s",f"{delta:+.1f}%"])
    table(['Rota','Antes','Depois','Variação'],rows,[230,82,82,width-394])
text('Sinal negativo indica menos tempo. Transferências com duração zero podem vir do cache; os bytes codificados no JSON não devem ser tratados como tráfego real. Os valores mínimo e máximo de cada rodada estão em comparacao.json.')
new();title('4. Validação das funcionalidades')
table(['Bateria','Resultado'],[['Regressão',f"{c['regressao']} suítes aprovadas."],['Interface',f"{c['ui']} verificações locais de rotas e interações em 26 perfis; desktop 1366 px e celular 390 px."],['Offline',f"{c['offline']} verificações: criar OS e orçamento, itens de catálogo e avulsos, preço, quantidade, desconto, reabrir, imprimir, PDF, reconectar e conferir o banco."],['Pagamento e impressão',f"{len(d['pagamentos']['resultados'])} cenários locais de pagamento total, parcial, a prazo, adiamento, impressão e entrega sem repetir o recebimento."],['Concorrência offline','Perda da resposta após salvar e envio em duas abas: exatamente dois documentos por perfil, sem duplicação.'],['Responsividade offline','320, 390, 768 e 1920 pixels.'],['Site publicado',f"{c['publicado']} verificações no build publicado, além de impressão e download de PDF nas quatro famílias (desktop e celular)."],['Segurança e consistência','Isolamento por usuário/empresa, revisão da OS, rejeição de erro de rede e preservação das permissões da rotina SQL.']],[135,width-135])
text('Gravações de teste foram feitas em banco local isolado. Nas empresas fictícias do ambiente conectado, as conferências de interface são de leitura e abertura de formulários, sem lançar pagamentos. O assistente foi aberto e reaberto sem enviar mensagens ao provedor de IA.')
text('Após as rodadas iniciais, os 26 perfis offline foram novamente executados de ponta a ponta na versão final. O teste espera explicitamente a conclusão de cada operação no armazenamento local antes de conferir o resultado. A nomenclatura de peça, material ou produto foi respeitada em cada família.')
table(['Subsistema','UI','Offline','Banco'],[[x['perfil'],x['telas'],x['offline'],x['banco']] for x in d['perfis']],[300,65,65,width-430])
new();title('5. Conferência visual no celular')
text('Capturas das empresas fictícias. Os formulários e detalhes permanecem disponíveis após a separação dos módulos. A verificação automatizada também procurou rolagem horizontal da página e dos diálogos.')
for pair in [('mecanica','assistencia_celulares'),('manutencao_climatizacao','limpeza_geral')]:
    cells=[]
    for perfil in pair:
        path=out/'interface-final'/f'{perfil}-detalhe-mobile.png'
        if not path.exists():path=out/'interface-final'/f'{perfil}-mobile.png'
        img=Image(str(path));ratio=img.imageHeight/img.imageWidth;img.drawWidth=211;img.drawHeight=211*ratio
        cells.append([p(perfil.replace('_',' '),'SmallQA'),Spacer(1,6),img])
    t=Table([cells],colWidths=[width/2,width/2]);t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP')]));story.append(t)
    if pair[0]=='mecanica':new();title('Conferência visual: campo e limpeza')
new();title('6. Alterações rastreáveis')
table(['Arquivo','Alteração'],[[x['arquivo'],x['observacao']] for x in d['matriz'] if x['alterado']],[190,width-190],True)
title('Mudança no banco e instalação')
text('Migração local 20261111111300_desempenho_recorrencias.sql aplicada ao banco conectado. A rotina private.gerar_contas_recorrentes mantém SECURITY DEFINER, search_path restrito e execução apenas pelo papel interno. O frontend foi publicado no build identificado na capa.')
new();title('7. Cobertura por arquivo')
text('Inventário completo dos arquivos TS, TSX e CSS da aplicação. Q/E/I/L = consultas React Query, efeitos, imagens e operações de lista. A presença desses elementos não é, por si só, um problema. “Mantido” significa que não foi aplicado ajuste; todos os arquivos passaram pela análise estrutural. A leitura dirigida e os testes de execução estão descritos nas seções anteriores.')
text('O CSV e os JSON do relatório registram o SHA-256 completo, os nomes dos componentes e as observações individuais. Abaixo estão todos os arquivos, com prefixo do hash para facilitar a conferência.')
for grupo,filtro in [('Componentes e páginas (TSX)',lambda x:x['arquivo'].endswith('.tsx')),('Bibliotecas e serviços (TS)',lambda x:x['arquivo'].endswith('.ts')),('Estilos (CSS)',lambda x:x['arquivo'].endswith('.css'))]:
    title(grupo)
    table(['Arquivo','Q/E/I/L','Revisão / hash'],[[x['arquivo'],f"{x['consultas']}/{x['efeitos']}/{x['imagens']}/{x['listas']}",('Alterado' if x['alterado'] else 'Mantido')+' / '+x['sha256'][:10]] for x in d['matriz'] if filtro(x)],[310,65,width-375],True)
new();title('8. Limites e acompanhamento')
text('A revisão reduz trabalho desnecessário e preserva os fluxos testados. Não certifica ausência absoluta de defeitos, todos os estados possíveis de cada componente, capacidade para milhões de registros simultâneos nem a experiência de todos os aparelhos físicos. A emulação de CPU/rede ajuda a comparar versões, mas não reproduz perfeitamente um celular de entrada.')
text('Algumas telas não melhoraram nas medianas de navegação. A API, a distância ao servidor e consultas de relatório ainda influenciam a espera. Monitoramento de produção, p95 por consulta e testes com volume representativo continuam sendo os instrumentos para orientar as próximas melhorias, sem esconder dados nem retirar validações.')
title('Evidências entregues')
table(['Arquivo na pasta do relatório','Conteúdo'],[['relatorio.html','Relatório navegável com busca no inventário.'],['cobertura-arquivos.csv','Todos os arquivos, componentes, observações, métricas e hashes completos.'],['antes.json / depois.json','Fotografia estrutural e tamanho dos assets das duas versões.'],['comparacao.json','Medianas, mínimos, máximos e bloqueio da thread principal.'],['navegador-antes-1..3.json / navegador-depois-1..3.json','Registros brutos das 216 navegações.'],['interface-final/resultados.json','Rotas e interações nas 26 empresas.'],['offline-final/resultado.json','Repetição final dos 26 perfis: offline, impressão e sincronização.'],['atualizacao-cache.json',f"Atualização real: {d['atualizacaoCache']['arquivos']} arquivos conferidos e {d['atualizacaoCache']['reutilizados']} assets reutilizados."],['banco-recorrencias.json','Comparação de valores e datas nos 26 perfis.'],['pecas/resultados.json','2.000 produtos, busca limitada, conflito e erro.'],['regressao-consolidada.json','Suítes executadas e durações.'],['publicado/resultados.json / publicacao.json','Conferência e identificação da versão publicada.']],[220,width-220])
text('Referências: React lazy (react.dev/reference/react/lazy); TanStack Query render optimizations (tanstack.com/query/latest/docs/framework/react/guides/render-optimizations); Supabase database linter (supabase.com/docs/guides/database/database-linter).')
doc=SimpleDocTemplate(str(dest),pagesize=A4,leftMargin=44,rightMargin=44,topMargin=46,bottomMargin=52,title='Auditoria de desempenho - Pátio',author='Pátio - revisão técnica')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(dest)
