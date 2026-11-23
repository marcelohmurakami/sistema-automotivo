-- Contratos: versões por competência, franquias e faturamento sem baixa automática.
create table public.contratos_preventivos (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), cliente_id uuid not null references public.clientes(id),
 nome text not null check(length(nome) between 3 and 140), inicio date not null, fim date, encerrado_em date,
 revisao integer not null default 1, criado_em timestamptz not null default now(), criado_por uuid not null,
 check(fim is null or fim>=inicio), check(encerrado_em is null or encerrado_em>=inicio)
);
create index contratos_empresa on public.contratos_preventivos(oficina_id,nome,id);
create table public.versoes_contrato (
 contrato_id uuid not null references public.contratos_preventivos(id), desde date not null, regras jsonb not null,
 motivo text not null, criado_em timestamptz not null default now(), autor uuid not null, primary key(contrato_id,desde)
);
create table public.consumos_contrato (
 id uuid primary key, contrato_id uuid not null references public.contratos_preventivos(id), data date not null,
 servico text not null, equipamento text not null default '', visitas integer not null check(visitas between 0 and 1000),
 minutos integer not null check(minutos between 0 and 100000), materiais_centavos bigint not null check(materiais_centavos between 0 and 1000000000),
 observacoes text not null check(length(observacoes)<=2000), cancelado boolean not null default false,
 criado_em timestamptz not null default now(), autor uuid not null
);
create index consumos_contrato_periodo on public.consumos_contrato(contrato_id,data,id);
create table public.faturas_contrato (
 contrato_id uuid not null references public.contratos_preventivos(id), competencia date not null, resumo jsonb not null,
 titulo_id uuid references public.titulos_financeiros(id), criado_em timestamptz not null default now(), autor uuid not null,
 primary key(contrato_id,competencia)
);
alter table public.contratos_preventivos enable row level security;
alter table public.versoes_contrato enable row level security;
alter table public.consumos_contrato enable row level security;
alter table public.faturas_contrato enable row level security;
revoke all on public.contratos_preventivos,public.versoes_contrato,public.consumos_contrato,public.faturas_contrato from public,anon,authenticated;

create function private.regras_contrato(d jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; v bigint;
begin
 if jsonb_typeof(d)<>'object' or length(d::text)>30000 then raise exception 'Condições do contrato inválidas.' using errcode='22023';end if;
 foreach k in array array['mensalidade','franquia_visitas','franquia_minutos','franquia_materiais','excedente_visita','excedente_hora','participacao_visita'] loop
 v:=(d->>k)::bigint;if v is null or v<0 or v>1000000000 then raise exception 'Valor inválido: %',k using errcode='22023';end if;
 end loop;
 if (d->>'vencimento_dia')::int not between 1 and 28 or d->>'vencimento_dia' is null then raise exception 'Dia de vencimento deve ser entre 1 e 28.' using errcode='22023';end if;
 foreach k in array array['servicos','equipamentos'] loop
 if jsonb_typeof(d->k) is distinct from 'array' or jsonb_array_length(d->k)>100 then raise exception 'Informe a cobertura do contrato.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements_text(d->k) x where length(trim(x)) not between 2 and 200) then raise exception 'Descrição de cobertura inválida.' using errcode='22023';end if;
 end loop;
 if jsonb_array_length(d->'servicos')=0 then raise exception 'Informe ao menos um serviço coberto.' using errcode='22023';end if;
 return d;
end $$;

create function public.salvar_contrato_preventivo(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contratos_preventivos; u uuid; d date; r jsonb;
begin
 u:=private.exigir_financeiro(p_oficina);perform private.gerencia_planejamento(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended('contrato:'||p_id,0));
 select * into c from public.contratos_preventivos where id=p_id;
 if found then
 if c.oficina_id<>p_oficina then raise exception 'Contrato indisponível.' using errcode='42501';end if;
 if p_revisao is null and c.revisao=1 and c.nome=trim(p_dados->>'nome') and c.cliente_id=(p_dados->>'cliente_id')::uuid and c.inicio=(p_dados->>'inicio')::date and c.fim is not distinct from nullif(p_dados->>'fim','')::date and exists(select 1 from public.versoes_contrato where contrato_id=c.id and regras=p_dados->'regras') then return c.id;end if;
 if p_revisao is null or c.revisao<>p_revisao then raise exception 'Contrato alterado. Atualize a página.' using errcode='PT409';end if;
 if c.encerrado_em is not null then raise exception 'Contrato encerrado.' using errcode='22023';end if;
 d:=(p_dados->>'desde')::date;
 if d is null or extract(day from d)<>1 or d<=c.inicio or d<=(select max(desde) from public.versoes_contrato where contrato_id=c.id)
 or exists(select 1 from public.faturas_contrato where contrato_id=c.id and competencia>=d)
 or exists(select 1 from public.consumos_contrato where contrato_id=c.id and data>=d and not cancelado)
 then raise exception 'Reajuste exige uma competência futura sem consumo ou fatura, posterior à última versão.' using errcode='22023';end if;
 if length(trim(coalesce(p_dados->>'motivo','')))<3 then raise exception 'Informe o motivo do reajuste.' using errcode='22023';end if;
 r:=private.regras_contrato(p_dados->'regras');
 insert into public.versoes_contrato values(c.id,d,r,left(p_dados->>'motivo',500),now(),u);
 update public.contratos_preventivos set revisao=revisao+1 where id=c.id;return c.id;
 end if;
 if p_revisao is not null then raise exception 'Contrato indisponível.' using errcode='P0002';end if;
 if not exists(select 1 from public.clientes where oficina_id=p_oficina and id=(p_dados->>'cliente_id')::uuid) then raise exception 'Cliente indisponível.' using errcode='42501';end if;
 d:=(p_dados->>'inicio')::date;r:=private.regras_contrato(p_dados->'regras');
 if d not between date '2020-01-01' and date '2097-12-31' then raise exception 'Data inválida.' using errcode='22023';end if;
 insert into public.contratos_preventivos(id,oficina_id,cliente_id,nome,inicio,fim,criado_por) values(p_id,p_oficina,(p_dados->>'cliente_id')::uuid,trim(p_dados->>'nome'),d,nullif(p_dados->>'fim','')::date,u);
 insert into public.versoes_contrato values(p_id,date_trunc('month',d)::date,r,'Condições iniciais',now(),u);return p_id;
end $$;

create function public.registrar_consumo_contrato(p_oficina uuid,p_contrato uuid,p_id uuid,p_dados jsonb,p_cancelar boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare c public.contratos_preventivos;r jsonb;d date;u uuid; antigo public.consumos_contrato;
begin
 u:=private.exigir_financeiro(p_oficina);perform private.gerencia_planejamento(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended('contrato:'||p_contrato,0));
 select * into c from public.contratos_preventivos where oficina_id=p_oficina and id=p_contrato;
 if not found then raise exception 'Contrato indisponível.' using errcode='42501';end if;
 select * into antigo from public.consumos_contrato where id=p_id;
 if found then
 if antigo.contrato_id<>c.id then raise exception 'Consumo indisponível.' using errcode='42501';end if;
 if not p_cancelar then
 if (to_jsonb(antigo)-array['id','contrato_id','cancelado','criado_em','autor'])=jsonb_build_object('data',p_dados->>'data','servico',p_dados->>'servico','equipamento',coalesce(p_dados->>'equipamento',''),'visitas',(p_dados->>'visitas')::int,'minutos',(p_dados->>'minutos')::int,'materiais_centavos',(p_dados->>'materiais_centavos')::bigint,'observacoes',coalesce(p_dados->>'observacoes','')) then return;end if;
 raise exception 'Esta identificação já foi utilizada para outro consumo.' using errcode='PT409';end if;
 d:=antigo.data;
 else
 if p_cancelar then raise exception 'Consumo indisponível.' using errcode='P0002';end if;
 d:=(p_dados->>'data')::date;
 end if;
 if exists(select 1 from public.faturas_contrato where contrato_id=c.id and competencia=date_trunc('month',d)::date) then raise exception 'Competência fechada. Não é possível alterar seu consumo.' using errcode='22023';end if;
 if p_cancelar then update public.consumos_contrato set cancelado=true where id=p_id;return;end if;
 if d is null or d<c.inicio or d>least(coalesce(c.fim,date '2099-12-31'),coalesce(c.encerrado_em,date '2099-12-31')) then raise exception 'Consumo fora da vigência.' using errcode='22023';end if;
 select regras into r from public.versoes_contrato where contrato_id=c.id and desde<=d order by desde desc limit 1;
 if not (r->'servicos' ? (p_dados->>'servico')) or (jsonb_array_length(r->'equipamentos')>0 and not(r->'equipamentos' ? coalesce(p_dados->>'equipamento',''))) then raise exception 'Serviço ou equipamento fora da cobertura. Registre como atendimento avulso.' using errcode='22023';end if;
 insert into public.consumos_contrato(id,contrato_id,data,servico,equipamento,visitas,minutos,materiais_centavos,observacoes,autor) values(p_id,c.id,d,p_dados->>'servico',coalesce(p_dados->>'equipamento',''),(p_dados->>'visitas')::int,(p_dados->>'minutos')::int,(p_dados->>'materiais_centavos')::bigint,coalesce(p_dados->>'observacoes',''),u);
end $$;

create function private.previa_fatura_contrato(c public.contratos_preventivos,m date) returns jsonb language plpgsql stable set search_path='' as $$
declare r jsonb; v bigint; h bigint; p bigint; ev bigint; eh bigint; ep bigint; part bigint; mensal bigint; inicio date; fim date; dias int;
begin
 if m is null or extract(day from m)<>1 or m<date_trunc('month',c.inicio)::date or m>least(coalesce(c.fim,date '2099-12-31'),coalesce(c.encerrado_em,date '2099-12-31')) then raise exception 'Competência fora da vigência.' using errcode='22023';end if;
 select regras into r from public.versoes_contrato where contrato_id=c.id and desde<=m order by desde desc limit 1;
 inicio:=greatest(m,c.inicio);fim:=least((m+interval '1 month - 1 day')::date,coalesce(c.fim,date '2099-12-31'),coalesce(c.encerrado_em,date '2099-12-31'));dias:=extract(day from m+interval '1 month - 1 day');
 select coalesce(sum(visitas),0),coalesce(sum(minutos),0),coalesce(sum(materiais_centavos),0) into v,h,p from public.consumos_contrato where contrato_id=c.id and not cancelado and data between inicio and fim;
 mensal:=round((r->>'mensalidade')::numeric*(fim-inicio+1)/dias);
 ev:=greatest(0,v-(r->>'franquia_visitas')::bigint)*(r->>'excedente_visita')::bigint;
 eh:=round(greatest(0,h-(r->>'franquia_minutos')::bigint)*(r->>'excedente_hora')::numeric/60);
 ep:=greatest(0,p-(r->>'franquia_materiais')::bigint);part:=v*(r->>'participacao_visita')::bigint;
 if mensal+ev+eh+ep+part>10000000000 then raise exception 'Fatura excede o limite financeiro.' using errcode='22023';end if;
 return jsonb_build_object('competencia',m,'inicio',inicio,'fim',fim,'regras',r,'visitas',v,'minutos',h,'materiais',p,'mensalidade',mensal,'excedente_visitas',ev,'excedente_horas',eh,'excedente_materiais',ep,'participacao',part,'total',mensal+ev+eh+ep+part,'vencimento',(m+interval '1 month')::date+(r->>'vencimento_dia')::int-1);
end $$;

create function public.faturar_contrato(p_oficina uuid,p_contrato uuid,p_mes date,p_confirmar boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratos_preventivos;r jsonb;f public.faturas_contrato;t uuid;u uuid;
begin
 u:=private.exigir_financeiro(p_oficina);perform private.gerencia_planejamento(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended('contrato:'||p_contrato,0));
 select * into c from public.contratos_preventivos where oficina_id=p_oficina and id=p_contrato;
 if not found then raise exception 'Contrato indisponível.' using errcode='42501';end if;
 select * into f from public.faturas_contrato where contrato_id=c.id and competencia=p_mes;
 if found then return f.resumo||jsonb_build_object('fechada',true,'titulo_id',f.titulo_id);end if;
 r:=private.previa_fatura_contrato(c,p_mes);
 if p_confirmar then
 if (p_mes+interval '1 month')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Feche a competência após o último dia do mês.' using errcode='22023';end if;
 if (r->>'total')::bigint>0 then
 t:=gen_random_uuid();perform public.salvar_titulo_financeiro(p_oficina,t,jsonb_build_object('natureza','receber','descricao','Contrato: '||c.nome||' · '||to_char(p_mes,'MM/YYYY'),'categoria','servicos','valor_centavos',r->'total','competencia',p_mes,'vencimento',r->>'vencimento','pessoa',(select nome from public.clientes where id=c.cliente_id),'observacoes','Mensalidade proporcional à vigência; franquias integrais no mês. Excedentes e participação conforme demonstrativo do contrato.'),null);
 end if;
 insert into public.faturas_contrato values(c.id,p_mes,r,t,now(),u);
 return r||jsonb_build_object('fechada',true,'titulo_id',t);
 end if;return r||jsonb_build_object('fechada',false);
end $$;

create function public.encerrar_contrato(p_oficina uuid,p_contrato uuid,p_revisao integer,p_data date) returns void language plpgsql security definer set search_path='' as $$
declare c public.contratos_preventivos;
begin
 perform private.exigir_financeiro(p_oficina);perform private.gerencia_planejamento(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended('contrato:'||p_contrato,0));
 select * into c from public.contratos_preventivos where oficina_id=p_oficina and id=p_contrato;
 if not found then raise exception 'Contrato indisponível.' using errcode='42501';end if;
 if c.revisao is distinct from p_revisao then raise exception 'Contrato alterado. Atualize a página.' using errcode='PT409';end if;
 if p_data is null or p_data<c.inicio or exists(select 1 from public.consumos_contrato where contrato_id=c.id and data>p_data and not cancelado) or exists(select 1 from public.faturas_contrato where contrato_id=c.id and competencia>=date_trunc('month',p_data)::date) then raise exception 'Há consumos ou fechamento afetados por essa data. Escolha uma data posterior.' using errcode='22023';end if;
 update public.contratos_preventivos set encerrado_em=p_data,revisao=revisao+1 where id=c.id;
end $$;

create function public.consultar_contratos(p_oficina uuid,p_busca text default '',p_pagina integer default 0,p_contrato uuid default null,p_mes date default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratos_preventivos;r jsonb;
begin
 perform private.exigir_financeiro(p_oficina);perform private.gerencia_planejamento(p_oficina);
 if p_contrato is not null then
 select * into c from public.contratos_preventivos where oficina_id=p_oficina and id=p_contrato;
 if not found then raise exception 'Contrato indisponível.' using errcode='42501';end if;
 if p_mes is null or extract(day from p_mes)<>1 then raise exception 'Selecione a competência.' using errcode='22023';end if;
 return jsonb_build_object('contrato',to_jsonb(c),'versoes',(select coalesce(jsonb_agg(to_jsonb(v) order by desde desc),'[]') from public.versoes_contrato v where contrato_id=c.id),'consumos',(select coalesce(jsonb_agg(to_jsonb(x) order by data desc,id),'[]') from (select * from public.consumos_contrato where contrato_id=c.id and data>=p_mes and data<p_mes+interval '1 month' order by data desc,id limit 200 offset greatest(0,least(p_pagina,100000))*200)x),'total_consumos',(select count(*) from public.consumos_contrato where contrato_id=c.id and data>=p_mes and data<p_mes+interval '1 month'),'fatura',(select to_jsonb(f) from public.faturas_contrato f where contrato_id=c.id and competencia=p_mes));
 end if;
 select jsonb_build_object('itens',coalesce(jsonb_agg(to_jsonb(x)),'[]')) into r from (select k.*,cl.nome cliente,(select regras from public.versoes_contrato where contrato_id=k.id order by desde desc limit 1) regras from public.contratos_preventivos k join public.clientes cl on cl.id=k.cliente_id where k.oficina_id=p_oficina and (k.nome||' '||cl.nome) ilike '%'||left(p_busca,100)||'%' order by k.nome,k.id limit 30 offset greatest(0,least(p_pagina,100000))*30)x;
 return r||jsonb_build_object('total',(select count(*) from public.contratos_preventivos k join public.clientes cl on cl.id=k.cliente_id where k.oficina_id=p_oficina and (k.nome||' '||cl.nome) ilike '%'||left(p_busca,100)||'%'));
end $$;
revoke all on function private.regras_contrato(jsonb),private.previa_fatura_contrato(public.contratos_preventivos,date) from public,anon,authenticated;
revoke all on function public.salvar_contrato_preventivo(uuid,uuid,jsonb,integer),public.registrar_consumo_contrato(uuid,uuid,uuid,jsonb,boolean),public.faturar_contrato(uuid,uuid,date,boolean),public.encerrar_contrato(uuid,uuid,integer,date),public.consultar_contratos(uuid,text,integer,uuid,date) from public,anon;
grant execute on function public.salvar_contrato_preventivo(uuid,uuid,jsonb,integer),public.registrar_consumo_contrato(uuid,uuid,uuid,jsonb,boolean),public.faturar_contrato(uuid,uuid,date,boolean),public.encerrar_contrato(uuid,uuid,integer,date),public.consultar_contratos(uuid,text,integer,uuid,date) to authenticated;
