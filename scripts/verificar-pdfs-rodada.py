import json
from pathlib import Path
import pdfplumber

root = Path('output/regressao-mapa-orcamentos-os-20261116')
resultados = []
for pasta, valor in [('compartilhado/offline-reteste', '180,00'), ('orcamentos/aprovacao-conversao', '153,00')]:
    for arquivo in sorted((root / pasta).glob('*.pdf')):
        assert arquivo.read_bytes().startswith(b'%PDF'), arquivo
        with pdfplumber.open(arquivo) as pdf:
            texto = '\n'.join(p.extract_text() or '' for p in pdf.pages)
            assert valor in texto, arquivo
            assert 'NaN' not in texto and 'undefined' not in texto, arquivo
            assert 'Sem valor fiscal' in texto, arquivo
            if 'offline' in pasta:
                assert 'LOCAL-' in texto and 'Complemento avulso QA' in texto, arquivo
            else:
                assert '170,00' in texto and '17,00' in texto, arquivo
            for pagina in pdf.pages:
                assert pagina.chars, arquivo
                for char in pagina.chars:
                    if char['text'].strip():
                        assert -1 <= char['x0'] <= char['x1'] <= pagina.width + 1, (arquivo, char)
                        assert -1 <= char['top'] <= char['bottom'] <= pagina.height + 1, (arquivo, char)
            resultados.append({'arquivo': arquivo.relative_to(root).as_posix(), 'paginas': len(pdf.pages), 'totalEsperado': valor, 'ok': True, 'checks': ['PDF legivel e nao vazio', 'Valores esperados preservados', 'Texto dentro das margens', 'Sem campos indefinidos']})
assert len(resultados) == 112, len(resultados)
(root/'compartilhado/pdfs-conferencia.json').write_text(json.dumps({'ok': True, 'metodo': 'Extracao e limites geometricos de todos os PDFs; inspecao visual em amostras separadas', 'resultados': resultados}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'ok':True, 'pdfs':len(resultados)}))
