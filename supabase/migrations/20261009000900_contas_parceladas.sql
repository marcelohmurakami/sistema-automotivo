begin;
create table public.parcelamentos_financeiros (
 oficina_id uuid not null references public.oficinas(id), chave uuid not null,
 titulos uuid[] not null, criado_por uuid not null references auth.users(id), criado_em timestamptz not null default now(),
 primary key(oficina_id,chave)
);
alter table public.parcelamentos_financeiros enable row level security;
revoke all on public.parcelamentos_financeiros from public,anon,authenticated;
create function public.criar_conta_parcelada(p_oficina uuid,p_chave uuid,p_dados jsonb,p_parcelas jsonb) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare u uuid; ids uuid[]; p jsonb; n integer:=0; qtd integer; total bigint; soma bigint; id uuid;
begin
 u:=private.exigir_financeiro(p_oficina);
 if p_chave is null then raise exception 'Identificador obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtextextended('parcelas:'||p_oficina||':'||p_chave,0));
 select titulos into ids from public.parcelamentos_financeiros where oficina_id=p_oficina and chave=p_chave;
 if found then return ids;end if;
 if jsonb_typeof(p_parcelas) is distinct from 'array' then raise exception 'Informe as parcelas.';end if;
 qtd:=jsonb_array_length(p_parcelas);total:=(p_dados->>'valor_centavos')::bigint;
 if qtd not between 2 and 60 or total is null or total not between 1 and 10000000000 then raise exception 'Confira o total e a quantidade de parcelas.';end if;
 if coalesce((p_dados->>'automatico')::boolean,false) or nullif(p_dados->>'compra_id','') is not null or nullif(p_dados->>'recorrencia_id','') is not null or nullif(p_dados->>'comissao_id','') is not null then raise exception 'Use esta opção somente para novas contas manuais.';end if;
 select sum((x->>'valor_centavos')::bigint) into soma from jsonb_array_elements(p_parcelas) x;
 if soma is distinct from total then raise exception 'A soma das parcelas deve ser igual ao valor total.';end if;
 ids:='{}';
 if coalesce(length(trim(p_dados->>'descricao')),0) not between 3 and 200 then raise exception 'Informe uma descrição de 3 a 200 caracteres.';end if;
 for p in select * from jsonb_array_elements(p_parcelas) loop
  if p->>'vencimento' is null or (p->>'vencimento')::date is null or (p->>'valor_centavos') is null or (p->>'valor_centavos')::bigint<1 then raise exception 'Confira valor e vencimento de cada parcela.';end if;
  n:=n+1;id:=gen_random_uuid();
  perform public.salvar_titulo_financeiro(p_oficina,id,p_dados||jsonb_build_object('descricao',left(trim(p_dados->>'descricao'),180)||' · '||n||'/'||qtd,'valor_centavos',(p->>'valor_centavos')::bigint,'vencimento',p->>'vencimento'),null);
  ids:=array_append(ids,id);
 end loop;
 insert into public.parcelamentos_financeiros(oficina_id,chave,titulos,criado_por) values(p_oficina,p_chave,ids,u);
 return ids;
end $$;
revoke all on function public.criar_conta_parcelada(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.criar_conta_parcelada(uuid,uuid,jsonb,jsonb) to authenticated;
commit;
