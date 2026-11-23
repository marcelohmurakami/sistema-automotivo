import json, subprocess
from pathlib import Path
import pdfplumber
from PIL import Image, ImageOps, ImageDraw
root=Path('output/regressao-mapa-orcamentos-os-20261116').resolve()
pdf=Path('output/pdf/relatorio-regressao-mapa-orcamentos-os-20261116.pdf').resolve()
qa=root/'pdf-revisao';qa.mkdir(exist_ok=True)
for f in [*qa.glob('pagina-*.png'),*qa.glob('contato-*.png')]:
    assert f.resolve().is_relative_to(qa)
    f.unlink()
poppler=Path('C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1104-2876-0_26.1104.2876.0_x64__3k8sg7r9htsxt/dependencies/native/poppler/Library/bin/pdftoppm.exe')
with (qa/'renderizacao.log').open('w') as log:
    subprocess.run([str(poppler),'-png','-r','85',str(pdf),str(qa/'pagina')],check=True,stderr=log)
resultados=[]
with pdfplumber.open(pdf) as doc:
    for i,p in enumerate(doc.pages):
        texto=p.extract_text() or ''
        assert len(texto)>50,(i,len(texto))
        assert 'undefined' not in texto and 'NaN' not in texto
        for c in p.chars:
            if c['text'].strip():
                assert -1<=c['x0']<=c['x1']<=p.width+1,(i,c)
                assert -1<=c['top']<=c['bottom']<=p.height+1,(i,c)
        resultados.append({'pagina':i+1,'caracteres':len(texto),'semCortes':True})
pages=sorted(qa.glob('pagina-*.png'))
for inicio in range(0,len(pages),12):
    sheet=Image.new('RGB',(1000,1110),'#dce6df');draw=ImageDraw.Draw(sheet)
    for n,f in enumerate(pages[inicio:inicio+12]):
        im=Image.open(f).convert('RGB');im.thumbnail((235,330))
        x=(n%4)*250+(250-im.width)//2;y=(n//4)*370+26
        sheet.paste(im,(x,y));draw.text((x,y-19),str(inicio+n+1),fill='#19352c')
    sheet.save(qa/f'contato-{inicio//12+1}.png')
(qa/'resultado.json').write_text(json.dumps({'ok':True,'paginas':len(resultados),'resultados':resultados},indent=2),encoding='utf-8')
print(json.dumps({'ok':True,'paginas':len(resultados),'montagens':(len(pages)+11)//12}))
