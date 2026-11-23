import assert from 'node:assert/strict';
import { build, loadConfigFromFile } from 'vite';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const root = resolve('output/offline-picos-20261119/experimento-editor-direto');
await mkdir(root, { recursive: true });
const configuration = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve('vite.config.ts'));
await build({ ...configuration.config, configFile: false, build: { ...configuration.config.build, outDir: resolve(root, 'build') }, plugins: [...configuration.config.plugins, {
  name: 'diagnostico-editor-sem-suspense', enforce: 'pre',
  async transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/components/offline/DocumentosOffline.tsx')) return;
    let texto = code.replaceAll('\r\n', '\n');
    const anterior = `import { componenteSobDemanda } from "../../lib/componenteSobDemanda";
const EditorDocumento = componenteSobDemanda(async () => ({
  default: (await import("./EditorDocumentoOffline")).EditorDocumentoOffline,
}));`;
    assert(texto.includes(anterior));
    texto = texto.replace(anterior, `import { useEffect, type ComponentProps } from "react";
type Editor = typeof import("./EditorDocumentoOffline").EditorDocumentoOffline;
let modulo: Editor | undefined;
function EditorDocumento(props: ComponentProps<Editor>) {
  const [Componente, setComponente] = useState<Editor | undefined>(() => modulo);
  const [erro, setErro] = useState<unknown>();
  useEffect(() => {
    let ativo = true;
    if (!modulo) void import("./EditorDocumentoOffline").then(m => {
      modulo = m.EditorDocumentoOffline;
      if (ativo) setComponente(() => modulo);
    }).catch(e => { if (ativo) setErro(e); });
    return () => { ativo = false; };
  }, []);
  if (erro) throw erro;
  return Componente ? <Componente {...props} /> : <p className="estado-lista" role="status">Carregando…</p>;
}`);
    await writeFile(resolve(root, 'DocumentosOffline-experimental.tsx'), texto);
    return { code: texto, map: null };
  },
}] });
