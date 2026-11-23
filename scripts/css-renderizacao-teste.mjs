// Suítes de HTML exercitam os componentes reais sem executar o pipeline de CSS
// do Vite. O build e a revisão visual continuam validando as folhas de estilo.
export function cssRenderizacaoTeste() {
  const prefixo = '\0css-renderizacao-teste:';
  return {
    name: 'css-renderizacao-teste',
    enforce: 'pre',
    resolveId(source) {
      if (source.split('?')[0].endsWith('.css')) return prefixo + source + '.js';
    },
    load(id) {
      if (id.startsWith(prefixo)) return 'export default "";';
    },
  };
}
