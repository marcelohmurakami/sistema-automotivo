import assert from 'node:assert/strict';
import { build, loadConfigFromFile } from 'vite';
import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
const ficha = !!process.env.QA_FICHA;
const root = resolve('output/offline-picos-20261119', ficha ? 'experimento-ficha' : 'experimento-antecipacao');
await mkdir(root, { recursive: true });
const configuration = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve('vite.config.ts'));
const antigo = `const ExecucaoOffline = lazy(() =>
  import("./pages/ExecucaoOffline").then((m) => ({ default: m.ExecucaoOffline })),
);`;
const novo = `const carregarOffline = () =>
  import("./pages/ExecucaoOffline").then((m) => ({ default: m.ExecucaoOffline }));
// A rota já escolhida começa a carregar junto com a sessão e a primeira pintura.
const offlineInicial =
  window.location.pathname.replace(/\\/+$/, "").toLowerCase() === "/execucao-offline"
    ? carregarOffline()
    : undefined;
// O Suspense continua recebendo o erro; evita uma rejeição sem consumidor antes da montagem.
void offlineInicial?.catch(() => {});
const ExecucaoOffline = lazy(() => offlineInicial ?? carregarOffline());`;
await build({ ...configuration.config, configFile: false, build: { ...configuration.config.build, outDir: resolve(root, 'build') }, plugins: [...configuration.config.plugins, {
  name: 'experimento-antecipar-rota-offline', enforce: 'pre',
  async transform(code, id) {
    if (ficha) {
      if (!id.replaceAll('\\', '/').endsWith('/src/components/FichaEspecialidade.tsx')) return;
      let texto = code.replaceAll('\r\n', '\n');
      const alvo = '<details className="os-detalhes ficha-especialidade">'; assert(texto.includes(alvo));
      texto = 'import { useState } from "react";\n' + texto;
      texto = texto.replace('  const perfil = perfilAtendimento(valor.especialidade);', '  const [carregado, setCarregado] = useState(false);\n  const perfil = perfilAtendimento(valor.especialidade);');
      texto = texto.replace(alvo, '<details className="os-detalhes ficha-especialidade" onToggle={(e) => { if (e.currentTarget.open) setCarregado(true); }}>');
      texto = texto.replace('      <p className="texto-suave">{perfil.foco}</p>', '      {carregado && <>\n      <p className="texto-suave">{perfil.foco}</p>');
      texto = texto.replace('    </details>\n  );\n}', '      </>}\n    </details>\n  );\n}');
      await writeFile(resolve(root, 'FichaEspecialidade-experimental.tsx'), texto);
      return { code: texto, map: null };
    }
    if (!id.replaceAll('\\', '/').endsWith('/src/App.tsx')) return;
    const texto = code.replaceAll('\r\n', '\n'); assert(texto.includes(antigo));
    const alterado = texto.replace(antigo, novo);
    await writeFile(resolve(root, 'App-experimental.tsx'), alterado);
    return { code: alterado, map: null };
  },
}] });
