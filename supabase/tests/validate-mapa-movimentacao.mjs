import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
import { destinoNoMapa } from "../../src/lib/movimentacaoMapa.ts";

const db = await criarBancoLocal("20261006000200");
const owner = randomUUID(),
  staff = randomUUID(),
  other = randomUUID();
let n = 0,
  w,
  os;
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const login = async (u, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${u}',false);set role ${role}`,
  );
const ok = (v, nome) => {
  assert.ok(v, nome);
  console.log("PASS", nome);
  n++;
};
const fail = async (fn, code, nome) => {
  await assert.rejects(fn, (e) => e.code === code);
  console.log("PASS", nome);
  n++;
};
const ler = () =>
  scalar("select public.consultar_ordem_servico($1,$2)", [w, os.id]);
const mover = (direcao, rev = os.revisao) =>
  scalar("select public.mover_ordem_no_mapa($1,$2,$3,$4)", [
    w,
    os.id,
    rev,
    direcao,
  ]);
const passo = async (direcao, situacao) => {
  const antes = await ler();
  const resposta = await mover(direcao, antes.revisao);
  os = await ler();
  ok(
    os.situacao === situacao &&
      resposta.situacao === situacao &&
      os.revisao === antes.revisao + 1,
    `${direcao}: ${antes.situacao} → ${situacao}, uma revisão`,
  );
};
try {
  await db.exec(
    `insert into auth.users(id) values('${owner}'),('${staff}'),('${other}')`,
  );
  await login(owner);
  w = await scalar("select public.criar_oficina('Movimentação rápida',null)");
  await fail(
    () =>
      scalar("select public.mover_ordem_no_mapa($1,$2,1,'avancar')", [
        w,
        randomUUID(),
      ]),
    "42501",
    "Plano Básico bloqueia movimentação",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';insert into public.membros_oficina(oficina_id,usuario_id,perfil) values('${w}','${staff}','staff')`,
  );
  await login(owner);
  const c = (
    await scalar("select public.salvar_cliente($1,$2::jsonb)", [
      w,
      JSON.stringify({ nome: "Cliente de teste" }),
    ])
  ).id;
  const v = await scalar(
    "select public.cadastrar_veiculo_orcamento($1,$2,'Veículo teste','ABC1D23')",
    [w, c],
  );
  const nova = () =>
    scalar("select public.salvar_ordem_servico($1,$2::jsonb,$3)", [
      w,
      JSON.stringify({
        cliente_id: c,
        veiculo_id: v,
        responsavel: "João",
        entrega_prevista_em: "2026-10-08T14:00:00Z",
        recebido_em: null,
      }),
      randomUUID(),
    ]);
  os = await nova();
  await scalar(
    "select public.atualizar_mapa_ordem_servico($1,$2,$3,'open',null,null,$4,null)",
    [w, os.id, os.revisao, os.entrega_prevista_em],
  );
  os = await ler();
  const prazo = os.entrega_prevista_em;
  await fail(() => mover("lateral"), "22023", "Direção inválida rejeitada");
  await fail(() => mover(null), "22023", "Direção ausente rejeitada");
  await fail(
    () => mover("voltar"),
    "23514",
    "Recebida não volta para uma etapa inexistente",
  );
  await fail(() => mover("avancar", null), codigoConflitoRevisao, "Revisão obrigatória");
  const revisaoAnterior = os.revisao;
  await passo("avancar", "in_progress");
  await fail(
    () => mover("avancar", revisaoAnterior),
    codigoConflitoRevisao,
    "Clique repetido ou tela desatualizada não pula etapa",
  );
  ok(
    os.entrega_prevista_em === prazo &&
      os.responsavel === "João" &&
      os.recebido_em === null,
    "Prazo, responsável e entrada ausente preservados",
  );
  ok(
    os.historico.some(
      (h) =>
        h.metadados?.old_status === "open" &&
        h.metadados?.new_status === "in_progress",
    ),
    "Histórico mantém origem e destino",
  );
  await passo("voltar", "open");
  await login(staff);
  await passo("avancar", "in_progress");
  await passo("avancar", "quality_check");
  await passo("voltar", "in_progress");
  await login(owner);
  await scalar("select public.salvar_item_os($1,$2,$3,$4::jsonb)", [
    w,
    os.id,
    os.revisao,
    JSON.stringify({
      tipo: "service",
      descricao: "Revisão",
      quantidade: 1,
      preco_unitario_centavos: 10000,
      unidade: "un",
    }),
  ]);
  os = await ler();
  await passo("avancar", "quality_check");
  await fail(
    () => mover("avancar"),
    "22023",
    "Serviço pendente impede liberar veículo",
  );
  ok(
    (await ler()).situacao === "quality_check",
    "Falha mantém a OS na etapa original",
  );
  const item = os.itens[0];
  await scalar("select public.salvar_item_os($1,$2,$3,$4::jsonb,$5)", [
    w,
    os.id,
    os.revisao,
    JSON.stringify({ situacao: "done" }),
    item.id,
  ]);
  os = await ler();
  await passo("avancar", "ready");
  ok(
    !!(await scalar(
      "select concluido_em from public.ordens_servico where id=$1",
      [os.id],
    )),
    "Pronta registra conclusão",
  );
  await passo("voltar", "quality_check");
  ok(
    (await scalar(
      "select concluido_em from public.ordens_servico where id=$1",
      [os.id],
    )) === null,
    "Volta à conferência limpa conclusão anterior",
  );
  await scalar(
    "select public.registrar_parada_os($1,$2,'parts','Peça não chegou')",
    [w, os.id],
  );
  os = await ler();
  await fail(
    () => mover("avancar"),
    "23514",
    "Parada aberta impede avanço rápido",
  );
  await fail(
    () => mover("voltar"),
    "23514",
    "Voltar não encerra parada silenciosamente",
  );
  await scalar("select public.resolver_parada_os($1,$2,$3)", [
    w,
    os.id,
    os.paradas.find((p) => !p.encerrado_em).id,
  ]);
  os = await ler();
  await passo("avancar", "ready");
  await fail(
    () => mover("avancar"),
    "23514",
    "Entrega exige entrada registrada",
  );
  await scalar(
    "select public.atualizar_mapa_ordem_servico($1,$2,$3,'ready',null,null,$4,$5)",
    [w, os.id, os.revisao, os.entrega_prevista_em, new Date().toISOString()],
  );
  os = await ler();
  await passo("avancar", "delivered");
  ok(
    Number(
      await scalar(
        "select count(*) from public.titulos_financeiros where ordem_servico_id=$1 and automatico",
        [os.id],
      ),
    ) === 1,
    "Entrega rápida mantém integração financeira única",
  );
  await fail(
    () => mover("voltar"),
    "23514",
    "OS entregue não reabre pelo mapa",
  );
  await fail(
    () => mover("avancar"),
    "23514",
    "Entrega repetida não duplica integrações",
  );
  os = await nova();
  await scalar(
    "select public.atualizar_mapa_ordem_servico($1,$2,$3,'cancelled',null,null,null,null,'Teste')",
    [w, os.id, os.revisao],
  );
  os = await ler();
  await fail(
    () => mover("voltar"),
    "23514",
    "OS cancelada não reabre pelo mapa",
  );
  await login(other);
  await fail(
    () => mover("avancar"),
    "42501",
    "Outra conta sem vínculo não movimenta a oficina",
  );
  await login("", "anon");
  await fail(
    () => mover("avancar"),
    "42501",
    "Anônimo não executa movimentação",
  );
  for (const [estado, anterior, proximo] of [
    ["open", null, "in_progress"],
    ["in_progress", "open", "quality_check"],
    ["quality_check", "in_progress", "ready"],
    ["ready", "quality_check", "delivered"],
    ["delivered", null, null],
    ["cancelled", null, null],
  ]) {
    ok(
      destinoNoMapa(estado, "voltar") === anterior &&
        destinoNoMapa(estado, "avancar") === proximo,
      `Controles do mapa refletem o fluxo de ${estado}`,
    );
  }
  console.log(`${n} verificações de movimentação rápida aprovadas.`);
} finally {
  await db.close();
}
