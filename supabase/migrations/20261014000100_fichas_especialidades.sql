begin;
-- Fichas internas: consultas públicas continuam usando listas explícitas de campos.
alter table public.ordens_servico add column ficha_especialidade jsonb;
alter table public.versoes_orcamento add column ficha_especialidade jsonb;
alter table public.atendimentos_servicos add column ficha_especialidade jsonb;
create function private.perfis_atendimento() returns jsonb language sql immutable set search_path='' as $perfil$ select $dados${"mecanica":{"campos":{"natureza":{"tipo":"opcao","opcoes":["Preventivo","Corretivo","Diagnóstico"]},"sintoma":{"tipo":"area"},"sistema":{"tipo":"texto"},"testes_entrada":{"tipo":"area"},"reparo":{"tipo":"area"},"testes_saida":{"tipo":"area"},"proxima_data":{"tipo":"data"},"proxima_km":{"tipo":"numero"}},"checklist":["Sintoma e condição de uso registrados","Inspeção inicial realizada","Reparo autorizado pelo cliente","Teste final do sistema realizado","Orientações de manutenção entregues"],"etapas":["Diagnóstico","Reparo","Teste de funcionamento","Conferência para entrega"]},"retifica":{"campos":{"identificacao":{"tipo":"texto"},"aplicacao":{"tipo":"texto"},"componentes":{"tipo":"area"},"inspecao":{"tipo":"area"},"medidas_entrada":{"tipo":"area"},"referencia":{"tipo":"area"},"usinagens":{"tipo":"area"},"medidas_saida":{"tipo":"area"},"teste_final":{"tipo":"area"},"pecas_cliente":{"tipo":"texto"}},"checklist":["Peça identificada e componentes conferidos","Inspeção e medições iniciais registradas","Usinagem conferida com a especificação","Medidas finais registradas","Limpeza e proteção para transporte conferidas"],"etapas":["Desmontagem e limpeza","Inspeção e metrologia","Usinagem","Montagem e testes","Conferência e embalagem"]},"autoeletrica":{"campos":{"circuito":{"tipo":"texto"},"sistema_tensao":{"tipo":"opcao","opcoes":["6 V","12 V","24 V","Outro"]},"bateria":{"tipo":"texto"},"codigos":{"tipo":"area"},"medicoes_entrada":{"tipo":"area"},"reparo":{"tipo":"area"},"medicoes_saida":{"tipo":"area"},"consumo_repouso":{"tipo":"area"},"configuracao":{"tipo":"area"}},"checklist":["Bateria e conexões inspecionadas","Defeito e medições iniciais registrados","Circuito reparado e fixações conferidas","Partida / carga ou função reparada testada","Varredura final e orientações registradas"],"etapas":["Testes elétricos","Localização da falha","Reparo / substituição","Teste de carga e funcionamento"]},"autocenter":{"campos":{"pneus":{"tipo":"texto"},"desgaste":{"tipo":"area"},"freios_suspensao":{"tipo":"area"},"geometria_antes":{"tipo":"area"},"geometria_depois":{"tipo":"area"},"pressao":{"tipo":"area"},"rodizio":{"tipo":"texto"},"proxima_data":{"tipo":"data"},"proxima_km":{"tipo":"numero"}},"checklist":["Desgaste e condição dos pneus conferidos","Freios e suspensão inspecionados","Geometria / balanceamento conferidos quando aplicáveis","Torque e pressão conforme aplicação conferidos","Teste final e orientação de retorno realizados"],"etapas":["Inspeção","Peças e reparos","Alinhamento / balanceamento","Teste e conferência"]},"borracharia":{"campos":{"medida":{"tipo":"texto"},"marca_dot":{"tipo":"texto"},"posicao":{"tipo":"opcao","opcoes":["Dianteiro esquerdo","Dianteiro direito","Traseiro esquerdo","Traseiro direito","Estepe","Outras / múltiplas"]},"avaria":{"tipo":"area"},"avaliacao":{"tipo":"opcao","opcoes":["Reparável","Substituição recomendada","Aguardando avaliação"]},"reparo":{"tipo":"texto"},"valvula":{"tipo":"texto"},"pressao":{"tipo":"texto"},"teste_final":{"tipo":"texto"}},"checklist":["Medida e posição identificadas","Dano inspecionado antes do reparo","Válvula e roda conferidas","Estanqueidade testada","Pressão e fixação final conferidas"],"etapas":["Inspeção do pneu","Reparo ou substituição","Estanqueidade e balanceamento","Montagem e calibragem"]},"estetica":{"campos":{"pacote":{"tipo":"texto"},"areas":{"tipo":"area"},"condicao":{"tipo":"area"},"medicao":{"tipo":"area"},"produtos":{"tipo":"area"},"cura":{"tipo":"texto"},"cuidados":{"tipo":"area"},"proxima_data":{"tipo":"data"}},"checklist":["Condição inicial e áreas combinadas registradas","Compatibilidade e teste localizado conferidos","Tratamento executado nas áreas contratadas","Acabamento inspecionado sob iluminação","Cuidados e prazo de cura informados"],"etapas":["Avaliação e lavagem","Descontaminação / preparação","Correção e tratamento","Proteção / cura","Inspeção final"]},"lava_rapido":{"campos":{"pacote":{"tipo":"opcao","opcoes":["Externa","Interna e externa","Completa","Higienização","Personalizado"]},"vaga":{"tipo":"texto"},"avarias":{"tipo":"area"},"adicionais":{"tipo":"area"},"produtos":{"tipo":"texto"},"conferencia":{"tipo":"area"},"orientacoes":{"tipo":"area"}},"checklist":["Pacote e avarias conferidos na entrada","Pertences protegidos","Áreas contratadas lavadas","Secagem e acabamento conferidos","Chaves e pertences devolvidos"],"etapas":["Preparação","Lavagem","Secagem e acabamento","Conferência de saída"]},"troca_oleo":{"campos":{"viscosidade":{"tipo":"texto"},"especificacao":{"tipo":"texto"},"produto":{"tipo":"texto"},"volume":{"tipo":"numero"},"filtros":{"tipo":"area"},"km_atual":{"tipo":"texto"},"conferencia":{"tipo":"texto"},"proxima_data":{"tipo":"data"},"proxima_km":{"tipo":"numero"},"referencia_intervalo":{"tipo":"texto"}},"checklist":["Aplicação e especificação conferidas","Óleo e filtros identificados","Vedação e fechamento conferidos","Nível e ausência de vazamento conferidos","Próxima troca orientada por tempo e quilometragem"],"etapas":["Conferência da aplicação","Troca de óleo e filtros","Nível e vazamentos","Registro da próxima troca"]},"acessorios":{"campos":{"produto":{"tipo":"texto"},"serie":{"tipo":"texto"},"fornecimento":{"tipo":"opcao","opcoes":["Empresa","Cliente"]},"compatibilidade":{"tipo":"area"},"instalacao":{"tipo":"area"},"testes":{"tipo":"area"},"configuracao":{"tipo":"area"},"orientacoes":{"tipo":"area"}},"checklist":["Produto e compatibilidade conferidos","Alterações autorizadas registradas","Fixação e conexões inspecionadas","Funções originais e acessório testados","Cliente orientado sobre o uso"],"etapas":["Compatibilidade e preparação","Instalação","Configuração e testes","Demonstração ao cliente"]},"funilaria":{"campos":{"paineis":{"tipo":"area"},"seguradora":{"tipo":"texto"},"sinistro":{"tipo":"texto"},"autorizacao":{"tipo":"opcao","opcoes":["Aguardando vistoria","Aguardando autorização","Autorizado","Particular"]},"adicionais":{"tipo":"area"},"cor":{"tipo":"texto"},"tinta":{"tipo":"texto"},"preparacao":{"tipo":"area"},"cabine":{"tipo":"texto"},"cura":{"tipo":"texto"},"conferencia":{"tipo":"area"}},"checklist":["Avarias e painéis registrados","Escopo e complementos autorizados","Preparação e cor conferidas","Montagem e funções verificadas","Acabamento e limpeza final conferidos"],"etapas":["Desmontagem e vistoria","Funilaria","Preparação","Pintura e cura","Montagem e acabamento","Conferência final"]},"assistencia_geral":{"campos":{"identificacao":{"tipo":"texto"},"acessorios":{"tipo":"area"},"backup":{"tipo":"opcao","opcoes":["Confirmada pelo cliente","Cliente orientado","Não se aplica"]},"modo_manutencao":{"tipo":"opcao","opcoes":["Ativado pelo cliente","Não disponível","Não se aplica"]},"diagnostico":{"tipo":"area"},"componentes":{"tipo":"area"},"testes":{"tipo":"area"},"orientacoes":{"tipo":"area"},"garantia_data":{"tipo":"data"}},"checklist":["Equipamento e acessórios identificados","Condição e defeito de entrada registrados","Cuidados com os dados combinados","Funções reparadas testadas","Equipamento e acessórios conferidos na devolução"],"etapas":["Triagem","Diagnóstico","Reparo","Testes finais","Disponível para retirada"]},"manutencao_geral":{"campos":{"ativo":{"tipo":"texto"},"natureza":{"tipo":"opcao","opcoes":["Preventiva","Corretiva","Instalação","Inspeção"]},"contato":{"tipo":"texto"},"acesso":{"tipo":"area"},"escopo":{"tipo":"area"},"medicoes_entrada":{"tipo":"area"},"materiais":{"tipo":"area"},"medicoes_saida":{"tipo":"area"},"deslocamento":{"tipo":"numero"},"aceite":{"tipo":"texto"},"proxima_data":{"tipo":"data"}},"checklist":["Acesso e ativo conferidos","Condições de execução verificadas","Serviço e materiais registrados","Funcionamento após manutenção testado","Responsável no local orientado"],"etapas":["Planejamento","Deslocamento","Inspeção no local","Execução","Teste e aceite"]},"limpeza_geral":{"campos":{"area":{"tipo":"numero"},"ambientes":{"tipo":"area"},"superficies":{"tipo":"area"},"frequencia":{"tipo":"opcao","opcoes":["Avulsa","Diária","Semanal","Quinzenal","Mensal","Personalizada"]},"acesso":{"tipo":"texto"},"produtos":{"tipo":"area"},"equipamentos":{"tipo":"area"},"resultado":{"tipo":"area"},"aceite":{"tipo":"texto"},"proxima_data":{"tipo":"data"}},"checklist":["Ambientes e exclusões combinados","Superfícies e compatibilidade dos produtos conferidas","Produtos preparados conforme orientação do fabricante","Ambientes contratados conferidos","Local liberado e responsável orientado"],"etapas":["Preparação do local","Limpeza por ambiente","Acabamento","Inspeção e aceite"]}}$dados$::jsonb $perfil$;

create function private.validar_ficha_especialidade(p_ficha jsonb) returns void
language plpgsql immutable set search_path='' as $f$
declare p jsonb; c jsonb; k text; v jsonb; texto text;
begin
 if p_ficha is null then return; end if;
 if jsonb_typeof(p_ficha) is distinct from 'object' or p_ficha->'versao' is distinct from '1'::jsonb
 or jsonb_typeof(p_ficha->'especialidade') is distinct from 'string'
 or jsonb_typeof(p_ficha->'campos') is distinct from 'object'
 or jsonb_typeof(p_ficha->'checklist') is distinct from 'object'
 or jsonb_typeof(p_ficha->'etapa') is distinct from 'string'
 or octet_length(p_ficha::text)>45000 then raise exception 'Ficha técnica inválida.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p_ficha) chave where chave not in ('versao','especialidade','campos','checklist','etapa')) then raise exception 'Ficha técnica inválida.' using errcode='22023';end if;
 p:=private.perfis_atendimento()->(p_ficha->>'especialidade');
 if p is null then raise exception 'Especialidade inválida.' using errcode='22023';end if;
 for k,v in select * from jsonb_each(p_ficha->'campos') loop
   c:=p->'campos'->k;texto:=v#>>'{}';
   if c is null or jsonb_typeof(v)<>'string' or length(texto)>1500 then raise exception 'Campo técnico inválido.' using errcode='22023';end if;
   if texto='' then continue;end if;
   if c->>'tipo'='numero' and texto !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$' then raise exception 'Medição numérica inválida.' using errcode='22023';end if;
   if c->>'tipo'='data' then
     if texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or left(texto,5)='0000-' then raise exception 'Data técnica inválida.' using errcode='22023';end if;
     begin perform texto::date;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Data técnica inválida.' using errcode='22023';end;
   end if;
   if c ? 'opcoes' and not (c->'opcoes' ? texto) then raise exception 'Opção técnica inválida.' using errcode='22023';end if;
 end loop;
 for k,v in select * from jsonb_each(p_ficha->'checklist') loop
   if not (p->'checklist' ? k) or jsonb_typeof(v)<>'boolean' then raise exception 'Conferência inválida.' using errcode='22023';end if;
 end loop;
 if p_ficha->>'etapa'<>'' and not (p->'etapas' ? (p_ficha->>'etapa')) then raise exception 'Etapa técnica inválida.' using errcode='22023';end if;
end $f$;

create function private.conferir_ficha_especialidade() returns trigger language plpgsql security definer set search_path='' as $f$
declare atual text; anterior text; herdada boolean:=false;
begin
 if new.ficha_especialidade is null then return new;end if;
 perform private.validar_ficha_especialidade(new.ficha_especialidade);
 select especialidade into atual from public.oficinas where id=new.oficina_id;
 if tg_op='UPDATE' then anterior:=old.ficha_especialidade->>'especialidade';end if;
 if tg_table_name='versoes_orcamento' then
   select exists(select 1 from public.versoes_orcamento v where v.oficina_id=new.oficina_id and v.orcamento_id=new.orcamento_id and v.id<>new.id and v.ficha_especialidade->>'especialidade'=new.ficha_especialidade->>'especialidade') into herdada;
 elsif tg_table_name='ordens_servico' then
   select exists(select 1 from public.versoes_orcamento v where v.oficina_id=new.oficina_id and v.id=new.versao_orcamento_origem_id and v.ficha_especialidade->>'especialidade'=new.ficha_especialidade->>'especialidade') into herdada;
 end if;
 if new.ficha_especialidade->>'especialidade' is distinct from atual and new.ficha_especialidade->>'especialidade' is distinct from anterior and not herdada then
   raise exception 'Ficha incompatível com a especialidade da empresa.' using errcode='22023';end if;
 return new;
end $f$;
create trigger z_validar_ficha_especialidade before insert or update on public.ordens_servico for each row execute function private.conferir_ficha_especialidade();
create trigger z_validar_ficha_especialidade before insert or update on public.versoes_orcamento for each row execute function private.conferir_ficha_especialidade();
create trigger z_validar_ficha_especialidade before insert or update on public.atendimentos_servicos for each row execute function private.conferir_ficha_especialidade();

do $m$ declare anterior text; novo text;begin
 novo:=pg_get_functiondef('public.salvar_ordem_servico(uuid,jsonb,uuid,uuid,integer)'::regprocedure);
 anterior:=novo;novo:=replace(novo,$a$detalhes_especialidade=case when$a$,$b$ficha_especialidade=case when p_dados ? 'ficha_especialidade' then nullif(p_dados->'ficha_especialidade','null'::jsonb) else ficha_especialidade end,detalhes_especialidade=case when$b$);if novo=anterior then raise exception 'Contrato incompatível: public.salvar_ordem_servico(uuid,jsonb,uuid,uuid,integer)';end if;
 execute novo;end $m$;

do $m$ declare anterior text; novo text;begin
 novo:=pg_get_functiondef('public.salvar_orcamento(uuid,jsonb,uuid,uuid,integer)'::regprocedure);
 anterior:=novo;novo:=replace(novo,$a$detalhes_especialidade=case when$a$,$b$ficha_especialidade=case when p_dados ? 'ficha_especialidade' then nullif(p_dados->'ficha_especialidade','null'::jsonb) else ficha_especialidade end,detalhes_especialidade=case when$b$);if novo=anterior then raise exception 'Contrato incompatível: public.salvar_orcamento(uuid,jsonb,uuid,uuid,integer)';end if;
 execute novo;end $m$;

do $m$ declare anterior text; novo text;begin
 novo:=pg_get_functiondef('public.revisar_orcamento(uuid,uuid,integer)'::regprocedure);
 anterior:=novo;novo:=replace(novo,$a$detalhes_especialidade=v.detalhes_especialidade$a$,$b$ficha_especialidade=v.ficha_especialidade,detalhes_especialidade=v.detalhes_especialidade$b$);if novo=anterior then raise exception 'Contrato incompatível: public.revisar_orcamento(uuid,uuid,integer)';end if;
 execute novo;end $m$;

do $m$ declare anterior text; novo text;begin
 novo:=pg_get_functiondef('private.importar_tecnico_orcamento_os()'::regprocedure);
 anterior:=novo;novo:=replace(novo,$a$new.tipo_servico:=$a$,$b$new.ficha_especialidade:=coalesce(v.ficha_especialidade,new.ficha_especialidade);
 new.tipo_servico:=$b$);if novo=anterior then raise exception 'Contrato incompatível: private.importar_tecnico_orcamento_os()';end if;
 execute novo;end $m$;

do $m$ declare anterior text; novo text;begin
 novo:=pg_get_functiondef('public.salvar_atendimento_servico(uuid,uuid,jsonb,integer)'::regprocedure);
 anterior:=novo;novo:=replace(novo,$a$titulo,situacao,dados,valor_centavos,vencimento)$a$,$b$titulo,situacao,dados,valor_centavos,vencimento,ficha_especialidade)$b$);if novo=anterior then raise exception 'Contrato incompatível: public.salvar_atendimento_servico(uuid,uuid,jsonb,integer)';end if;
 anterior:=novo;novo:=replace(novo,$a$(p_dados->>'vencimento')::date)$a$,$b$(p_dados->>'vencimento')::date,case when p_dados ? 'ficha_especialidade' then nullif(p_dados->'ficha_especialidade','null'::jsonb) else a.ficha_especialidade end)$b$);if novo=anterior then raise exception 'Contrato incompatível: public.salvar_atendimento_servico(uuid,uuid,jsonb,integer)';end if;
 anterior:=novo;novo:=replace(novo,$a$vencimento=excluded.vencimento,revisao=$a$,$b$vencimento=excluded.vencimento,ficha_especialidade=excluded.ficha_especialidade,revisao=$b$);if novo=anterior then raise exception 'Contrato incompatível: public.salvar_atendimento_servico(uuid,uuid,jsonb,integer)';end if;
 execute novo;end $m$;

do $m$ declare anterior text; novo text;begin
 novo:=pg_get_functiondef('public.consultar_relatorios_gestao(uuid,date,date)'::regprocedure);
 anterior:=novo;novo:=replace(novo,$a$'tipo',w.tipo_servico$a$,$b$'ficha_especialidade',w.ficha_especialidade,'tipo',w.tipo_servico$b$);if novo=anterior then raise exception 'Contrato incompatível: public.consultar_relatorios_gestao(uuid,date,date)';end if;
 execute novo;end $m$;

create function public.modelo_etapas_especialidade(p_oficina uuid,p_os uuid) returns void language plpgsql security definer set search_path='' as $f$
declare w public.ordens_servico; perfil text; nome text;n integer:=0;
begin
 perform private.exigir_os(p_oficina);
 select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
 if not found or w.situacao in ('delivered','cancelled') or w.arquivado_em is not null then raise exception 'OS encerrada ou indisponível.' using errcode='22023';end if;
 if exists(select 1 from public.etapas_execucao_os where oficina_id=p_oficina and ordem_servico_id=p_os) then return;end if;
 select coalesce(w.ficha_especialidade->>'especialidade',especialidade) into perfil from public.oficinas where id=p_oficina;
 for nome in select jsonb_array_elements_text(private.perfis_atendimento()->perfil->'etapas') loop
   perform public.salvar_etapa_execucao(p_oficina,p_os,gen_random_uuid(),jsonb_build_object('nome',nome,'posicao',n));n:=n+1;
 end loop;
 if n=0 then raise exception 'Especialidade indisponível.' using errcode='22023';end if;
end $f$;
revoke all on function private.perfis_atendimento(),private.validar_ficha_especialidade(jsonb),private.conferir_ficha_especialidade() from public,anon,authenticated;
revoke all on function public.modelo_etapas_especialidade(uuid,uuid) from public,anon;
grant execute on function public.modelo_etapas_especialidade(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
