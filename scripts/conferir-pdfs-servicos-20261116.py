import json,re
from pathlib import Path
import pdfplumber
from PIL import Image, ImageDraw
root=Path('output/regressao-assistencia-manutencao-limpeza-20261116')
files=[root/g/'resultados.json' for g in ['assistencia','manutencao','limpeza']]+list((root/'retestes').glob('*/resultados.json'))
docs={}
for f in files:
 for d in json.loads(f.read_text(encoding='utf-8-sig'))['documentos']:
  if d.get('pdf'): docs[(d['perfil'],d['width'],d['caso'])]=(f.parent,d)
res=[]
def money(n):return f'{n/100:,.2f}'.replace(',','X').replace('.',',').replace('X','.')
for folder,d in docs.values():
 with pdfplumber.open(folder/d['pdf']) as pdf:
  text='\n'.join(p.extract_text() or '' for p in pdf.pages)
  mostra=d['tipo']=='orcamento' or not d['completo']
  expect=d['valorEditado']+(0 if mostra else 2000)
  total=text.split('Total do orçamento')[-1][:200] if d['tipo']=='orcamento' else '\n'.join(re.findall(r'R\$ [\d.,]+\nTOTAL',text))
  assert money(expect) in total,(d['pdf'],money(expect),text)
  assert 'undefined' not in text and 'NaN' not in text,d['pdf']
  assert ('Desconto' in text)==mostra,(d['pdf'],text)
  assert 'Custo direto' not in text and 'Margem' not in text,d['pdf']
  for p in pdf.pages:
   for c in p.chars:
    if c['text'].strip():assert -1<=c['x0']<=c['x1']<=p.width+1 and -1<=c['top']<=c['bottom']<=p.height+1,(d['pdf'],c)
  res.append({'perfil':d['perfil'],'width':d['width'],'caso':d['caso'],'arquivo':str(folder/d['pdf']),'valorImpresso':expect,'paginas':len(pdf.pages),'ok':True})
(root/'pdfs-conferencia.json').write_text(json.dumps({'ok':True,'resultados':res},ensure_ascii=False,indent=2),encoding='utf-8')
# Contatos para inspeção humana de todos os resumos, separando desktop e celular.
qa=root/'inspecao-visual';qa.mkdir(exist_ok=True)
for width in [1920,390]:
 imgs=[]
 for folder,d in docs.values():
  if d['width']==width and d['caso']=='ordem-completo':
   imgs.append((folder/f"{d['perfil']}-{width}-{d['caso']}-resumo.png",d['perfil']))
 for start in range(0,len(imgs),8):
  cellw,cellh=(480,310) if width==1920 else (240,550)
  sheet=Image.new('RGB',(cellw*4,cellh*2),'#dde6df');draw=ImageDraw.Draw(sheet)
  for i,(path,label) in enumerate(imgs[start:start+8]):
   im=Image.open(path).convert('RGB');im.thumbnail((cellw-12,cellh-28));x=(i%4)*cellw;y=(i//4)*cellh
   sheet.paste(im,(x+6,y+24));draw.text((x+5,y+6),label,fill='black')
  sheet.save(qa/f'resumos-{width}-{start//8+1}.png')
print(json.dumps({'ok':True,'pdfs':len(res)}))
