import { writeFile } from "node:fs/promises";
import { perfisAtendimento } from "../src/lib/perfisAtendimento.ts";

const destinos = {
  eletrodomesticos: [
    "assistencia_eletrodomesticos",
    "20261015000700_eletrodomesticos_especializado.sql",
  ],
  eletronica: ["assistencia_eletronica", "20261015000800_eletronica_bancada.sql"],
  celulares: ["assistencia_celulares", "20261016000100_celulares_especializado.sql"],
  informatica: ["assistencia_informatica", "20261016000200_informatica_especializada.sql"],
};
const destino = destinos[process.argv[2]];
if (!destino) throw new Error("Escolha " + Object.keys(destinos).join(", ") + ".");
const [id, arquivo] = destino;
const perfil = perfisAtendimento[id];
const contrato = {
  campos: Object.fromEntries(
    perfil.grupos
      .flatMap((g) => g.campos)
      .map((c) => [
        c.id,
        { tipo: c.tipo || "texto", ...(c.opcoes ? { opcoes: c.opcoes } : {}) },
      ]),
  ),
  checklist: perfil.checklist,
  etapas: perfil.etapas,
};
await writeFile(
  new URL("../supabase/migrations/" + arquivo, import.meta.url),
  `begin;
-- Atualiza apenas o contrato deste subsetor. Não altera fichas nem permissões.
do $atualizacao$
declare perfis jsonb := private.perfis_atendimento();
begin
  perfis := jsonb_set(perfis, '{${id}}', $dados$${JSON.stringify(contrato)}$dados$::jsonb);
  execute format('create or replace function private.perfis_atendimento() returns jsonb language sql immutable set search_path='''' as %L', 'select ' || quote_literal(perfis::text) || '::jsonb');
end
$atualizacao$;
commit;
`,
);
console.log(arquivo);
