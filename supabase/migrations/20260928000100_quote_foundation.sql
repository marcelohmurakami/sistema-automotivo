-- Migration 1/4: fundacao de oficinas, cadastros, orcamentos e outbox.
-- Modelo completo: docs/database/product-v2.md. Aplicar em banco vazio.
-- Requer auth.users, auth.uid(), roles anon/authenticated/service_role do Supabase.
-- Escritas passam pelo backend: este DDL NAO implementa as RPCs de negocio,
-- workers, Storage, onboarding ou a integracao com o n8n.
begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  timezone text not null default 'America/Sao_Paulo',
  currency text not null default 'BRL' check (currency = 'BRL'),
  next_quote_number bigint not null default 1 check (next_quote_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.workshop_members (
  workshop_id uuid not null references public.workshops(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'manager', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workshop_id, user_id)
);
create index workshop_members_user_idx on public.workshop_members(user_id, workshop_id) where active;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  name text not null check (length(trim(name)) > 0),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workshop_id, id)
);
-- Telefone nao e unico: familiares/frotas podem compartilhar contato.
create index customers_phone_idx on public.customers(workshop_id, phone_e164);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  plate text check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  brand text,
  model text not null check (length(trim(model)) > 0),
  model_year smallint check (model_year between 1886 and 2200),
  source text not null default 'manual' check (source in ('manual', 'import', 'api')),
  source_provider text,
  source_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workshop_id, id),
  unique (workshop_id, plate)
);

create table public.customer_vehicles (
  workshop_id uuid not null references public.workshops(id),
  customer_id uuid not null,
  vehicle_id uuid not null,
  relationship text not null default 'contact' check (relationship in ('owner', 'contact', 'fleet')),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (workshop_id, customer_id, vehicle_id),
  foreign key (workshop_id, customer_id) references public.customers(workshop_id, id),
  foreign key (workshop_id, vehicle_id) references public.vehicles(workshop_id, id)
);
create index customer_vehicles_vehicle_idx on public.customer_vehicles(workshop_id, vehicle_id);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  kind text not null check (kind in ('service', 'part')),
  description text not null check (length(trim(description)) > 0),
  unit text not null default 'un',
  default_unit_price_cents bigint not null default 0 check (default_unit_price_cents >= 0),
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workshop_id, id)
);
create index catalog_items_favorite_idx on public.catalog_items(workshop_id, favorite) where archived_at is null;

create table public.file_assets (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  bucket text not null,
  object_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'deleted')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (bucket, object_path)
);
alter table public.workshops add column logo_asset_id uuid;
alter table public.workshops add constraint workshops_logo_fk
  foreign key (id, logo_asset_id) references public.file_assets(workshop_id, id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  number bigint not null check (number > 0),
  customer_id uuid,
  vehicle_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_approval', 'approved', 'declined', 'expired', 'cancelled')),
  current_version_id uuid,
  lock_version integer not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workshop_id, id),
  unique (workshop_id, number),
  foreign key (workshop_id, customer_id) references public.customers(workshop_id, id),
  foreign key (workshop_id, vehicle_id) references public.vehicles(workshop_id, id)
);
create index quotes_feed_idx on public.quotes(workshop_id, status, created_at desc);
create index quotes_customer_idx on public.quotes(workshop_id, customer_id);
create index quotes_vehicle_idx on public.quotes(workshop_id, vehicle_id);

create table public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  quote_id uuid not null,
  version_number integer not null check (version_number > 0),
  -- JSON so para snapshots pequenos, versionados e validados no backend.
  snapshot_schema_version smallint not null default 1 check (snapshot_schema_version > 0),
  workshop_snapshot jsonb not null default '{}' check (jsonb_typeof(workshop_snapshot) = 'object'),
  customer_snapshot jsonb not null default '{}' check (jsonb_typeof(customer_snapshot) = 'object'),
  vehicle_snapshot jsonb not null default '{}' check (jsonb_typeof(vehicle_snapshot) = 'object'),
  notes text,
  terms text,
  currency text not null default 'BRL' check (currency = 'BRL'),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents between 0 and subtotal_cents),
  total_cents bigint generated always as (subtotal_cents - discount_cents) stored,
  expires_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (workshop_id, quote_id, id),
  unique (workshop_id, quote_id, version_number),
  foreign key (workshop_id, quote_id) references public.quotes(workshop_id, id),
  check (published_at is null or (expires_at is not null and expires_at > published_at))
);
create unique index quote_versions_one_draft_idx on public.quote_versions(workshop_id, quote_id)
  where published_at is null;
alter table public.quotes add constraint quotes_current_version_fk
  foreign key (workshop_id, id, current_version_id)
  references public.quote_versions(workshop_id, quote_id, id);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  quote_version_id uuid not null,
  catalog_item_id uuid,
  position integer not null check (position >= 0),
  kind text not null check (kind in ('service', 'part')),
  description text not null check (length(trim(description)) > 0),
  unit text not null default 'un',
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint generated always as (round(quantity * unit_price_cents)::bigint) stored,
  created_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (workshop_id, quote_version_id, position),
  foreign key (workshop_id, quote_version_id) references public.quote_versions(workshop_id, id),
  foreign key (workshop_id, catalog_item_id) references public.catalog_items(workshop_id, id)
);

create table public.quote_attachments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  quote_version_id uuid not null,
  file_asset_id uuid not null,
  caption text,
  visible_to_customer boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workshop_id, quote_version_id, file_asset_id),
  foreign key (workshop_id, quote_version_id) references public.quote_versions(workshop_id, id),
  foreign key (workshop_id, file_asset_id) references public.file_assets(workshop_id, id)
);

create table public.quote_documents (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  quote_version_id uuid not null,
  file_asset_id uuid not null,
  template_version text not null,
  generated_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (workshop_id, quote_version_id, id),
  foreign key (workshop_id, quote_version_id) references public.quote_versions(workshop_id, id),
  foreign key (workshop_id, file_asset_id) references public.file_assets(workshop_id, id)
);

create table public.quote_access_tokens (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  quote_version_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Referencia opcional a segredo cifrado, para reenvio do MESMO link.
  secret_ref text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workshop_id, quote_version_id, id),
  foreign key (workshop_id, quote_version_id) references public.quote_versions(workshop_id, id),
  check (expires_at > created_at)
);

create table public.quote_approvals (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  quote_version_id uuid not null,
  access_token_id uuid not null,
  decision text not null check (decision in ('approved', 'declined')),
  declared_name text not null check (length(trim(declared_name)) > 0),
  verification_method text not null default 'bearer_link' check (verification_method in ('bearer_link', 'otp')),
  confirmation_text text not null,
  confirmed_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (workshop_id, quote_version_id),
  foreign key (workshop_id, quote_version_id) references public.quote_versions(workshop_id, id),
  foreign key (workshop_id, quote_version_id, access_token_id)
    references public.quote_access_tokens(workshop_id, quote_version_id, id)
);

create table public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  provider text not null,
  provider_account_id text not null,
  provider_phone_id text not null,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  credentials_ref text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'disconnected', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (provider, provider_phone_id)
);

-- Outbox: fato de negocio criado na MESMA transacao que altera o agregado.
create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  event_type text not null,
  schema_version smallint not null default 1 check (schema_version > 0),
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version integer not null check (aggregate_version > 0),
  correlation_id uuid not null default gen_random_uuid(),
  causation_id uuid,
  deduplication_key text not null,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (workshop_id, deduplication_key),
  foreign key (workshop_id, causation_id) references public.domain_events(workshop_id, id)
);
create index domain_events_stream_idx on public.domain_events(workshop_id, occurred_at, id);

create table public.message_jobs (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  quote_version_id uuid not null,
  connection_id uuid not null,
  document_id uuid,
  source_event_id uuid,
  recipient_e164 text not null check (recipient_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  purpose text not null check (purpose in ('quote', 'reminder', 'approval_notification')),
  idempotency_key text not null,
  provider_template_name text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'accepted', 'delivered', 'read', 'retry', 'unknown', 'dead', 'cancelled')),
  provider_message_id text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  locked_until timestamptz,
  last_error_code text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (workshop_id, idempotency_key),
  unique (connection_id, provider_message_id),
  foreign key (workshop_id, quote_version_id) references public.quote_versions(workshop_id, id),
  foreign key (workshop_id, connection_id) references public.whatsapp_connections(workshop_id, id),
  foreign key (workshop_id, quote_version_id, document_id)
    references public.quote_documents(workshop_id, quote_version_id, id),
  foreign key (workshop_id, source_event_id) references public.domain_events(workshop_id, id),
  check ((lease_token is null) = (locked_until is null))
);
create index message_jobs_queue_idx on public.message_jobs(next_attempt_at)
  where status in ('pending', 'retry');
create index message_jobs_expired_lease_idx on public.message_jobs(locked_until) where status = 'processing';

create table public.message_attempts (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  message_job_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text check (result in ('accepted', 'retryable', 'permanent_failure', 'unknown')),
  http_status smallint check (http_status between 100 and 599),
  error_code text,
  unique (workshop_id, message_job_id, attempt_number),
  foreign key (workshop_id, message_job_id) references public.message_jobs(workshop_id, id)
);

-- Inbox do provedor: um callback pode chegar antes de registrar o aceite HTTP.
create table public.message_events (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  connection_id uuid not null,
  message_job_id uuid,
  provider_message_id text not null,
  provider_event_key text not null,
  event_type text not null check (event_type in ('accepted', 'delivered', 'read', 'failed', 'incoming')),
  provider_occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error_code text,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  unique (connection_id, provider_event_key),
  foreign key (workshop_id, connection_id) references public.whatsapp_connections(workshop_id, id),
  foreign key (workshop_id, message_job_id) references public.message_jobs(workshop_id, id)
);
create index message_events_pending_idx on public.message_events(received_at) where processed_at is null;

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  name text not null,
  kind text not null check (kind in ('n8n', 'webhook')),
  endpoint_url text not null check (endpoint_url like 'https://%'),
  credentials_ref text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id)
);

create table public.integration_subscriptions (
  workshop_id uuid not null,
  connection_id uuid not null,
  event_type text not null,
  enabled boolean not null default true,
  subscribed_at timestamptz not null default now(),
  primary key (workshop_id, connection_id, event_type),
  foreign key (workshop_id, connection_id) references public.integration_connections(workshop_id, id)
);

-- Uma entrega por evento/destino: falha de um consumidor nao bloqueia os outros.
create table public.event_deliveries (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  event_id uuid not null,
  connection_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'accepted', 'retry', 'dead', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  locked_until timestamptz,
  last_http_status smallint check (last_http_status between 100 and 599),
  last_error_code text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (event_id, connection_id),
  foreign key (workshop_id, event_id) references public.domain_events(workshop_id, id),
  foreign key (workshop_id, connection_id) references public.integration_connections(workshop_id, id),
  check ((lease_token is null) = (locked_until is null))
);
create index event_deliveries_queue_idx on public.event_deliveries(next_attempt_at)
  where status in ('pending', 'retry');
create index event_deliveries_expired_lease_idx on public.event_deliveries(locked_until) where status = 'processing';

create table public.event_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  delivery_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  http_status smallint check (http_status between 100 and 599),
  error_code text,
  unique (workshop_id, delivery_id, attempt_number),
  foreign key (workshop_id, delivery_id) references public.event_deliveries(workshop_id, id)
);

create table public.integration_api_keys (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  connection_id uuid not null,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (cardinality(scopes) > 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workshop_id, connection_id) references public.integration_connections(workshop_id, id),
  check (expires_at is null or expires_at > created_at)
);

-- n8n pede comandos a API; nunca recebe service_role ou UPDATE irrestrito.
create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  connection_id uuid not null,
  source_event_id uuid,
  workflow_key text not null,
  workflow_version text not null,
  idempotency_key text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  external_execution_id text,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  result_reference jsonb not null default '{}' check (jsonb_typeof(result_reference) = 'object'),
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (connection_id, idempotency_key),
  foreign key (workshop_id, connection_id) references public.integration_connections(workshop_id, id),
  foreign key (workshop_id, source_event_id) references public.domain_events(workshop_id, id)
);

create table public.scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  quote_version_id uuid not null,
  action_type text not null check (action_type in ('quote_reminder', 'quote_expiration')),
  idempotency_key text not null,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'cancelled', 'retry', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  locked_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, idempotency_key),
  foreign key (workshop_id, quote_version_id) references public.quote_versions(workshop_id, id),
  check ((lease_token is null) = (locked_until is null))
);
create index scheduled_actions_due_idx on public.scheduled_actions(due_at, next_attempt_at)
  where status in ('pending', 'retry');
create index scheduled_actions_expired_lease_idx on public.scheduled_actions(locked_until) where status = 'processing';

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  actor_user_id uuid references auth.users(id),
  actor_connection_id uuid,
  actor_type text not null check (actor_type in ('user', 'integration', 'customer_link', 'system')),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  correlation_id uuid not null,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (workshop_id, actor_connection_id) references public.integration_connections(workshop_id, id)
);
create index audit_logs_entity_idx on public.audit_logs(workshop_id, entity_type, entity_id, created_at);

-- Protecoes de conteudo. Nao substituem as RPCs de publicacao/aprovacao.
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

create function private.prevent_published_version_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.published_at is not null then
    raise exception 'Published quote versions are immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger quote_versions_frozen before update or delete on public.quote_versions
for each row execute function private.prevent_published_version_changes();

create function private.guard_version_children() returns trigger
language plpgsql set search_path = '' as $$
declare v_published timestamptz;
begin
  -- Travar a versao serializa edicao de itens/anexos com publicacao.
  if tg_op <> 'INSERT' then
    select published_at into v_published from public.quote_versions
      where workshop_id = old.workshop_id and id = old.quote_version_id for update;
    if v_published is not null then
      raise exception 'Published quote content is immutable' using errcode = '23514';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select published_at into v_published from public.quote_versions
      where workshop_id = new.workshop_id and id = new.quote_version_id for update;
    if v_published is not null then
      raise exception 'Cannot add or change published quote content' using errcode = '23514';
    end if;
    return new;
  end if;
  return old;
end;
$$;
create trigger quote_items_guard before insert or update or delete on public.quote_items
for each row execute function private.guard_version_children();
create trigger quote_attachments_guard before insert or update or delete on public.quote_attachments
for each row execute function private.guard_version_children();

create function private.reject_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Append-only record' using errcode = '23514'; end;
$$;
create trigger quote_approvals_append_only before update or delete on public.quote_approvals
for each row execute function private.reject_mutation();
create trigger domain_events_append_only before update or delete on public.domain_events
for each row execute function private.reject_mutation();
create trigger audit_logs_append_only before update or delete on public.audit_logs
for each row execute function private.reject_mutation();

create function private.is_workshop_member(p_workshop_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workshop_members m
    where m.workshop_id = p_workshop_id and m.user_id = (select auth.uid()) and m.active
  );
$$;
revoke all on function private.is_workshop_member(uuid) from public;
grant execute on function private.is_workshop_member(uuid) to authenticated;

-- Alcance restrito as tabelas deste arquivo; nao altera tabelas preexistentes.
do $$
declare t text;
begin
  foreach t in array array[
    'workshops','workshop_members','customers','vehicles','customer_vehicles','catalog_items',
    'file_assets','quotes','quote_versions','quote_items','quote_attachments','quote_documents',
    'quote_access_tokens','quote_approvals','whatsapp_connections','domain_events','message_jobs',
    'message_attempts','message_events','integration_connections','integration_subscriptions',
    'event_deliveries','event_delivery_attempts','integration_api_keys','automation_runs',
    'scheduled_actions','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;

  foreach t in array array[
    'workshops','workshop_members','customers','vehicles','catalog_items','file_assets','quotes',
    'quote_versions','whatsapp_connections','message_jobs','integration_connections',
    'event_deliveries','scheduled_actions'
  ] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', t);
  end loop;

  -- Leituras operacionais por membros ativos; detalhes de integracao so via backend.
  foreach t in array array[
    'customers','vehicles','customer_vehicles','catalog_items','quotes','quote_versions',
    'quote_items','quote_attachments','quote_documents'
  ] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy tenant_read on public.%I for select to authenticated using (private.is_workshop_member(workshop_id))', t);
  end loop;
end;
$$;
grant select on public.workshops, public.workshop_members to authenticated;
create policy tenant_read on public.workshops for select to authenticated
  using (private.is_workshop_member(id));
create policy tenant_read on public.workshop_members for select to authenticated
  using (private.is_workshop_member(workshop_id));

-- As demais tabelas ficam sem policy de cliente: acesso negado por padrao.
-- service_role e uma credencial exclusiva do backend confiavel, nunca do n8n/browser.
commit;
