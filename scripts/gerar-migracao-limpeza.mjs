import { writeFile } from 'node:fs/promises';
import { perfisAtendimento } from '../src/lib/perfisAtendimento.ts';
import { camposPlanejamentoLimpeza } from '../src/lib/limpeza.ts';
const contratos = Object.fromEntries(Object.entries(perfisAtendimento).filter(([id]) => id.startsWith('limpeza_')).map(([id,p]) => [id, {
  campos: Object.fromEntries(p.grupos.flatMap(g=>g.campos).map(c=>[c.id,{tipo:c.tipo||'texto',...(c.opcoes?{opcoes:c.opcoes}:{})}])), checklist:p.checklist, etapas:p.etapas,
}]));
await writeFile('supabase/migrations/20261019000300_limpeza_especializada.sql', `begin;
-- Atualização aditiva: não modifica fichas já registradas nem contratos de outros ramos.
do $atualizacao$
declare perfis jsonb := private.perfis_atendimento();
begin
 perfis := perfis || $dados$${JSON.stringify(contratos)}$dados$::jsonb;
 execute format('create or replace function private.perfis_atendimento() returns jsonb language sql immutable set search_path='''' as %L', 'select ' || quote_literal(perfis::text) || '::jsonb');
end $atualizacao$;
create function private.campos_planejamento_limpeza() returns jsonb language sql immutable set search_path='' as $$ select '${JSON.stringify(camposPlanejamentoLimpeza)}'::jsonb $$;
revoke all on function private.campos_planejamento_limpeza() from public,anon,authenticated;
commit;
`);
