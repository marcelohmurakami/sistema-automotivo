import { readFile, writeFile } from 'node:fs/promises';
const origem = await readFile('supabase/migrations/20261001000700_cobranca_provedor.sql', 'utf8');
const nomes = ['consultar_cobranca','reservar_operacao_cobranca','vincular_cliente_cobranca','liberar_operacao_cobranca','aplicar_assinatura_provedor'];
const assinaturas = ['uuid','uuid,uuid,text','uuid,uuid,text','uuid,uuid','uuid,uuid,text,text,text,text,text,text,timestamptz,boolean'];
let sql = `begin;
alter table public.contas_cobranca add column ambiente text not null default 'teste' check(ambiente in ('teste','producao'));
alter table public.contas_cobranca drop constraint contas_cobranca_pkey;
alter table public.contas_cobranca add primary key(oficina_id,ambiente);
alter table public.eventos_cobranca_provedor add column ambiente text not null default 'teste' check(ambiente in ('teste','producao'));
`;
for (let i=0;i<nomes.length;i++) {
  const nome=nomes[i];
  let func=origem.match(new RegExp(`create function public\\.${nome}\\([\\s\\S]*?end \\$\\$;|create function public\\.${nome}\\([\\s\\S]*?\\$\\$;`))?.[0];
  // A função SQL de liberação não possui END.
  if(nome==='liberar_operacao_cobranca') func=origem.slice(origem.indexOf(`create function public.${nome}`)).split('$$;')[0]+'$$;';
  if(!func) throw Error(nome);
  func=func.replace(/\)\s*returns/,",p_ambiente text default 'teste')\nreturns");
  func=func.replaceAll('where oficina_id=p_oficina','where oficina_id=p_oficina and ambiente=p_ambiente');
  func=func.replace("begin\n", "begin\n  if p_ambiente not in ('teste','producao') or p_ambiente is null then raise exception 'Ambiente inválido' using errcode='22023'; end if;\n");
  // Assinaturas/oficinas não são tabelas particionadas por ambiente.
  func=func.replaceAll("public.assinaturas_oficina where oficina_id=p_oficina and ambiente=p_ambiente", "public.assinaturas_oficina where oficina_id=p_oficina");
  func=func.replaceAll("public.membros_oficina where oficina_id=p_oficina and ambiente=p_ambiente", "public.membros_oficina where oficina_id=p_oficina");
  func=func.replace("coalesce(provedor_cobranca,'') not in ('','homologacao','stripe_test')", "(coalesce(provedor_cobranca,'') not in ('','homologacao','stripe_test','stripe') or (p_ambiente='teste' and provedor_cobranca='stripe'))");
  func=func.replace('insert into public.contas_cobranca(oficina_id) values(p_oficina)', 'insert into public.contas_cobranca(oficina_id,ambiente) values(p_oficina,p_ambiente)');
  if(nome==='consultar_cobranca') func=func.replace("return jsonb_build_object(","return jsonb_build_object('ambiente',p_ambiente,");
  if(nome==='aplicar_assinatura_provedor') {
    func=func.replace('  select * into v',"  perform 1 from public.assinaturas_oficina where oficina_id=p_oficina for update;\n  select * into v");
    func=func.replace('  select * into v',"  if p_ambiente='teste' and exists(select 1 from public.assinaturas_oficina where oficina_id=p_oficina and provedor_cobranca='stripe') then raise exception 'Assinatura comercial protegida contra eventos de teste' using errcode='42501'; end if;\n  select * into v");
    func=func.replace("provedor_cobranca='stripe_test'", "provedor_cobranca=case when p_ambiente='producao' then 'stripe' else 'stripe_test' end");
    func=func.replace("atualizado_em=now() where oficina_id=p_oficina and ambiente=p_ambiente;\n  if not found", "atualizado_em=now() where oficina_id=p_oficina;\n  if not found");
    func=func.replace('public.oficinas_cobranca_teste set habilitado=false where oficina_id=p_oficina and ambiente=p_ambiente','public.oficinas_cobranca_teste set habilitado=false where oficina_id=p_oficina');
    func=func.replace('codigo_plano,situacao)\n    values', 'codigo_plano,situacao,ambiente)\n    values').replace('p_plano,estado);','p_plano,estado,p_ambiente);');
  }
  sql+=`drop function public.${nome}(${assinaturas[i]});\n${func}\n`;
  sql+=`revoke all on function public.${nome}(${assinaturas[i]},text) from public,anon,authenticated;\ngrant execute on function public.${nome}(${assinaturas[i]},text) to ${i===0?'authenticated':'service_role'};\n`;
}
sql+=`comment on table public.contas_cobranca is 'Contas Stripe isoladas por ambiente. Ativação comercial explícita nas Edge Functions.';
notify pgrst,'reload schema';
commit;
`;
await writeFile('supabase/migrations/20261015000100_cobranca_producao.sql',sql);
