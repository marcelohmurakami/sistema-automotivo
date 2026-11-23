import json
import math
from pathlib import Path
import pdfplumber
from PIL import Image, ImageOps, ImageDraw

root = Path(__file__).resolve().parent.parent
out = root / 'output/desempenho-20261111'
data = json.loads((out / 'relatorio-dados.json').read_text(encoding='utf-8'))
pdf_path = root / 'output/pdf/auditoria-desempenho-20261111.pdf'
qa = out / 'pdf-qa'
qa.mkdir(parents=True, exist_ok=True)

with pdfplumber.open(pdf_path) as pdf:
    all_file_column = ''
    overflow = []
    for number, page in enumerate(pdf.pages, 1):
        assert (page.extract_text() or '').strip(), f'Página vazia: {number}'
        all_file_column += ''.join((page.crop((44, 0, 354, page.height)).extract_text() or '').split())
        for char in page.chars:
            if char['x0'] < 40 or char['x1'] > page.width - 40 or char['top'] < 15 or char['bottom'] > page.height - 15:
                overflow.append({'pagina': number, 'texto': char['text'], 'x0': char['x0'], 'x1': char['x1'], 'top': char['top'], 'bottom': char['bottom']})
    missing = [x['arquivo'] for x in data['matriz'] if ''.join(x['arquivo'].split()) not in all_file_column]
    result = {'ok': not overflow and not missing, 'paginas': len(pdf.pages), 'arquivosNoInventario': len(data['matriz']), 'arquivosAusentes': missing, 'caracteresForaDosLimites': overflow}
    (qa / 'validacao.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    assert not overflow, f'{len(overflow)} caracteres fora das margens'
    assert not missing, f'Arquivos ausentes: {missing}'

images = sorted(qa.glob('pagina-*.png'))
assert len(images) == result['paginas'], 'Renderize todas as páginas com pdftoppm antes da conferência visual'
for start in range(0, len(images), 9):
    batch = images[start:start+9]
    sheet = Image.new('RGB', (930, 1320), '#dce2dc')
    draw = ImageDraw.Draw(sheet)
    for offset, file in enumerate(batch):
        thumb = ImageOps.contain(Image.open(file).convert('RGB'), (290, 410))
        x = (offset % 3) * 310 + 10
        y = (offset // 3) * 440 + 22
        draw.text((x, y-17), f'Pagina {start+offset+1}', fill='#163a29')
        sheet.paste(thumb, (x, y))
    sheet.save(qa / f'contato-{start//9+1}.png')
print(json.dumps(result, ensure_ascii=False))
