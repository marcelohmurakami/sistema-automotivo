from pathlib import Path
import json
import re
import pdfplumber
from PIL import Image, ImageDraw

pasta = Path('output/orcamentos-impressao-20261111')
resultados = []
for arquivo in pasta.glob('*.pdf'):
    with pdfplumber.open(arquivo) as pdf:
        texto = '\n'.join(p.extract_text() or '' for p in pdf.pages)
        assert 'Subtotal' in texto, arquivo.name
        for numero, page in enumerate(pdf.pages, 1):
            fora = [c['text'] for c in page.chars if c['x0'] < 30 or c['x1'] > page.width - 30 or c['top'] < 20 or c['bottom'] > page.height - 15]
            assert not fora, (arquivo.name, numero, fora[:20])
        if 'longo' in arquivo.stem:
            for n in range(1, 71):
                assert texto.count(f'ITEM_{n:03}') == 1, (arquivo.name, n)
        if arquivo.stem == 'descricao-extensa':
            assert texto.count('INICIO_EXTENSO') == texto.count('FIM_EXTENSO') == 1
        if arquivo.stem in ['automotivo', 'assistencia', 'manutencao', 'limpeza', 'impressao-navegador-normal', 'download-normal']:
            assert len(pdf.pages) == 1, (arquivo.name, len(pdf.pages))
        resultados.append({'arquivo': arquivo.name, 'paginas': len(pdf.pages), 'textoDentroDasMargens': True})
(pasta / 'pdfs.json').write_text(json.dumps({'ok': True, 'resultados': resultados}, indent=2), encoding='utf-8')
imagens = [pasta / f"final-{Path(r['arquivo']).stem}-{n}.png" for r in resultados for n in range(1, r['paginas'] + 1)]
imagens = [p for p in imagens if p.exists()]
for lote in range(0, len(imagens), 6):
    painel = Image.new('RGB', (1500, 1480), '#dbe0dd')
    draw = ImageDraw.Draw(painel)
    for n, arquivo in enumerate(imagens[lote:lote+6]):
        im = Image.open(arquivo).convert('RGB'); im.thumbnail((480, 700))
        x = (n % 3) * 500; y = (n // 3) * 740
        draw.text((x+10,y+5), arquivo.name, fill='black'); painel.paste(im,(x+10,y+28))
    painel.save(pasta / f'conferencia-{lote//6+1}.png')
print(json.dumps(resultados))
