-- Carga administrativa solicitada pelo proprietário. Não faz parte das migrações.
-- Pré-requisito: convidar o e-mail pelo Supabase Auth. Nunca inserir senha via SQL.
-- Reaplicável: IDs fixos e ON CONFLICT DO NOTHING preservam alterações posteriores.
begin;
do $$
declare
  v_usuario uuid;
  v_oficina constant uuid := '7d2e8401-b6fc-45b8-9582-e825e7c08681';
  r record;
  v_cliente uuid;
  v_veiculo uuid;
begin
  select id into strict v_usuario from auth.users where lower(email)='marcelomurakami.dev@gmail.com';
  perform pg_advisory_xact_lock(hashtext('patio:oficina-marcelo:carga-inicial'));
  -- Não reivindicar oficina preexistente caso o ID pertença a outro cadastro.
  if exists(select 1 from public.oficinas where id=v_oficina) and not exists(
    select 1 from public.membros_oficina where oficina_id=v_oficina and usuario_id=v_usuario and perfil='owner' and ativo
  ) then raise exception 'A oficina deste seed já existe com outro vínculo. Revise antes de continuar.'; end if;
  insert into public.oficinas(id,nome) values(v_oficina,'Oficina do Marcelo') on conflict(id) do nothing;
  insert into public.membros_oficina(oficina_id,usuario_id,perfil) values(v_oficina,v_usuario,'owner') on conflict(oficina_id,usuario_id) do nothing;
  -- O gatilho da oficina configura o Básico e as cinco etapas. Não altera planos existentes.
  for r in select * from (values
    (1,'[Exemplo] Ana Silva','pessoa_fisica','ana.exemplo@example.com','Volkswagen','Gol',2018),
    (2,'[Exemplo] Bruno Oliveira','pessoa_fisica','bruno.exemplo@example.com','Chevrolet','Onix',2020),
    (3,'[Exemplo] Carla Santos','pessoa_fisica','carla.exemplo@example.com','Fiat','Argo',2021),
    (4,'[Exemplo] Diego Ferreira','pessoa_fisica','diego.exemplo@example.com','Hyundai','HB20',2019),
    (5,'[Exemplo] Elisa Costa','pessoa_fisica','elisa.exemplo@example.com','Toyota','Corolla',2022),
    (6,'[Exemplo] Felipe Martins','pessoa_fisica','felipe.exemplo@example.com','Honda','Fit',2017),
    (7,'[Exemplo] Entregas Franca','pessoa_juridica','entregas.exemplo@example.com','Fiat','Fiorino',2023),
    (8,'[Exemplo] Comércio Horizonte','pessoa_juridica','comercio.exemplo@example.com','Renault','Kangoo',2020)
  ) as d(numero,nome,tipo,email,marca,modelo,ano) loop
    v_cliente:=('70ca0000-0000-4000-8000-'||lpad(r.numero::text,12,'0'))::uuid;
    v_veiculo:=('70ca0000-0000-4000-8001-'||lpad(r.numero::text,12,'0'))::uuid;
    insert into public.clientes(id,oficina_id,nome,tipo,email,observacoes)
      values(v_cliente,v_oficina,r.nome,r.tipo,r.email,'Dado fictício da carga inicial. Pode ser editado ou movido para a lixeira; não enviar mensagens.')
      on conflict(id) do nothing;
    insert into public.veiculos(id,oficina_id,marca,modelo,ano_modelo,origem)
      values(v_veiculo,v_oficina,r.marca,r.modelo,r.ano,'manual') on conflict(id) do nothing;
    insert into public.clientes_veiculos(oficina_id,cliente_id,veiculo_id,vinculo)
      values(v_oficina,v_cliente,v_veiculo,case when r.tipo='pessoa_juridica' then 'fleet' else 'owner' end)
      on conflict(oficina_id,cliente_id,veiculo_id) do nothing;
  end loop;
  for r in select * from (values
    (1,'service','[Exemplo] Troca de óleo — mão de obra','serv',6000),
    (2,'service','[Exemplo] Alinhamento da direção','serv',10000),
    (3,'service','[Exemplo] Balanceamento de roda','un',3000),
    (4,'service','[Exemplo] Diagnóstico com scanner','serv',12000),
    (5,'service','[Exemplo] Revisão preventiva','serv',25000),
    (6,'service','[Exemplo] Troca de pastilhas — mão de obra','serv',14000),
    (7,'part','[Exemplo] Óleo de motor 5W30','litro',4500),
    (8,'part','[Exemplo] Filtro de óleo','un',3500),
    (9,'part','[Exemplo] Filtro de ar','un',5500),
    (10,'part','[Exemplo] Jogo de pastilhas de freio','jogo',18000),
    (11,'part','[Exemplo] Fluido de freio DOT 4','un',4000),
    (12,'part','[Exemplo] Palheta do limpador','par',7000)
  ) as d(numero,tipo,descricao,unidade,preco) loop
    insert into public.itens_catalogo(id,oficina_id,tipo,descricao,unidade,preco_padrao_centavos,favorito)
      values(('70ca0000-0000-4000-8002-'||lpad(r.numero::text,12,'0'))::uuid,v_oficina,r.tipo,r.descricao,r.unidade,r.preco,r.numero<=4)
      on conflict(id) do nothing;
  end loop;
end $$;
commit;
select o.id,o.nome,m.usuario_id,m.perfil,s.codigo_plano,s.situacao,
  (select count(*) from public.clientes where oficina_id=o.id) as clientes,
  (select count(*) from public.veiculos where oficina_id=o.id) as veiculos,
  (select count(*) from public.itens_catalogo where oficina_id=o.id) as itens_catalogo,
  (select count(*) from public.etapas_producao where oficina_id=o.id) as etapas
from public.oficinas o join public.membros_oficina m on m.oficina_id=o.id
join public.assinaturas_oficina s on s.oficina_id=o.id
where o.id='7d2e8401-b6fc-45b8-9582-e825e7c08681';
