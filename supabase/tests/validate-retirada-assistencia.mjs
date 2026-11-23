import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarBancoLocal } from './banco-local.mjs';
import { perfisAtendimento, novaFichaEspecialidade } from '../../src/lib/perfisAtendimento.ts';
import { subsetoresDoRamo } from '../../src/lib/operacaoServicos.ts';
import { concluirReparo, registrarRetirada } from '../../src/lib/assistenciaTecnica.ts';
let db;
try {
  db=await criarBancoLocal('20261015000600');
  const one=async(q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
  const schema=await one('select private.perfis_atendimento()');
  for(const [id,p] of Object.entries(perfisAtendimento)) {
    assert.deepEqual(schema[id].etapas,p.etapas,`Etapas sincronizadas: ${id}`);
    assert.deepEqual(Object.keys(schema[id].campos).sort(),p.grupos.flatMap(g=>g.campos.map(c=>c.id)).sort(),`Campos sincronizados: ${id}`);
  }
  const u=randomUUID();
  await db.exec(`alter table auth.users add column email_confirmed_at timestamptz;insert into auth.users values('${u}',now());select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`);
  for(const [perfil] of subsetoresDoRamo('assistencia_tecnica')) {
    const w=await one("select public.configurar_nova_empresa($1,$2,'','{}','assistencia_tecnica',$3)",[randomUUID(),`Assistência teste ${perfil}`,perfil]);
    await db.exec(`reset role;update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${w}';set role authenticated;`);
    const c=await one('select public.salvar_cliente($1,$2)',[w,{nome:'Cliente fictício'}]);
    const objeto=randomUUID(),id=randomUUID(),produto=randomUUID();
    await one('select public.salvar_objeto_atendimento($1,$2,$3)',[w,objeto,{cliente_id:c.id,nome:'Equipamento de teste',dados:{serie:'SERIE-001'}}]);
    await one('select public.salvar_produto_estoque($1,$2,$3)',[w,{descricao:'Componente de teste',unidade:'un',custo_centavos:1000},produto]);
    await one("select public.movimentar_estoque($1,$2,'entrada',5,'Bancada de teste',$3,1)",[w,produto,randomUUID()]);
    const ficha=novaFichaEspecialidade(perfil);ficha.campos.defeito='Não liga';
    await one('select public.salvar_atendimento_servico($1,$2,$3)',[w,id,{cliente_id:c.id,objeto_id:objeto,titulo:'Reparo de teste',situacao:'em_execucao',dados:{},valor_centavos:0,data_servico:'2026-10-15',vencimento:'2026-10-30',ficha_especialidade:ficha}]);
    const get=()=>one('select public.consultar_detalhes_atendimento($1,$2)',[w,id]);
    let d=await get();
    await one('select public.salvar_itens_atendimento($1,$2,$3,$4,0,0,\'\')',[w,id,d.atendimento.revisao,[{id:randomUUID(),tipo:'material',descricao:'Componente',quantidade:1,unidade:'un',preco_centavos:3000,custo_centavos:1000,origem:'estoque',produto_id:produto}]]);
    d=await get();
    const save=async(a)=>{await one('select public.salvar_atendimento_servico($1,$2,$3,$4)',[w,id,a,a.revisao]);return get();};
    d=await save(concluirReparo(d.atendimento,perfil));
    const conclusao=d.atendimento.concluido_em;
    assert.ok(conclusao);
    d=await save(registrarRetirada(d.atendimento,'Cliente fictício',perfil));
    assert.equal(d.atendimento.ficha_especialidade.etapa,'Entregue');
    assert.equal(d.atendimento.concluido_em,conclusao);
    assert.equal(d.atendimento.valor_centavos,3000);
    assert.equal(d.eventos.filter(e=>e.tipo==='etapa'&&e.depois==='Entregue').length,1);
    const estoque=await one('select public.listar_estoque($1)',[w]);
    assert.equal(estoque.itens.find(p=>p.id===produto).saldo,4,'Retirada não baixa a peça novamente');
    await assert.rejects(()=>save({...d.atendimento,revisao:1}),e=>e.code===codigoConflitoRevisao);
  }
  console.log('PASS cinco perfis: recepção, conclusão, retirada, estoque único, histórico e concorrência; 26 esquemas preservados');
} finally { await db?.close(); }
