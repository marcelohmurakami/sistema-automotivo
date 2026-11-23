begin;

-- A tela de Garantia usa apenas as ocorrências. Evita calcular financeiro,
-- custeio de cada OS e estoque para depois descartar esses resultados no cliente.
-- Mantém exatamente os gates e o recorte usados pela consulta de relatórios.
create function public.consultar_ocorrencias_servicos(p_oficina uuid,p_inicio date,p_fim date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.conferir_operacao(p_oficina,'consultar_relatorios_servicos');
  perform private.gerencia_servicos(p_oficina);
  if not private.has_feature(p_oficina,'reports') then
    raise exception 'Relatórios indisponíveis no plano.' using errcode='42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>366 then
    raise exception 'Selecione um período de até 367 dias.' using errcode='22023';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object(
      'titulo',a.titulo,'cliente',c.nome,'cliente_id',c.id,
      'subsetor',a.ficha_especialidade->>'especialidade'
    ) order by q.aberto_em desc),'[]'::jsonb)
    from public.qualidade_atendimento q
    join public.atendimentos_servicos a on a.id=q.atendimento_id
    join public.clientes c on c.id=a.cliente_id
    where q.oficina_id=p_oficina and q.aberto_em between p_inicio and p_fim
  );
end $$;
revoke all on function public.consultar_ocorrencias_servicos(uuid,date,date) from public,anon;
grant execute on function public.consultar_ocorrencias_servicos(uuid,date,date) to authenticated;
comment on function public.consultar_ocorrencias_servicos(uuid,date,date) is
  'Leitura de ocorrências com os mesmos controles dos relatórios, sem calcular financeiro, custeio ou estoque.';
commit;
