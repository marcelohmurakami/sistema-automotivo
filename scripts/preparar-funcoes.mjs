import { readFile, mkdir, writeFile } from "node:fs/promises";
await mkdir("tmp/funcoes", { recursive: true });
const ical = (await readFile('supabase/functions/calendario-externo/ical.mjs','utf8')).replace(/^export /gm,'');
const calendarioExterno=(await readFile('supabase/functions/calendario-externo/index.ts','utf8')).replace(/^import \{gerarIcal\} from '\.\/ical\.mjs';\r?\n/m,'');
await writeFile('tmp/funcoes/calendario-externo.ts',`${ical}\n${calendarioExterno}`);
const provedorTrajeto = (
  await readFile("supabase/functions/planejar-trajeto/provedor.mjs", "utf8")
).replace(/^export /gm, "");
const funcaoTrajeto = (
  await readFile("supabase/functions/planejar-trajeto/index.ts", "utf8")
).replace(
  /^import \{ planejarTrajeto, validarPedido \} from "\.\/provedor\.mjs";\r?\n/m,
  "",
);
await writeFile(
  "tmp/funcoes/planejar-trajeto.ts",
  `${provedorTrajeto}\n${funcaoTrajeto}`,
);
console.log("Preparado: tmp/funcoes/planejar-trajeto.ts");
const grupos = [
  ["cobranca", ["cobranca-oficina", "webhook-cobranca"]],
  ["pix", ["pix-os", "webhook-pix"]],
];
for (const [modulo, nomes] of grupos) {
  const shared = (
    await readFile(`supabase/functions/_shared/${modulo}.mjs`, "utf8")
  ).replace(/^export /gm, "");
  for (const nome of nomes) {
    const original = await readFile(`supabase/functions/${nome}/index.ts`, "utf8");
    const exp = new RegExp(
      `^import\\s*\\{[^}]*\\}\\s*from\\s*["']\\.\\.\\/_shared\\/${modulo}\\.mjs["'];\\r?\\n`,
      "gm",
    );
    const semImport = original.replace(exp, "");
    if (semImport === original)
      throw new Error(`Import compartilhado não identificado em ${nome}`);
    await writeFile(`tmp/funcoes/${nome}.ts`, `${shared}\n${semImport}`);
    console.log(`Preparado: tmp/funcoes/${nome}.ts`);
  }
}
await writeFile(
  "tmp/funcoes/capturar-atendimento.ts",
  await readFile("supabase/functions/capturar-atendimento/index.ts", "utf8"),
);
console.log("Preparado: tmp/funcoes/capturar-atendimento.ts");
const geradorOleo = (
  await readFile("supabase/functions/recontatos-oleo/gerar.ts", "utf8")
).replace(/^export /gm, "");
const funcaoOleo = (
  await readFile("supabase/functions/recontatos-oleo/index.ts", "utf8")
).replace(/^import \{ gerarSugestaoOleo \} from "\.\/gerar\.ts";\r?\n/m, "");
await writeFile("tmp/funcoes/recontatos-oleo.ts", `${geradorOleo}\n${funcaoOleo}`);
console.log("Preparado: tmp/funcoes/recontatos-oleo.ts");
const protocoloAssistente = (
  await readFile("supabase/functions/assistente-operacional/protocolo.mjs", "utf8")
)
  .replace(/^import[^;]+from "\.\/consultas-turno\.mjs";\r?\n/m, "")
  .replace(/^import[^;]+from "\.\/aplicacao-automotiva\.mjs";\r?\n/m, "")
  .replace(/^import[^;]+from "\.\/catalogo-assistente\.mjs";\r?\n/m, "")
  .replace(/^export /gm, "");
const aplicacaoAssistente = (
  await readFile(
    "supabase/functions/assistente-operacional/aplicacao-automotiva.mjs",
    "utf8",
  )
)
  .replace(/^import[^;]+from "\.\/catalogo-assistente\.mjs";\r?\n/m, "")
  .replace(/^export /gm, "");
const catalogoAssistente = (
  await readFile(
    "supabase/functions/assistente-operacional/catalogo-assistente.mjs",
    "utf8",
  )
).replace(/^export /gm, "");
const originalAssistente = await readFile(
  "supabase/functions/assistente-operacional/index.ts",
  "utf8",
);
const funcaoAssistente = originalAssistente
  .replace(/^import[^;]+from "\.\/protocolo\.mjs";\r?\n/m, "")
  .replace(/^import[^;]+from "\.\/provedor\.mjs";\r?\n/m, "");
const provedorAssistente = (
  await readFile("supabase/functions/assistente-operacional/provedor.mjs", "utf8")
).replace(/^export /gm, "");
const consultasAssistente = (
  await readFile(
    "supabase/functions/assistente-operacional/consultas-turno.mjs",
    "utf8",
  )
).replace(/^export /gm, "");
if (funcaoAssistente === originalAssistente)
  throw new Error("Import do protocolo do assistente não identificado.");
await writeFile(
  "tmp/funcoes/assistente-operacional.ts",
  `${consultasAssistente}\n${catalogoAssistente}\n${aplicacaoAssistente}\n${protocoloAssistente}\n${provedorAssistente}\n${funcaoAssistente}`,
);
console.log("Preparado: tmp/funcoes/assistente-operacional.ts");
