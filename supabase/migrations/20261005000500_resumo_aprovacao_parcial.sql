begin;
-- A listagem distingue o valor original da autorização efetivamente recebida.
do $$
declare s text; trecho text := 'q.revisao,v.total_centavos,v.numero_versao';
begin
 select pg_get_functiondef('public.listar_orcamentos(uuid,text,text,integer)'::regprocedure) into s;
 if strpos(s,trecho)=0 then raise exception 'Formato inesperado de listar_orcamentos'; end if;
 s:=replace(s,trecho,'q.revisao,v.total_centavos,(select a.total_aprovado_centavos from public.aprovacoes_orcamento a where a.oficina_id=q.oficina_id and a.versao_orcamento_id=v.id and a.decisao=''approved'' limit 1) as total_aprovado_centavos,v.numero_versao');
 execute s;
end $$;
notify pgrst,'reload schema';
commit;
