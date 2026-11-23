import { build as compilar } from "vite";
import { coberturaComponentes } from "./cobertura-componentes.mjs";
import { resolve, dirname, sep, isAbsolute } from "node:path";
export { preview } from "vite";
export const build = (config = {}) => {
  const plugins = [...(config.plugins || [])];
  if (process.env.QA_COVERAGE_FILE) plugins.unshift(coberturaComponentes());
  if (process.env.QA_SOURCE_DIR) {
    const original = resolve('src') + sep, copia = resolve(process.env.QA_SOURCE_DIR);
    plugins.unshift({name:'fontes-da-medicao-anterior',enforce:'pre',async resolveId(id,importer){
      if (!importer || (!id.startsWith('.') && !isAbsolute(id))) return;
      const arquivo=resolve(dirname(importer),id);
      if(arquivo.startsWith(original))return this.resolve(resolve(copia,arquivo.slice(original.length)),importer,{skipSelf:true});
    }});
  }
  return compilar({...config,plugins});
};
