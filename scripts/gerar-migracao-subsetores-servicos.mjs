import { writeFile } from "node:fs/promises";
import { especialidades, tiposDaEspecialidade } from "../src/lib/especialidades.ts";
import { perfisAtendimento } from "../src/lib/perfisAtendimento.ts";

// Nova versão; não reescreve migrations já existentes/aplicadas.
const catalogo = Object.fromEntries(
  Object.entries(especialidades).map(([id, p]) => [
    id,
    { ramo: p.ramo, tipos: tiposDaEspecialidade(id) },
  ]),
);
const perfis = Object.fromEntries(
  Object.entries(perfisAtendimento).map(([id, p]) => [
    id,
    {
      campos: Object.fromEntries(
        p.grupos
          .flatMap((g) => g.campos)
          .map((c) => [
            c.id,
            { tipo: c.tipo || "texto", ...(c.opcoes ? { opcoes: c.opcoes } : {}) },
          ]),
      ),
      checklist: p.checklist,
      etapas: p.etapas,
    },
  ]),
);
const sql = `begin;
-- Amplia somente os catálogos. Nenhuma empresa ou ficha histórica é reclassificada.
create or replace function private.catalogo_especialidades() returns jsonb language sql immutable set search_path='' as $catalogo$ select $dados$${JSON.stringify(catalogo)}$dados$::jsonb $catalogo$;
create or replace function private.perfis_atendimento() returns jsonb language sql immutable set search_path='' as $perfil$ select $dados$${JSON.stringify(perfis)}$dados$::jsonb $perfil$;

create or replace function private.conferir_ficha_especialidade() returns trigger language plpgsql security definer set search_path='' as $f$
declare atual text; ramo text; anterior text; herdada boolean:=false;
begin
 if new.ficha_especialidade is null then
   if tg_op='UPDATE' and tg_table_name='atendimentos_servicos' then
     if old.ficha_especialidade is not null then raise exception 'Preserve a ficha do atendimento.' using errcode='22023';end if;
   end if;
   return new;
 end if;
 perform private.validar_ficha_especialidade(new.ficha_especialidade);
 select o.especialidade,o.ramo into atual,ramo from public.oficinas o where o.id=new.oficina_id;
 if tg_op='UPDATE' then anterior:=old.ficha_especialidade->>'especialidade';end if;
 if tg_table_name='atendimentos_servicos' then
   if private.catalogo_especialidades()->(new.ficha_especialidade->>'especialidade')->>'ramo' is distinct from ramo then
     raise exception 'Ficha incompatível com o ramo da empresa.' using errcode='22023';end if;
   if anterior is not null and anterior is distinct from new.ficha_especialidade->>'especialidade' then
     raise exception 'Preserve o subsetor da ficha já registrada.' using errcode='22023';end if;
   return new;
 end if;
 if tg_table_name='versoes_orcamento' then
   select exists(select 1 from public.versoes_orcamento v where v.oficina_id=new.oficina_id and v.orcamento_id=new.orcamento_id and v.id<>new.id and v.ficha_especialidade->>'especialidade'=new.ficha_especialidade->>'especialidade') into herdada;
 elsif tg_table_name='ordens_servico' then
   select exists(select 1 from public.versoes_orcamento v where v.oficina_id=new.oficina_id and v.id=new.versao_orcamento_origem_id and v.ficha_especialidade->>'especialidade'=new.ficha_especialidade->>'especialidade') into herdada;
 end if;
 if new.ficha_especialidade->>'especialidade' is distinct from atual and new.ficha_especialidade->>'especialidade' is distinct from anterior and not herdada then
   raise exception 'Ficha incompatível com a especialidade da empresa.' using errcode='22023';end if;
 return new;
end $f$;

create or replace function private.validar_tipo_servico() returns trigger language plpgsql security definer set search_path='' as $f$
declare tipo text; anterior text; especialidade text; ramo text;begin
 if tg_table_name='ordens_servico' then
   tipo:=new.tipo_servico;if tg_op='UPDATE' then anterior:=old.tipo_servico;end if;
 else
   tipo:=new.dados->>'tipo_servico';if tg_op='UPDATE' then anterior:=old.dados->>'tipo_servico';end if;
 end if;
 if tipo is null or tipo='' or (tg_op='UPDATE' and tipo is not distinct from anterior) then return new;end if;
 select o.especialidade,o.ramo into especialidade,ramo from public.oficinas o where o.id=new.oficina_id;
 if tg_table_name='atendimentos_servicos' and new.ficha_especialidade is not null then
   especialidade:=new.ficha_especialidade->>'especialidade';
   if private.catalogo_especialidades()->especialidade->>'ramo' is distinct from ramo then
     raise exception 'Subsetor incompatível com o ramo.' using errcode='22023';end if;
 end if;
 if not coalesce(private.catalogo_especialidades()->especialidade->'tipos' ? tipo,false) then
   raise exception 'Tipo de serviço incompatível com o subsetor do atendimento.' using errcode='22023';end if;
 return new;
end $f$;
-- Mantém o contrato legado sem ficha; fichas novas distinguem prazo técnico da cobrança.
do $m$ declare anterior text; novo text;begin
 anterior:=pg_get_functiondef('public.consultar_alertas_incluindo_excluidos(uuid)'::regprocedure);
 novo:=replace(anterior,'a.vencimento data', 'case when a.ficha_especialidade is null then a.vencimento else nullif(a.ficha_especialidade->''campos''->>''prazo_servico'','''')::date end data');
 novo:=replace(novo,'and vencimento<=hoje+5','and (case when a.ficha_especialidade is null then a.vencimento else nullif(a.ficha_especialidade->''campos''->>''prazo_servico'','''')::date end)<=hoje+5');
 if novo=anterior then raise exception 'Contrato de alertas incompatível.';end if;
 execute novo;
end $m$;
notify pgrst,'reload schema';
commit;
`;
await writeFile("supabase/migrations/20261014000200_subsetores_servicos.sql", sql);
