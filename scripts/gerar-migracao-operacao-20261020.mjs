import { readFile, writeFile } from 'node:fs/promises';
import { perfisAtendimento } from '../src/lib/perfisAtendimento.ts';
const pasta = new URL('../supabase/migrations/', import.meta.url);
const contratos = Object.fromEntries(['autocenter','troca_oleo'].map(id => {
  const p=perfisAtendimento[id];
  return [id,{ campos:Object.fromEntries(p.grupos.flatMap(g=>g.campos).map(c=>[c.id,{tipo:c.tipo||'texto',...(c.opcoes?{opcoes:c.opcoes}:{})}])),checklist:p.checklist,etapas:p.etapas }];
}));
await writeFile(new URL('20261020000100_mecanica_e_revisao_oleo.sql',pasta),`begin;
-- Ampliação dos registros opcionais; preserva fichas e permissões existentes.
do $atualizacao$
declare perfis jsonb := private.perfis_atendimento();
begin
 perfis := perfis || $dados$${JSON.stringify(contratos)}$dados$::jsonb;
 execute format('create or replace function private.perfis_atendimento() returns jsonb language sql immutable set search_path='''' as %L', 'select ' || quote_literal(perfis::text) || '::jsonb');
end $atualizacao$;
commit;
`);
const original=await readFile(new URL('20261019000800_painel_servicos_paginado.sql',pasta),'utf8');
let pagina=original.slice(original.indexOf('create function public.pagina_servicos'), original.indexOf('create function public.buscar_selecao_servicos')).trim();
pagina=pagina.replace('create function','create or replace function');
const marcador="       and (coalesce(p_filtros->>'estado','')='' or a.situacao=p_filtros->>'estado')";
if(!pagina.includes(marcador)) throw Error('Contrato de paginação alterado. Revise a migração.');
pagina=pagina.replace(marcador,`${marcador}
       and (coalesce(p_filtros->>'documento','')='' or a.dados->>'documento'=p_filtros->>'documento' or (not a.dados ? 'documento' and a.situacao='orcamento'))
       and (coalesce(p_filtros->>'fluxo','')='' or private.etapa_painel_assistencia(a.situacao,a.dados,a.ficha_especialidade)=p_filtros->>'fluxo')`);
await writeFile(new URL('20261020000200_orcamentos_e_painel_assistencia.sql',pasta),`begin;
create function private.etapa_painel_assistencia(situacao text,dados jsonb,ficha jsonb) returns text
language sql immutable set search_path='' as $$
select case situacao
 when 'cancelado' then null
 when 'concluido' then case when coalesce(ficha->>'etapa','') in ('Entregue','Aceite registrado') then null else 'prontos' end
 when 'aguardando' then 'parados' when 'em_execucao' then 'producao' when 'aprovado' then 'aprovados'
 else case when dados->>'orcamento_enviado'='nao' then 'recebidos' else 'aprovacao' end end;
$$;
revoke all on function private.etapa_painel_assistencia(text,jsonb,jsonb) from public,anon,authenticated;
create index atendimentos_fluxo_assistencia on public.atendimentos_servicos(oficina_id,private.etapa_painel_assistencia(situacao,dados,ficha_especialidade),criado_em desc,id desc);
${pagina}

-- Criação e itens são uma única transação. A mesma chave nunca gera duas ordens.
create function public.criar_atendimento_com_itens(p_oficina uuid,p_id uuid,p_dados jsonb,p_itens jsonb,p_desconto bigint default 0,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare revisao_atual integer; situacao_final text := coalesce(p_dados->>'situacao','orcamento');
begin
 perform private.exigir_servicos(p_oficina,'work_orders');
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 if exists(select 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id) then return p_id; end if;
 if p_revisao is not null or p_id is null or situacao_final not in ('orcamento','aprovado','em_execucao','aguardando') then raise exception 'Salve a ordem antes de concluir ou cancelar o serviço.' using errcode='22023'; end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens)>100 then raise exception 'Lista de itens inválida.' using errcode='22023';end if;
 perform public.salvar_atendimento_servico(p_oficina,p_id,p_dados||'{"situacao":"orcamento","valor_centavos":0}'::jsonb,null);
 select revisao into revisao_atual from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id;
 perform public.salvar_itens_atendimento(p_oficina,p_id,revisao_atual,p_itens,p_desconto,0,'');
 if situacao_final<>'orcamento' then
   select revisao into revisao_atual from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id;
   perform public.salvar_atendimento_servico(p_oficina,p_id,(select to_jsonb(a)||jsonb_build_object('situacao',situacao_final) from public.atendimentos_servicos a where oficina_id=p_oficina and id=p_id),revisao_atual);
 end if;
 return p_id;
end $$;
revoke all on function public.criar_atendimento_com_itens(uuid,uuid,jsonb,jsonb,bigint,integer) from public,anon;
grant execute on function public.criar_atendimento_com_itens(uuid,uuid,jsonb,jsonb,bigint,integer) to authenticated;
commit;
`);
console.log('Migrações de autocenter, óleo, criação atômica e painel geradas.');
const conflitos=await readFile(new URL('20261019001200_conflitos_revisao_http.sql',pasta),'utf8');
let agenda=conflitos.slice(conflitos.indexOf('CREATE OR REPLACE FUNCTION public.salvar_agenda_servico('),conflitos.indexOf('CREATE OR REPLACE FUNCTION public.salvar_atendimento_servico_base('));
agenda=agenda.replace("fimv timestamptz:=(p_dados->>'fim')::timestamptz; begin", "fimv timestamptz:=(p_dados->>'fim')::timestamptz; visita_nova boolean; deslocamento integer; begin");
agenda=agenda.replace(" perform 1 from public.atendimentos_servicos", ` visita_nova:=coalesce((p_dados->>'visita')::boolean,a.visita,false);
 deslocamento:=case when visita_nova then coalesce((p_dados->>'deslocamento_minutos')::integer,a.deslocamento_minutos,0) else 0 end;
 if deslocamento not between 0 and 720 then raise exception 'Informe um deslocamento entre 0 e 720 minutos.' using errcode='22023';end if;
 perform 1 from public.atendimentos_servicos`);
agenda=agenda.replace('and inicio<fimv and fim>ini','and inicio-make_interval(mins=>deslocamento_minutos)<fimv and fim>ini-make_interval(mins=>deslocamento)');
agenda=agenda.replace('inicio,fim,situacao,observacoes)','inicio,fim,situacao,observacoes,visita,deslocamento_minutos)');
agenda=agenda.replace("coalesce(p_dados->>'observacoes',''))", "coalesce(p_dados->>'observacoes',''),visita_nova,deslocamento)");
agenda=agenda.replace('observacoes=excluded.observacoes,revisao=', 'observacoes=excluded.observacoes,visita=excluded.visita,deslocamento_minutos=excluded.deslocamento_minutos,revisao=');
await writeFile(new URL('20261020000400_visitas_deslocamento.sql',pasta),`begin;
alter table public.agenda_servicos add column visita boolean not null default false,
 add column deslocamento_minutos integer not null default 0 check(deslocamento_minutos between 0 and 720),
 add constraint agenda_deslocamento_visita check(visita or deslocamento_minutos=0);
${agenda}
${pagina.replace('g.inicio<v_fim', '(g.inicio-make_interval(mins=>g.deslocamento_minutos))<v_fim')}
commit;
`);
