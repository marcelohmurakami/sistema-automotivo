import {readFile,writeFile} from 'node:fs/promises';
import {especialidades,tiposDaEspecialidade} from '../src/lib/especialidades.ts';
const lista=Object.fromEntries(Object.entries(especialidades).map(([k,v])=>[k,{ramo:v.ramo,tipos:tiposDaEspecialidade(k)}]));
let sql=`begin;
create function private.catalogo_especialidades() returns jsonb language sql immutable set search_path='' as $catalogo$ select '${JSON.stringify(lista)}'::jsonb $catalogo$;
alter table public.oficinas add column especialidade text;
update public.oficinas set especialidade=case ramo when 'automotivo' then 'mecanica' when 'assistencia_tecnica' then 'assistencia_geral' when 'manutencao_campo' then 'manutencao_geral' else 'limpeza_geral' end;
update public.oficinas set especialidade='retifica' where id='e898f8dc-5e29-50d5-a746-7929f8cef4ab';
create function private.validar_especialidade_empresa() returns trigger language plpgsql set search_path='' as $$ begin
 if new.especialidade is null then new.especialidade:=case new.ramo when 'automotivo' then 'mecanica' when 'assistencia_tecnica' then 'assistencia_geral' when 'manutencao_campo' then 'manutencao_geral' else 'limpeza_geral' end;end if;
 if new.especialidade is not null and (private.catalogo_especialidades()->new.especialidade->>'ramo') is distinct from new.ramo then raise exception 'Especialidade incompatível com o ramo.' using errcode='22023';end if;return new;end $$;
create trigger validar_especialidade_empresa before insert or update of ramo,especialidade on public.oficinas for each row execute function private.validar_especialidade_empresa();
create function public.configurar_nova_empresa(p_chave uuid,p_nome text,p_telefone text,p_endereco jsonb,p_ramo text,p_especialidade text) returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid;begin
 if p_especialidade is null or (private.catalogo_especialidades()->p_especialidade->>'ramo') is distinct from p_ramo then raise exception 'Selecione uma especialidade válida para o ramo.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_chave::text,0));
 select oficina_id into w from public.cadastros_oficina where usuario_id=auth.uid() and chave=p_chave;
 if found then if (select especialidade from public.oficinas where id=w) is distinct from p_especialidade then raise exception 'Cadastro já concluído com outra especialidade.' using errcode='22023';end if;return w;end if;
 w:=public.configurar_nova_oficina(p_chave,p_nome,p_telefone,p_endereco);
 update public.oficinas set ramo=p_ramo,especialidade=p_especialidade where id=w;return w;end $$;
revoke all on function public.configurar_nova_empresa(uuid,text,text,jsonb,text,text) from public,anon;
grant execute on function public.configurar_nova_empresa(uuid,text,text,jsonb,text,text) to authenticated;
revoke execute on function public.configurar_nova_empresa(uuid,text,text,jsonb,text) from authenticated;
create function public.salvar_especialidade_empresa(p_oficina uuid,p_especialidade text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.exigir_gestao(p_oficina,'customers');
 if p_especialidade is null or not(private.catalogo_especialidades() ? p_especialidade) then raise exception 'Selecione a especialidade.' using errcode='22023';end if;
 update public.oficinas set especialidade=p_especialidade where id=p_oficina;end $$;
revoke all on function public.salvar_especialidade_empresa(uuid,text) from public,anon;
grant execute on function public.salvar_especialidade_empresa(uuid,text) to authenticated;
alter table public.ordens_servico add column tipo_servico text, add column detalhes_especialidade text not null default '' check(length(detalhes_especialidade)<=3000);
create function private.validar_tipo_servico() returns trigger language plpgsql security definer set search_path='' as $$
declare tipo text; anterior text; especialidade text;begin
 if tg_table_name='ordens_servico' then tipo:=new.tipo_servico; if tg_op='UPDATE' then anterior:=old.tipo_servico;end if;
 else tipo:=new.dados->>'tipo_servico';if tg_op='UPDATE' then anterior:=old.dados->>'tipo_servico';end if;end if;
 if tipo is null or tipo='' or (tg_op='UPDATE' and tipo is not distinct from anterior) then return new;end if;
 select o.especialidade into especialidade from public.oficinas o where o.id=new.oficina_id;
 if not coalesce(private.catalogo_especialidades()->especialidade->'tipos' ? tipo,false) then raise exception 'Tipo de serviço incompatível com a especialidade da empresa.' using errcode='22023';end if;return new;end $$;
create trigger validar_tipo_servico before insert or update on public.ordens_servico for each row execute function private.validar_tipo_servico();
create trigger validar_tipo_servico before insert or update on public.atendimentos_servicos for each row execute function private.validar_tipo_servico();
`;
const base=await readFile('supabase/migrations/20261008000100_multirramos.sql','utf8');
sql+=base.slice(base.indexOf('create or replace function public.consultar_meu_acesso()'),base.indexOf('create function private.exigir_servicos')).replace("'ramo',o.ramo,","'ramo',o.ramo,'especialidade',o.especialidade,");
const os=await readFile('supabase/migrations/20260928000800_modulo_ordens_servico.sql','utf8');
sql+=os.slice(os.indexOf('create function public.salvar_ordem_servico('),os.indexOf('create function public.registrar_anotacao_os(')).replace('create function','create or replace function').replace('set queixa_cliente=',"set tipo_servico=case when p_dados ? 'tipo_servico' then nullif(p_dados->>'tipo_servico','') else tipo_servico end,detalhes_especialidade=case when p_dados ? 'detalhes_especialidade' then coalesce(p_dados->>'detalhes_especialidade','') else detalhes_especialidade end,queixa_cliente=");
sql+='commit;\n';
await writeFile('supabase/migrations/20261008000500_especialidades_servicos.sql',sql);
