-- Empresas criadas pelo formulário e autorizadas pelo usuário em 08/10/2026.
-- Somente dados fictícios. IDs fixos: reexecutar não duplica nem redefine registros editados.
-- Habilita o plano intermediário exclusivamente nestas empresas de teste, sem checkout/provedor.
begin;
do $$
declare
 alvo record; w uuid; dono uuid:='1138bc6f-f05b-4b29-979a-b7e8d2ac6f16';
 base date:=date '2026-10-08'; i integer; c uuid; obj uuid; equipe uuid; atendimento uuid; titulo uuid; venc date; estado text; valor bigint; descricao text; g jsonb;
 clientes uuid[]; objetos uuid[]; atendimentos uuid[]; recursos uuid[];
begin
 for alvo in select * from (values
  ('e25d59bc-c20c-4aa1-bd57-c1b1d77aa0f2'::uuid,'assistencia_tecnica','ZZ [TESTE MULTIRRAMOS] Assistência técnica'),
  ('5218bdd8-0191-4f42-9d01-5db4fb3fe3ea'::uuid,'manutencao_campo','ZZ [TESTE MULTIRRAMOS] Manutenção de campo'),
  ('5fb21ca1-a81f-4898-a00b-eb30be57f964'::uuid,'limpeza','ZZ [TESTE MULTIRRAMOS] Limpeza')
 ) as x(id,ramo,nome) loop
  w:=alvo.id;
  if not exists(select 1 from public.oficinas o join public.membros_oficina m on m.oficina_id=o.id where o.id=w and o.ramo=alvo.ramo and o.nome=alvo.nome and m.usuario_id=dono and m.perfil='owner' and m.ativo) then raise exception 'Empresa de teste/proprietário divergente';end if;
  perform set_config('request.jwt.claim.sub',dono::text,true);
  update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id=w and codigo_plano='basic';
  perform private.exigir_financeiro(w);
  clientes:='{}';objetos:='{}';atendimentos:='{}';recursos:='{}';
  for i in 1..12 loop
   select id into c from public.clientes where oficina_id=w and nome='[TESTE] Cliente '||lpad(i::text,2,'0') limit 1;
   if c is null then c:=(public.salvar_cliente(w,jsonb_build_object('nome','[TESTE] Cliente '||lpad(i::text,2,'0'),'tipo',case when i%3=0 then 'pessoa_juridica' else 'pessoa_fisica' end,'endereco','Endereço fictício '||i,'observacoes','Dados fictícios para homologação multirramos. Sem contato real.'))->>'id')::uuid;end if;
   clientes:=array_append(clientes,c);obj:=md5(w||':objeto:'||i)::uuid;
   perform public.salvar_objeto_atendimento(w,obj,jsonb_build_object('cliente_id',c,'nome',case alvo.ramo when 'assistencia_tecnica' then '[TESTE] Notebook ' when 'manutencao_campo' then '[TESTE] Instalação ' else '[TESTE] Imóvel ' end||lpad(i::text,2,'0'),'dados',case when alvo.ramo='assistencia_tecnica' then jsonb_build_object('marca','Marca fictícia','modelo','Modelo de teste '||i,'serie','TESTE-'||i,'acessorios','Fonte e cabo','condicao','Inspeção inicial de exemplo') else jsonb_build_object('endereco','Rua fictícia, nº '||i,'area',(60+i*20)::text,'ambientes','Recepção, sala e cozinha','equipamento','Instalação de teste','contato','Responsável fictício','acesso','Confirmar chegada com responsável') end,'arquivado',false));
   objetos:=array_append(objetos,obj);
  end loop;
  for i in 1..3 loop
   equipe:=md5(w||':equipe:'||i)::uuid;
   perform public.salvar_recurso_agenda(w,equipe,case when alvo.ramo='limpeza' then '[TESTE] Equipe ' else '[TESTE] Técnico ' end||i,true);
   recursos:=array_append(recursos,equipe);
  end loop;
  for i in 1..24 loop
   atendimento:=md5(w||':atendimento:'||i)::uuid;
   estado:=case when i<=3 then 'orcamento' when i<=7 then 'aprovado' when i<=12 then 'em_execucao' when i<=18 then 'aguardando' when i<=22 then 'concluido' else 'cancelado' end;
   venc:=base+case i when 1 then -30 when 2 then -10 when 3 then -5 when 4 then -1 when 5 then 0 when 6 then 1 when 7 then 5 else i end;
   valor:=12000+i*3500;
   descricao:='[TESTE] '||case alvo.ramo when 'assistencia_tecnica' then (array['Diagnóstico e reparo','Troca de componente','Revisão preventiva'])[1+(i-1)%3] when 'manutencao_campo' then (array['Manutenção preventiva','Inspeção técnica','Reparo em campo'])[1+(i-1)%3] else (array['Limpeza residencial','Limpeza pós-obra','Limpeza comercial'])[1+(i-1)%3] end||' '||lpad(i::text,2,'0');
   perform public.salvar_atendimento_servico(w,atendimento,jsonb_build_object('cliente_id',clientes[1+(i-1)%12],'objeto_id',objetos[1+(i-1)%12],'titulo',descricao,'situacao',estado,'valor_centavos',valor,'vencimento',venc,'dados',jsonb_build_object('solicitacao','Solicitação fictícia para testar o fluxo completo.','diagnostico','Diagnóstico de exemplo.','execucao',case when estado='concluido' then 'Serviço fictício concluído e conferido.' else '' end,'materiais','Materiais demonstrativos; não representam consumo real.','checklist',E'Conferir entrada\nExecutar serviço\nConferir resultado','conferencia',case when estado='concluido' then 'Conferência de exemplo' else '' end)));
   atendimentos:=array_append(atendimentos,atendimento);
   if i between 4 and 22 then
    titulo:=public.faturar_atendimento_servico(w,atendimento);
    if i%4=0 or i in (21,22) then
     perform public.baixar_titulo_financeiro(w,titulo,md5(w||':recebimento:'||i)::uuid,case when i in (21,22) then valor else valor/2 end,0,base,'caixa','dinheiro','[TESTE] Recebimento fictício. Nenhuma transação externa.');
    end if;
   end if;
  end loop;
  -- Agenda para 30 dias: 08/10 a 06/11, mais segundos horários e uma série semanal.
  for i in 0..41 loop
   g:=jsonb_build_object('atendimento_id',atendimentos[4+i%15],'recurso_id',recursos[1+i%3],
    'inicio',((base+case when i<30 then i else i-30 end)::text||case when i<30 then ' 09:00:00-03' else ' 14:00:00-03' end)::timestamptz,
    'fim',((base+case when i<30 then i else i-30 end)::text||case when i<30 then ' 11:00:00-03' else ' 15:30:00-03' end)::timestamptz,
    'situacao',case when i%3=0 then 'confirmado' else 'agendado' end,'observacoes','[TESTE] Agendamento fictício.');
   perform public.salvar_agenda_servico(w,md5(w||':agenda:'||i)::uuid,g);
  end loop;
  g:=jsonb_build_object('atendimento_id',atendimentos[7],'recurso_id',recursos[1],'inicio',base::text||' 16:00:00-03','fim',base::text||' 17:00:00-03','situacao','agendado','observacoes','[TESTE] Série semanal de quatro visitas.');
  perform public.agendar_serie_servico(w,md5(w||':serie')::uuid,g,4,7);
  for i in 1..3 loop
   perform public.salvar_agenda_servico(w,md5(w||':agenda-atrasada:'||i)::uuid,jsonb_build_object('atendimento_id',atendimentos[3+i],'recurso_id',recursos[i],'inicio',(base-i)::text||' 10:00:00-03','fim',(base-i)::text||' 11:00:00-03','situacao','agendado','observacoes','[TESTE] Visita passada pendente para testar alerta.'));
  end loop;
  for i in 1..12 loop
   titulo:=md5(w||':despesa:'||i)::uuid;
   perform public.salvar_titulo_financeiro(w,titulo,jsonb_build_object('natureza','pagar','descricao','[TESTE] '||(array['Materiais','Terceirizados','Transporte','Aluguel'])[1+(i-1)%4]||' '||i,'categoria',(array['pecas_externas','terceiros','outras_despesas','aluguel'])[1+(i-1)%4],'valor_centavos',6000+i*1250,'competencia',base,'vencimento',base+case i when 1 then -30 when 2 then -10 when 3 then -5 when 4 then -1 when 5 then 0 when 6 then 1 when 7 then 5 else i*2 end,'pessoa','Fornecedor fictício','observacoes','[TESTE] Despesa fictícia.'));
   if i in (8,12) then perform public.baixar_titulo_financeiro(w,titulo,md5(w||':pagamento:'||i)::uuid,6000+i*1250,0,base,'caixa','dinheiro','[TESTE] Pagamento fictício.');end if;
  end loop;
  for i in 1..3 loop
   titulo:=md5(w||':recorrencia:'||i)::uuid;
   if not exists(select 1 from public.contas_recorrentes where id=titulo) then
    perform public.salvar_conta_recorrente(w,titulo,jsonb_build_object('descricao','[TESTE] '||(array['Água e energia mensal','Impostos mensais','Pagamento mensal da equipe'])[i],'natureza','pagar','categoria',(array['agua_luz','impostos','pessoal'])[i],'valor_centavos',(array[35000,90000,300000])[i],'dia',(array[10,20,5])[i],'inicio',base,'fim',date '2026-11-06','ativa',true),0);
   end if;
  end loop;
 end loop;
end $$;
commit;
select o.nome,o.ramo,
 (select count(*) from public.clientes where oficina_id=o.id) clientes,
 (select count(*) from public.objetos_atendimento where oficina_id=o.id) cadastros,
 (select count(*) from public.atendimentos_servicos where oficina_id=o.id) atendimentos,
 (select count(*) from public.recursos_agenda where oficina_id=o.id) equipes,
 (select count(*) from public.agenda_servicos where oficina_id=o.id) agendamentos,
 (select count(*) from public.titulos_financeiros where oficina_id=o.id) contas,
 (select count(*) from public.baixas_financeiras where oficina_id=o.id) baixas,
 (select count(*) from public.contas_recorrentes where oficina_id=o.id) recorrencias
from public.oficinas o where id in ('e25d59bc-c20c-4aa1-bd57-c1b1d77aa0f2','5218bdd8-0191-4f42-9d01-5db4fb3fe3ea','5fb21ca1-a81f-4898-a00b-eb30be57f964') order by ramo;
