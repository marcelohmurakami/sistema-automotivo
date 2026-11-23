// Somente builds de teste. Nunca é importado pela aplicação ou pelo vite.config.ts.
import ts from "typescript";
import { relative } from "node:path";
export function coberturaComponentes() {
  return {
    name: "qa-cobertura-componentes",
    enforce: "pre",
    transform(codigo, id) {
      const arquivo = id.split("?")[0];
      if (!arquivo.replaceAll("\\", "/").includes("/src/") || !arquivo.endsWith(".tsx"))
        return;
      const ast = ts.createSourceFile(
          arquivo,
          codigo,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        ),
        pontos = [];
      const visitar = (n) => {
        if (
          (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) &&
          n.name &&
          /^[A-Z]/.test(n.name.text) &&
          n.body
        )
          pontos.push({
            pos: n.body.getStart(ast) + 1,
            nome:
              relative(process.cwd(), arquivo).replaceAll("\\", "/") +
              "#" +
              n.name.text,
          });
        ts.forEachChild(n, visitar);
      };
      visitar(ast);
      for (const { pos, nome } of pontos.sort((a, b) => b.pos - a.pos))
        codigo =
          codigo.slice(0, pos) +
          `;{const vistos=(globalThis.__qaComponentes??=new Set());if(!vistos.has(${JSON.stringify(nome)})){vistos.add(${JSON.stringify(nome)});globalThis.__qaRegistrarComponente?.(${JSON.stringify(nome)});}}` +
          codigo.slice(pos);
      return { code: codigo, map: null };
    },
  };
}
