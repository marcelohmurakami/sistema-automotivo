begin;
alter table public.oficinas add column identidade_documentos jsonb not null default '{"cor":"#244336","rodape":""}';
alter table public.notas_atendimento add column chave_criacao uuid;
create unique index notas_chave_criacao on public.notas_atendimento(oficina_id,chave_criacao);
create function public.consultar_identidade(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_staff(p_oficina); return (select identidade_documentos||jsonb_build_object('nome',nome,'telefone',telefone_e164,'endereco',endereco) from public.oficinas where id=p_oficina);end $$;
create function public.salvar_identidade(p_oficina uuid,p_dados jsonb) returns void language plpgsql security definer set search_path='' as $$
declare logo text:=coalesce(p_dados->>'logo','');begin
 perform private.exigir_gestao(p_oficina,'customers');
 if p_dados is null or coalesce(p_dados->>'cor','')!~'^#[a-fA-F0-9]{6}$' or length(coalesce(p_dados->>'rodape',''))>300 or length(logo)>160000 or (logo<>'' and logo!~'^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then raise exception 'Confira cor, logo e rodapé.' using errcode='22023';end if;
 update public.oficinas set identidade_documentos=jsonb_build_object('cor',p_dados->>'cor','logo',logo,'rodape',coalesce(p_dados->>'rodape','')) where id=p_oficina;
end $$;
create function private.identidade_proposta() returns trigger language plpgsql security definer set search_path='' as $$
begin if tg_op='INSERT' or old.publicado_em is null then new.dados_oficina:=new.dados_oficina||(select identidade_documentos from public.oficinas where id=new.oficina_id);end if;return new;end $$;
create trigger identidade_proposta before insert or update on public.versoes_orcamento for each row execute function private.identidade_proposta();
create function public.listar_notinhas(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_staff(p_oficina);if not private.has_feature(p_oficina,'simple_notes') then raise exception 'Plano indisponível.' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(n)||jsonb_build_object('itens',(select coalesce(jsonb_agg(to_jsonb(i) order by posicao),'[]') from public.itens_nota_atendimento i where i.oficina_id=p_oficina and i.nota_id=n.id)) order by n.numero desc),'[]') from (select * from public.notas_atendimento where oficina_id=p_oficina order by numero desc limit 100) n);end $$;
create function public.emitir_notinha(p_oficina uuid,p_chave uuid,p_cliente uuid,p_itens jsonb,p_desconto bigint,p_observacoes text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; n uuid; num bigint; c public.clientes; i jsonb; pos int:=0; subtotal bigint; q numeric; preco bigint;begin
 u:=private.require_staff(p_oficina);if not private.has_feature(p_oficina,'simple_notes') then raise exception 'Plano indisponível.' using errcode='42501';end if;
 if p_chave is null or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 100 or length(coalesce(p_observacoes,''))>2000 then raise exception 'Informe cliente e até 100 itens.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));select id into n from public.notas_atendimento where oficina_id=p_oficina and chave_criacao=p_chave;if found then return n;end if;
 select * into c from public.clientes where oficina_id=p_oficina and id=p_cliente and arquivado_em is null;if not found then raise exception 'Cliente inválido.' using errcode='22023';end if;
 update public.oficinas set proximo_numero_nota=proximo_numero_nota+1 where id=p_oficina returning proximo_numero_nota-1 into num;
 insert into public.notas_atendimento(oficina_id,numero,cliente_id,dados_cliente,dados_oficina,observacoes,criado_por,chave_criacao) values(p_oficina,num,c.id,jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164),(select identidade_documentos||jsonb_build_object('nome',nome,'telefone',telefone_e164,'endereco',endereco) from public.oficinas where id=p_oficina),coalesce(p_observacoes,''),u,p_chave) returning id into n;
 for i in select value from jsonb_array_elements(p_itens) loop
 q:=(i->>'quantidade')::numeric;preco:=(i->>'preco_unitario_centavos')::bigint;
 if q is null or q<=0 or q>10000 or q<>round(q,3) or preco is null or preco not between 0 and 100000000 or length(trim(coalesce(i->>'descricao',''))) not between 1 and 300 or coalesce(i->>'tipo','') not in ('part','service') then raise exception 'Confira os itens e valores.' using errcode='22023';end if;
 insert into public.itens_nota_atendimento(oficina_id,nota_id,posicao,tipo,descricao,quantidade,unidade,preco_unitario_centavos) values(p_oficina,n,pos,i->>'tipo',trim(i->>'descricao'),q,'un',preco);pos:=pos+1;end loop;
 select sum(total_item_centavos) into subtotal from public.itens_nota_atendimento where nota_id=n and oficina_id=p_oficina;
 if subtotal>1000000000 or p_desconto is null or p_desconto not between 0 and subtotal then raise exception 'Desconto ou total inválido.' using errcode='22023';end if;
 update public.notas_atendimento set subtotal_centavos=subtotal,desconto_centavos=p_desconto,situacao='issued',emitido_em=now() where id=n;
 return n;end $$;
create function public.cancelar_notinha(p_oficina uuid,p_nota uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.exigir_gestao(p_oficina,'simple_notes'); update public.notas_atendimento set situacao='cancelled' where oficina_id=p_oficina and id=p_nota and situacao='issued';if not found then raise exception 'Nota indisponível.' using errcode='22023';end if;end $$;

create function public.reservar_foto_orcamento(p_oficina uuid,p_versao uuid,p_nome text,p_mime text,p_tamanho bigint,p_legenda text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; f uuid:=gen_random_uuid(); caminho text;begin
 u:=private.exigir_orcamentos(p_oficina);perform 1 from public.versoes_orcamento where oficina_id=p_oficina and id=p_versao and publicado_em is null for update;if not found then raise exception 'Fotos só podem ser anexadas ao rascunho.' using errcode='22023';end if;
 if p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp') or p_tamanho is null or p_tamanho not between 1 and 10485760 or length(coalesce(p_legenda,''))>500 then raise exception 'Use JPG, PNG ou WebP de até 10 MB.' using errcode='22023';end if;
 if (select count(*) from public.anexos_orcamento where oficina_id=p_oficina and versao_orcamento_id=p_versao)>=20 then raise exception 'Limite de 20 fotos por versão.' using errcode='22023';end if;
 caminho:=p_oficina||'/orcamentos/'||p_versao||'/'||f;
 insert into public.arquivos(id,oficina_id,recipiente,caminho_arquivo,nome_original,tipo_mime,tamanho_bytes,criado_por) values(f,p_oficina,'workshop-files',caminho,left(coalesce(p_nome,'foto'),200),p_mime,p_tamanho,u);
 insert into public.anexos_orcamento(oficina_id,versao_orcamento_id,arquivo_id,legenda) values(p_oficina,p_versao,f,coalesce(p_legenda,''));return jsonb_build_object('id',f,'caminho',caminho);end $$;
create function private.pode_enviar_foto_orcamento(p_caminho text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.arquivos f join public.anexos_orcamento a on a.arquivo_id=f.id and a.oficina_id=f.oficina_id join public.versoes_orcamento v on v.id=a.versao_orcamento_id and v.oficina_id=a.oficina_id where f.caminho_arquivo=p_caminho and f.recipiente='workshop-files' and f.criado_por=auth.uid() and f.situacao='pending' and f.criado_em>now()-interval '1 hour' and v.publicado_em is null and private.is_workshop_member(f.oficina_id) and private.has_feature(f.oficina_id,'quotes'));
$$;
create policy foto_orcamento_upload on storage.objects for insert to authenticated with check(bucket_id='workshop-files' and private.pode_enviar_foto_orcamento(name));
create function public.confirmar_foto_orcamento(p_oficina uuid,p_arquivo uuid) returns void language plpgsql security definer set search_path='' as $$
declare v uuid;begin perform private.exigir_orcamentos(p_oficina);select versao_orcamento_id into v from public.anexos_orcamento where oficina_id=p_oficina and arquivo_id=p_arquivo;perform 1 from public.versoes_orcamento where oficina_id=p_oficina and id=v and publicado_em is null for update;if not found then raise exception 'Rascunho indisponível.' using errcode='22023';end if;
 update public.arquivos f set situacao='ready' where f.oficina_id=p_oficina and f.id=p_arquivo and f.criado_por=auth.uid() and f.situacao='pending' and exists(select 1 from storage.objects where bucket_id=f.recipiente and name=f.caminho_arquivo);if not found then raise exception 'Envio não confirmado.' using errcode='22023';end if;end $$;
create function public.listar_fotos_orcamento(p_oficina uuid,p_versao uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_orcamentos(p_oficina);return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'arquivo_id',f.id,'situacao',f.situacao,'legenda',a.legenda,'caminho',f.caminho_arquivo) order by a.criado_em),'[]') from public.anexos_orcamento a join public.arquivos f on f.id=a.arquivo_id and f.oficina_id=a.oficina_id where a.oficina_id=p_oficina and a.versao_orcamento_id=p_versao);end $$;
create function public.remover_foto_orcamento(p_oficina uuid,p_anexo uuid) returns void language plpgsql security definer set search_path='' as $$
declare v uuid;begin perform private.exigir_orcamentos(p_oficina);select versao_orcamento_id into v from public.anexos_orcamento where oficina_id=p_oficina and id=p_anexo;perform 1 from public.versoes_orcamento where oficina_id=p_oficina and id=v and publicado_em is null for update;if not found then raise exception 'Só é possível remover fotos de rascunhos.' using errcode='22023';end if;delete from public.anexos_orcamento where oficina_id=p_oficina and id=p_anexo;end $$;
-- Propostas só podem ser emitidas após confirmar ou remover todas as fotos.
create function private.validar_fotos_publicacao() returns trigger language plpgsql security definer set search_path='' as $$
begin if old.publicado_em is null and new.publicado_em is not null and exists(select 1 from public.anexos_orcamento a join public.arquivos f on f.id=a.arquivo_id and f.oficina_id=a.oficina_id where a.oficina_id=new.oficina_id and a.versao_orcamento_id=new.id and f.situacao<>'ready') then raise exception 'Conclua o envio das fotos antes de emitir.' using errcode='22023';end if;return new;end $$;
create trigger validar_fotos_publicacao before update on public.versoes_orcamento for each row execute function private.validar_fotos_publicacao();
do $$declare f record;begin for f in select p.oid::regprocedure assinatura,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('consultar_identidade','salvar_identidade','identidade_proposta','listar_notinhas','emitir_notinha','cancelar_notinha','reservar_foto_orcamento','confirmar_foto_orcamento','listar_fotos_orcamento','remover_foto_orcamento','pode_enviar_foto_orcamento','validar_fotos_publicacao') loop execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.assinatura);end if;end loop;end $$;
grant execute on function private.pode_enviar_foto_orcamento(text) to authenticated;

create function public.fotos_proposta_publica(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tokens_acesso_orcamento;begin perform public.consultar_orcamento_publico(p_token);select * into t from public.tokens_acesso_orcamento where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex');return (select coalesce(jsonb_agg(jsonb_build_object('legenda',a.legenda,'caminho',f.caminho_arquivo)),'[]') from public.anexos_orcamento a join public.arquivos f on f.id=a.arquivo_id and f.oficina_id=a.oficina_id where a.oficina_id=t.oficina_id and a.versao_orcamento_id=t.versao_orcamento_id and a.visivel_ao_cliente and f.situacao='ready');end $$;
revoke all on function public.fotos_proposta_publica(text) from public,anon,authenticated;
grant execute on function public.fotos_proposta_publica(text) to service_role;
create function private.copiar_fotos_revisao() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.anexos_orcamento(oficina_id,versao_orcamento_id,arquivo_id,legenda,visivel_ao_cliente) select a.oficina_id,new.id,a.arquivo_id,a.legenda,a.visivel_ao_cliente from public.anexos_orcamento a join public.versoes_orcamento v on v.id=a.versao_orcamento_id and v.oficina_id=a.oficina_id join public.arquivos f on f.id=a.arquivo_id and f.oficina_id=a.oficina_id where v.oficina_id=new.oficina_id and v.orcamento_id=new.orcamento_id and v.numero_versao=new.numero_versao-1 and f.situacao='ready';return new;end $$;
create trigger copiar_fotos_revisao after insert on public.versoes_orcamento for each row execute function private.copiar_fotos_revisao();
revoke all on function private.copiar_fotos_revisao() from public,anon,authenticated;

do $$declare d text;begin select pg_get_functiondef('public.consultar_orcamento_publico(text)'::regprocedure) into d;d:=replace(d,'''telefone_e164'',v.dados_oficina->>''telefone_e164'')','''telefone_e164'',v.dados_oficina->>''telefone_e164'',''logo'',v.dados_oficina->>''logo'',''cor'',v.dados_oficina->>''cor'',''rodape'',v.dados_oficina->>''rodape'')');execute d;end $$;
notify pgrst,'reload schema';commit;
