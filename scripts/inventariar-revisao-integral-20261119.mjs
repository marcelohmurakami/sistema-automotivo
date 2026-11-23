import ts from 'typescript';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const out = resolve('output/revisao-integral-20261119');
await mkdir(out, { recursive: true });
async function listar(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? listar(resolve(dir, e.name)) : resolve(dir, e.name)))).flat();
}
const arquivos = [];
for (const path of (await listar(resolve('src'))).sort()) {
  const codigo = await readFile(path, 'utf8'), arquivo = relative(process.cwd(), path).replaceAll('\\', '/');
  const item = { arquivo, sha256: createHash('sha256').update(codigo).digest('hex'), linhas: codigo.split('\n').length, bytes: Buffer.byteLength(codigo), importacoes: [], funcoes: [], componentes: [], consultas: [], efeitos: [], chamadas: {}, jsx: [], pendencias: [] };
  if (/\.[jt]sx?$/.test(path)) {
    const ast = ts.createSourceFile(path, codigo, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const linha = n => ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1;
    function visita(n) {
      if (ts.isImportDeclaration(n)) item.importacoes.push(n.moduleSpecifier.text);
      if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isClassDeclaration(n)) && n.name || ts.isVariableDeclaration(n) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
        const nome = n.name?.getText(ast), body = n.body || n.initializer?.body || n;
        let temJSX = false; const verificar = x => { if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) temJSX = true; ts.forEachChild(x, verificar); }; verificar(body);
        const f = { nome, linha: linha(n), fim: ast.getLineAndCharacterOfPosition(n.end).line + 1, async: !!n.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) };
        item.funcoes.push(f);
        // Componentes de infraestrutura podem retornar null; memo usa funções nomeadas.
        if (nome && /^[A-Z]/.test(nome) && path.endsWith('.tsx') && !item.componentes.some(c => c.nome === nome && c.linha === f.linha)) item.componentes.push({ ...f, semInterfaceVisual: !temJSX });
      }
      if (ts.isCallExpression(n)) {
        const nome = n.expression.getText(ast); item.chamadas[nome] = (item.chamadas[nome] || 0) + 1;
        if (/^(useQuery|useInfiniteQuery|useMutation)$/.test(nome)) item.consultas.push({ linha: linha(n), codigo: n.getText(ast) });
        if (/^use(Layout)?Effect$/.test(nome)) item.efeitos.push({ linha: linha(n), codigo: n.getText(ast) });
      }
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const nome = n.tagName.getText(ast); if (/^[A-Z]/.test(nome) && !item.jsx.includes(nome)) item.jsx.push(nome);
      }
      ts.forEachChild(n, visita);
    }
    visita(ast);
    item.sintaxe = ast.parseDiagnostics.map(d => ({ inicio: d.start, mensagem: ts.flattenDiagnosticMessageText(d.messageText, ' ') }));
  }
  arquivos.push(item);
}
await writeFile(resolve(out, 'inventario.json'), JSON.stringify({ escopo: 'Todos os arquivos de src. Inventário sintático; NÃO equivale a revisão humana ou cobertura de execução.', arquivos }, null, 2));
console.log(JSON.stringify({ arquivos: arquivos.length, componentes: arquivos.reduce((n, a) => n + a.componentes.length, 0), consultas: arquivos.reduce((n, a) => n + a.consultas.length, 0), efeitos: arquivos.reduce((n, a) => n + a.efeitos.length, 0), errosSintaxe: arquivos.flatMap(a => a.sintaxe || []).length }));
