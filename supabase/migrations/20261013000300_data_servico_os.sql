begin;
-- As OS antigas mantêm a data já exibida (conclusão ou criação).
alter table public.ordens_servico add column data_servico date;
alter table public.ordens_servico alter column data_servico set default ((now() at time zone 'America/Sao_Paulo')::date);

do $$ declare s text; novo text; begin
 s:=pg_get_functiondef('public.salvar_ordem_servico(uuid,jsonb,uuid,uuid,integer)'::regprocedure);
 novo:=replace(s,'u:=private.exigir_os(p_oficina);',
 $trecho$u:=private.exigir_os(p_oficina);
 if p_dados ? 'data_servico' then
   if coalesce(p_dados->>'data_servico','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
     raise exception 'Informe uma data válida para o serviço.' using errcode='22023';
   end if;
   begin perform (p_dados->>'data_servico')::date;
   exception when invalid_datetime_format or datetime_field_overflow then
     raise exception 'Informe uma data válida para o serviço.' using errcode='22023';
   end;
 end if;$trecho$);
 if novo=s then raise exception 'Validação da OS incompatível';end if;
 s:=novo;
 novo:=replace(s,'update public.ordens_servico set forma_pagamento=',
 'update public.ordens_servico set data_servico=case when p_dados ? ''data_servico'' then (p_dados->>''data_servico'')::date else data_servico end,forma_pagamento=');
 if novo=s then raise exception 'Gravação da OS incompatível';end if;
 execute novo;
end $$;
notify pgrst,'reload schema';
commit;
