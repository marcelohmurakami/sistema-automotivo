import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { criarBancoLocal } from './banco-local.mjs'
import { tabelas, colunas, operacoes, parametros, mensagens, traduzirSql } from './nomes-portugues.mjs'

const db = await criarBancoLocal()
const escapar = texto => "'" + texto.replaceAll("'","''") + "'"
try {
  const objetos = (await db.query(`select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','v') order by c.relname`)).rows
  const campos = (await db.query(`select table_name,column_name,data_type,is_nullable from information_schema.columns
    where table_schema='public' order by table_name,ordinal_position`)).rows
  const funcoes = (await db.query(`select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as argumentos,
    pg_get_functiondef(p.oid) as definicao from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('private','public') order by n.nspname,p.proname`)).rows
  const sql = ['-- Tradução dos nomes da aplicação. Preserva dados, IDs, documentos, códigos e permissões.',
    '-- Gerada por supabase/tests/gerar-migracao-portugues.mjs. Não editar migrações já aplicadas.',
    'begin;', "set local lock_timeout = '10s';"]
  const guia = ['# Dicionário do banco em português', '',
    'Os nomes atuais das tabelas, colunas, mapa da oficina e operações públicas estão em português, sem acentos nos identificadores SQL.',
    'As migrações 1 a 4 registram a versão original. A migração 5 renomeia a estrutura sem recriar tabelas ou apagar registros.', '',
    'Os códigos armazenados (por exemplo, `approved`), chaves de documentos JSON já emitidos, nomes de eventos de integração e o recipiente `workshop-files` são contratos técnicos preservados. As descrições e a apresentação ao usuário devem ser em português. Os esquemas `auth` e `storage`, as funções internas e os nomes de índices e restrições pertencem à implementação técnica.', '',
    '## Tabelas e campos', '']
  for (const objeto of objetos) {
    const antigo = objeto.relname, novo = tabelas[antigo]
    assert.ok(novo, `Tradução ausente para ${antigo}`)
    const tipo = objeto.relkind === 'v' ? 'view' : 'table'
    sql.push(`alter ${tipo} public.${antigo} rename to ${novo};`)
    const usados = new Set()
    guia.push(`### ${novo}`, '', `Nome anterior: \`${antigo}\`.${tipo==='view' ? ' Consulta do mapa; respeita as permissões de cada oficina.' : ''}`, '', '| Campo em português | Nome anterior | Tipo | Obrigatório |', '| --- | --- | --- | --- |')
    for (const campo of campos.filter(c => c.table_name === antigo)) {
      const traduzido = colunas[campo.column_name]
      assert.ok(traduzido, `Tradução ausente para ${antigo}.${campo.column_name}`)
      assert.ok(!usados.has(traduzido), `Colisão de coluna em ${novo}.${traduzido}`)
      usados.add(traduzido)
      if (traduzido !== campo.column_name) sql.push(`alter ${tipo} public.${novo} rename column ${campo.column_name} to ${traduzido};`)
      sql.push(`comment on column public.${novo}.${traduzido} is ${escapar(traduzido.replaceAll('_',' ') + '. Nome anterior: ' + campo.column_name + '.')};`)
      guia.push(`| ${traduzido} | ${campo.column_name} | ${campo.data_type} | ${campo.is_nullable === 'NO' ? 'Sim' : 'Não'} |`)
    }
    sql.push(`comment on ${tipo} public.${novo} is ${escapar(novo.replaceAll('_',' ') + '. Nome anterior: ' + antigo + '.')};`)
    guia.push('')
  }
  sql.push('-- Recompõe os corpos SQL/PLpgSQL; ALTER TABLE não reescreve referências textuais de funções.')
  for (const funcao of funcoes) {
    const publica = funcao.nspname === 'public'
    const mapa = {...tabelas,...colunas,...operacoes,...(publica ? parametros : {})}
    // Os literais de to_jsonb(record) refletem os nomes físicos das colunas.
    const literais = {...mensagens, ...(funcao.proname==='guard_service_note' ? {
      status:'situacao',updated_at:'atualizado_em',total_cents:'total_centavos',
    } : {})}
    let definicao = traduzirSql(funcao.definicao,mapa,literais)
    assert.ok(!publica || operacoes[funcao.proname], `Operação pública sem tradução: ${funcao.proname}`)
    sql.push(definicao.trimEnd() + ';')
    if (publica) {
      const assinatura = `${operacoes[funcao.proname]}(${traduzirSql(funcao.argumentos,parametros)})`
      sql.push(`revoke all on function public.${assinatura} from public,anon,authenticated;`)
      sql.push(`grant execute on function public.${assinatura} to authenticated,service_role;`)
      if (funcao.proname==='get_published_workshop_site') sql.push(`grant execute on function public.${assinatura} to anon;`)
    }
  }
  sql.push('-- Remove somente as nove assinaturas antigas, sem CASCADE e sem tocar em dados.')
  for (const funcao of funcoes.filter(f => f.nspname==='public')) {
    sql.push(`drop function public.${funcao.proname}(${funcao.argumentos});`)
  }
  sql.push("update public.planos set nome=case codigo when 'basic' then 'Básico' when 'intermediate' then 'Intermediário' when 'complete' then 'Completo' else nome end;",
    "notify pgrst, 'reload schema';", 'commit;', '')
  guia.push('## Operações públicas', '', '| Nome atual | Nome anterior | Parâmetros |', '| --- | --- | --- |')
  for (const f of funcoes.filter(f => f.nspname==='public')) guia.push(`| ${operacoes[f.proname]} | ${f.proname} | ${traduzirSql(f.argumentos,parametros)} |`)
  guia.push('', 'Os parâmetros dessas operações também foram traduzidos. Atualize as chamadas `.rpc()` ao conectar o aplicativo. As permissões de equipe, cliente do portal e visitante permanecem separadas.', '')
  await writeFile(new URL('../migrations/20260928000500_nomes_em_portugues.sql',import.meta.url),sql.join('\n'),'utf8')
  await writeFile(new URL('../../docs/database/dicionario-portugues.md',import.meta.url),guia.join('\n'),'utf8')
  console.log(`Gerados ${objetos.length} objetos (${objetos.filter(o=>o.relkind==='r').length} tabelas), ${campos.length} campos e ${funcoes.filter(f=>f.nspname==='public').length} operações públicas.`)
} finally { await db.close() }
