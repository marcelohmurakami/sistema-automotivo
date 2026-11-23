begin;

-- A data conferida no assistente deve acompanhar a versão do orçamento e sua OS.
-- Propostas antigas continuam sem data informada; não presumimos datas históricas.
alter table public.versoes_orcamento add column data_servico date;

do $migration$
declare codigo text; alterado text;
begin
 codigo:=pg_get_functiondef('private.salvar_orcamento_base(uuid,jsonb,uuid,uuid,integer)'::regprocedure);
 alterado:=replace(codigo,
  'c:=private.cliente_atendimento(p_oficina,p_dados);',
  $patch$if p_dados ? 'data_servico' and p_dados->>'data_servico' is not null then
   if p_dados->>'data_servico' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Informe uma data do serviço válida.' using errcode='22023';end if;
   begin perform (p_dados->>'data_servico')::date;
   exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Informe uma data do serviço válida.' using errcode='22023';end;
  end if;
  c:=private.cliente_atendimento(p_oficina,p_dados);$patch$);
 if alterado=codigo then raise exception 'Validação do orçamento não localizada.';end if;
 codigo:=alterado;
 alterado:=replace(codigo,'observacoes=coalesce(p_dados->>''observacoes'',''''),condicoes=',
  'data_servico=case when p_dados ? ''data_servico'' then (p_dados->>''data_servico'')::date else v.data_servico end,observacoes=coalesce(p_dados->>''observacoes'',''''),condicoes=');
 if alterado=codigo then raise exception 'Gravação do orçamento não localizada.';end if;
 execute alterado;

 codigo:=pg_get_functiondef('public.revisar_orcamento(uuid,uuid,integer)'::regprocedure);
 alterado:=replace(codigo,'set forma_pagamento=v.forma_pagamento','set data_servico=v.data_servico,forma_pagamento=v.forma_pagamento');
 if alterado=codigo then raise exception 'Cópia da versão do orçamento não localizada.';end if;
 execute alterado;

 codigo:=pg_get_functiondef('private.importar_tecnico_orcamento_os()'::regprocedure);
 alterado:=replace(codigo,'new.forma_pagamento:=v.forma_pagamento;',
  'new.data_servico:=coalesce(v.data_servico,new.data_servico); new.forma_pagamento:=v.forma_pagamento;');
 if alterado=codigo then raise exception 'Importação da data na OS não localizada.';end if;
 execute alterado;

 codigo:=pg_get_functiondef('public.consultar_orcamento_publico(text)'::regprocedure);
 alterado:=replace(codigo,'''numero_versao'',v.numero_versao,',
  '''data_servico'',v.data_servico,''numero_versao'',v.numero_versao,');
 if alterado=codigo then raise exception 'Resumo público do orçamento não localizado.';end if;
 execute alterado;
end $migration$;

commit;
