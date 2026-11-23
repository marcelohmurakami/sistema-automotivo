import { writeFile } from "node:fs/promises";
import { perfisAtendimento } from "../src/lib/perfisAtendimento.ts";

// Gere somente durante a implementação desta migration; não reescreva uma versão aplicada.
const catalogo = Object.fromEntries(
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
let sql = `begin;
-- Fichas internas: consultas públicas continuam usando listas explícitas de campos.
alter table public.ordens_servico add column ficha_especialidade jsonb;
alter table public.versoes_orcamento add column ficha_especialidade jsonb;
alter table public.atendimentos_servicos add column ficha_especialidade jsonb;
create function private.perfis_atendimento() returns jsonb language sql immutable set search_path='' as $perfil$ select $dados$${JSON.stringify(catalogo)}$dados$::jsonb $perfil$;

create function private.validar_ficha_especialidade(p_ficha jsonb) returns void
language plpgsql immutable set search_path='' as $f$
declare p jsonb; c jsonb; k text; v jsonb; texto text;
begin
 if p_ficha is null then return; end if;
 if jsonb_typeof(p_ficha) is distinct from 'object' or p_ficha->'versao' is distinct from '1'::jsonb
 or jsonb_typeof(p_ficha->'especialidade') is distinct from 'string'
 or jsonb_typeof(p_ficha->'campos') is distinct from 'object'
 or jsonb_typeof(p_ficha->'checklist') is distinct from 'object'
 or jsonb_typeof(p_ficha->'etapa') is distinct from 'string'
 or octet_length(p_ficha::text)>45000 then raise exception 'Ficha técnica inválida.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p_ficha) chave where chave not in ('versao','especialidade','campos','checklist','etapa')) then raise exception 'Ficha técnica inválida.' using errcode='22023';end if;
 p:=private.perfis_atendimento()->(p_ficha->>'especialidade');
 if p is null then raise exception 'Especialidade inválida.' using errcode='22023';end if;
 for k,v in select * from jsonb_each(p_ficha->'campos') loop
   c:=p->'campos'->k;texto:=v#>>'{}';
   if c is null or jsonb_typeof(v)<>'string' or length(texto)>1500 then raise exception 'Campo técnico inválido.' using errcode='22023';end if;
   if texto='' then continue;end if;
   if c->>'tipo'='numero' and texto !~ '^[0-9]{1,9}(\\.[0-9]{1,3})?$' then raise exception 'Medição numérica inválida.' using errcode='22023';end if;
   if c->>'tipo'='data' then
     if texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or left(texto,5)='0000-' then raise exception 'Data técnica inválida.' using errcode='22023';end if;
     begin perform texto::date;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Data técnica inválida.' using errcode='22023';end;
   end if;
   if c ? 'opcoes' and not (c->'opcoes' ? texto) then raise exception 'Opção técnica inválida.' using errcode='22023';end if;
 end loop;
 for k,v in select * from jsonb_each(p_ficha->'checklist') loop
   if not (p->'checklist' ? k) or jsonb_typeof(v)<>'boolean' then raise exception 'Conferência inválida.' using errcode='22023';end if;
 end loop;
 if p_ficha->>'etapa'<>'' and not (p->'etapas' ? (p_ficha->>'etapa')) then raise exception 'Etapa técnica inválida.' using errcode='22023';end if;
end $f$;

create function private.conferir_ficha_especialidade() returns trigger language plpgsql security definer set search_path='' as $f$
declare atual text; anterior text; herdada boolean:=false;
begin
 if new.ficha_especialidade is null then return new;end if;
 perform private.validar_ficha_especialidade(new.ficha_especialidade);
 select especialidade into atual from public.oficinas where id=new.oficina_id;
 if tg_op='UPDATE' then anterior:=old.ficha_especialidade->>'especialidade';end if;
 if tg_table_name='versoes_orcamento' then
   select exists(select 1 from public.versoes_orcamento v where v.oficina_id=new.oficina_id and v.orcamento_id=new.orcamento_id and v.id<>new.id and v.ficha_especialidade->>'especialidade'=new.ficha_especialidade->>'especialidade') into herdada;
 elsif tg_table_name='ordens_servico' then
   select exists(select 1 from public.versoes_orcamento v where v.oficina_id=new.oficina_id and v.id=new.versao_orcamento_origem_id and v.ficha_especialidade->>'especialidade'=new.ficha_especialidade->>'especialidade') into herdada;
 end if;
 if new.ficha_especialidade->>'especialidade' is distinct from atual and new.ficha_especialidade->>'especialidade' is distinct from anterior and not herdada then
   raise exception 'Ficha incompatível com a especialidade da empresa.' using errcode='22023';end if;
 return new;
end $f$;
create trigger z_validar_ficha_especialidade before insert or update on public.ordens_servico for each row execute function private.conferir_ficha_especialidade();
create trigger z_validar_ficha_especialidade before insert or update on public.versoes_orcamento for each row execute function private.conferir_ficha_especialidade();
create trigger z_validar_ficha_especialidade before insert or update on public.atendimentos_servicos for each row execute function private.conferir_ficha_especialidade();
`;
function alterar(assinatura, substituicoes) {
  sql += `\ndo $m$ declare anterior text; novo text;begin\n novo:=pg_get_functiondef('${assinatura}'::regprocedure);\n`;
  for (const [antes, depois] of substituicoes)
    sql += ` anterior:=novo;novo:=replace(novo,$a$${antes}$a$,$b$${depois}$b$);if novo=anterior then raise exception 'Contrato incompatível: ${assinatura}';end if;\n`;
  sql += " execute novo;end $m$;\n";
}
const gravacao =
  "ficha_especialidade=case when p_dados ? 'ficha_especialidade' then nullif(p_dados->'ficha_especialidade','null'::jsonb) else ficha_especialidade end,";
for (const funcao of ["salvar_ordem_servico", "salvar_orcamento"])
  alterar(`public.${funcao}(uuid,jsonb,uuid,uuid,integer)`, [
    ["detalhes_especialidade=case when", gravacao + "detalhes_especialidade=case when"],
  ]);
alterar("public.revisar_orcamento(uuid,uuid,integer)", [
  [
    "detalhes_especialidade=v.detalhes_especialidade",
    "ficha_especialidade=v.ficha_especialidade,detalhes_especialidade=v.detalhes_especialidade",
  ],
]);
alterar("private.importar_tecnico_orcamento_os()", [
  [
    "new.tipo_servico:=",
    "new.ficha_especialidade:=coalesce(v.ficha_especialidade,new.ficha_especialidade);\n new.tipo_servico:=",
  ],
]);
alterar("public.salvar_atendimento_servico(uuid,uuid,jsonb,integer)", [
  [
    "titulo,situacao,dados,valor_centavos,vencimento)",
    "titulo,situacao,dados,valor_centavos,vencimento,ficha_especialidade)",
  ],
  [
    "(p_dados->>'vencimento')::date)",
    "(p_dados->>'vencimento')::date,case when p_dados ? 'ficha_especialidade' then nullif(p_dados->'ficha_especialidade','null'::jsonb) else a.ficha_especialidade end)",
  ],
  [
    "vencimento=excluded.vencimento,revisao=",
    "vencimento=excluded.vencimento,ficha_especialidade=excluded.ficha_especialidade,revisao=",
  ],
]);
alterar("public.consultar_relatorios_gestao(uuid,date,date)", [
  [
    "'tipo',w.tipo_servico",
    "'ficha_especialidade',w.ficha_especialidade,'tipo',w.tipo_servico",
  ],
]);
sql += `
create function public.modelo_etapas_especialidade(p_oficina uuid,p_os uuid) returns void language plpgsql security definer set search_path='' as $f$
declare w public.ordens_servico; perfil text; nome text;n integer:=0;
begin
 perform private.exigir_os(p_oficina);
 select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
 if not found or w.situacao in ('delivered','cancelled') or w.arquivado_em is not null then raise exception 'OS encerrada ou indisponível.' using errcode='22023';end if;
 if exists(select 1 from public.etapas_execucao_os where oficina_id=p_oficina and ordem_servico_id=p_os) then return;end if;
 select coalesce(w.ficha_especialidade->>'especialidade',especialidade) into perfil from public.oficinas where id=p_oficina;
 for nome in select jsonb_array_elements_text(private.perfis_atendimento()->perfil->'etapas') loop
   perform public.salvar_etapa_execucao(p_oficina,p_os,gen_random_uuid(),jsonb_build_object('nome',nome,'posicao',n));n:=n+1;
 end loop;
 if n=0 then raise exception 'Especialidade indisponível.' using errcode='22023';end if;
end $f$;
revoke all on function private.perfis_atendimento(),private.validar_ficha_especialidade(jsonb),private.conferir_ficha_especialidade() from public,anon,authenticated;
revoke all on function public.modelo_etapas_especialidade(uuid,uuid) from public,anon;
grant execute on function public.modelo_etapas_especialidade(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
`;
await writeFile("supabase/migrations/20261014000100_fichas_especialidades.sql", sql);
