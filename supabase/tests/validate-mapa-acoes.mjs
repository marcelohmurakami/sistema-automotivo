import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
import { prepararMapa } from "../../src/lib/mapaOficina.ts";

const db = await criarBancoLocal("20261006000300");
const owner = randomUUID(),
  staff = randomUUID(),
  other = randomUUID();
let n = 0,
  oficina,
  os;
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const login = (id, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role}`,
  );
const ok = (value, name) => {
  assert.ok(value, name);
  console.log("PASS", name);
  n++;
};
const fail = async (fn, code, name) => {
  await assert.rejects(fn, (e) => e.code === code);
  console.log("PASS", name);
  n++;
};
const ler = () =>
  scalar("select public.consultar_ordem_servico($1,$2)", [oficina, os.id]);
const acao = (
  nome,
  motivo = null,
  detalhes = null,
  revisao = os.revisao,
  empresa = oficina,
  id = os.id,
) =>
  scalar("select public.operar_mapa_rapido($1,$2,$3,$4,$5,$6)", [
    empresa,
    id,
    revisao,
    nome,
    motivo,
    detalhes,
  ]);
const mover = async (direcao) => {
  await scalar("select public.mover_ordem_no_mapa($1,$2,$3,$4)", [
    oficina,
    os.id,
    os.revisao,
    direcao,
  ]);
  os = await ler();
};
try {
  await db.exec(
    `insert into auth.users(id) values('${owner}'),('${staff}'),('${other}')`,
  );
  await login(owner);
  oficina = await scalar("select public.criar_oficina('Ações rápidas',null)");
  os = { id: randomUUID(), revisao: 1 };
  await fail(
    () => acao("parar", "parts"),
    "42501",
    "Plano Básico não executa ações do mapa",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${oficina}';insert into public.membros_oficina(oficina_id,usuario_id,perfil) values('${oficina}','${staff}','staff')`,
  );
  await login(owner);
  const cliente = (
    await scalar("select public.salvar_cliente($1,$2::jsonb)", [
      oficina,
      JSON.stringify({ nome: "Cliente de teste" }),
    ])
  ).id;
  const veiculo = await scalar(
    "select public.cadastrar_veiculo_orcamento($1,$2,'Veículo teste','MAP1A23')",
    [oficina, cliente],
  );
  const nova = () =>
    scalar("select public.salvar_ordem_servico($1,$2::jsonb,$3)", [
      oficina,
      JSON.stringify({
        cliente_id: cliente,
        veiculo_id: veiculo,
        responsavel: "João",
        entrega_prevista_em: "2026-10-08T14:00:00Z",
      }),
      randomUUID(),
    ]);
  os = await nova();
  await fail(() => acao("invalida"), "22023", "Ação desconhecida rejeitada");
  await fail(() => acao(null), "22023", "Ação obrigatória");
  await fail(
    () => acao("parar", "parts", null, null),
    codigoConflitoRevisao,
    "Revisão obrigatória",
  );
  await fail(
    () => acao("concluir"),
    "23514",
    "Não conclui uma OS recebida sem conferência",
  );
  await fail(() => acao("retomar"), "23514", "Retomar exige parada aberta");
  await fail(() => acao("parar", null), "22023", "Motivo obrigatório");
  await fail(
    () => acao("parar", "invalido"),
    "22023",
    "Motivo inválido rejeitado",
  );
  await fail(
    () => acao("parar", "parts", "x".repeat(2001)),
    "22023",
    "Detalhes limitados a 2.000 caracteres",
  );
  const anterior = os;
  let resposta = await acao("parar", "parts");
  os = await ler();
  ok(
    resposta.paradas.length === 1 &&
      resposta.situacao === "open" &&
      os.revisao === anterior.revisao + 1,
    "Parar retorna pendência e revisão para atualizar o cartão imediatamente",
  );
  const card = prepararMapa([os])[0];
  ok(
    card.etapa === "aguardando" &&
      card.versao === "Parada" &&
      card.motivo === "Aguardando peças",
    "Parada sem detalhes mostra somente o motivo, sem duplicar texto",
  );
  await fail(
    () => acao("parar", "parts", null, anterior.revisao),
    codigoConflitoRevisao,
    "Dois cliques com a mesma revisão não duplicam parada",
  );
  await fail(
    () => acao("parar", "approval"),
    "23514",
    "Não adiciona outra parada rápida enquanto está parado",
  );
  await acao("retomar");
  os = await ler();
  ok(
    os.situacao === "open" && os.paradas.every((p) => p.encerrado_em),
    "Retomar volta a Recebida e preserva registro da parada",
  );
  await mover("avancar");
  await fail(
    () => acao("concluir"),
    "23514",
    "Não conclui diretamente da execução",
  );
  await login(staff);
  for (const motivo of [
    "approval",
    "third_party",
    "capacity",
    "diagnosis",
    "other",
  ]) {
    await acao("parar", motivo, "Pendência de teste");
    os = await ler();
    ok(
      prepararMapa([os])[0].motivo.includes("Pendência de teste"),
      `Funcionário registra ${motivo} com detalhes`,
    );
    await acao("retomar");
    os = await ler();
    ok(
      os.situacao === "in_progress" && !os.paradas.some((p) => !p.encerrado_em),
      `Retomar ${motivo} conserva Em execução`,
    );
  }
  await login(owner);
  for (const descricao of [
    "Serviço pendente",
    "Serviço concluído antes",
    "Serviço cancelado",
  ]) {
    await scalar("select public.salvar_item_os($1,$2,$3,$4::jsonb)", [
      oficina,
      os.id,
      os.revisao,
      JSON.stringify({
        tipo: "service",
        descricao,
        quantidade: 1,
        preco_unitario_centavos: 10000,
      }),
    ]);
    os = await ler();
  }
  const pronto = os.itens.find(
    (i) => i.descricao === "Serviço concluído antes",
  ).id;
  const cancelado = os.itens.find(
    (i) => i.descricao === "Serviço cancelado",
  ).id;
  await scalar("select public.salvar_item_os($1,$2,$3,$4::jsonb,$5)", [
    oficina,
    os.id,
    os.revisao,
    JSON.stringify({ situacao: "done" }),
    pronto,
  ]);
  await db.exec(
    `reset role;update public.itens_ordem_servico set situacao='cancelled' where id='${cancelado}'`,
  );
  await login(owner);
  os = await ler();
  await mover("avancar");
  await acao("parar", "parts", "Aguardando filtro");
  os = await ler();
  const bloqueada = os;
  await fail(
    () => acao("concluir"),
    "23514",
    "Parada impede concluir mesmo durante a conferência",
  );
  ok(
    JSON.stringify(await ler()) === JSON.stringify(bloqueada),
    "Conclusão bloqueada não muda itens nem histórico",
  );
  await scalar(
    "select public.registrar_parada_os($1,$2,'approval','Cliente precisa aprovar')",
    [oficina, os.id],
  );
  os = await ler();
  resposta = await acao("retomar");
  os = await ler();
  ok(
    os.situacao === "quality_check" &&
      resposta.paradas.every((p) => p.encerrado_em),
    "Retomar resolve as pendências do cartão e retorna à Conferência",
  );
  const antesConclusao = os;
  // Simula uma validação posterior à mudança de itens: toda a transação deve voltar.
  await db.exec(
    `reset role;create function public.falha_teste_conclusao() returns trigger language plpgsql as $$begin if new.situacao='ready' then raise exception 'Falha simulada' using errcode='23514'; end if;return new;end $$;create trigger falha_teste_conclusao before update on public.ordens_servico for each row execute function public.falha_teste_conclusao()`,
  );
  await login(owner);
  await fail(
    () => acao("concluir"),
    "23514",
    "Falha na mudança de etapa é propagada",
  );
  ok(
    JSON.stringify(await ler()) === JSON.stringify(antesConclusao),
    "Falha posterior reverte itens, revisão e histórico juntos",
  );
  await db.exec(
    "reset role;drop trigger falha_teste_conclusao on public.ordens_servico;drop function public.falha_teste_conclusao()",
  );
  await login(staff);
  resposta = await acao("concluir");
  os = await ler();
  ok(
    os.situacao === "ready" &&
      resposta.situacao === "ready" &&
      os.itens.every((i) => ["done", "cancelled"].includes(i.situacao)),
    "Um clique conclui itens pendentes e deixa a OS pronta",
  );
  ok(
    os.itens.find((i) => i.id === cancelado).situacao === "cancelled",
    "Item cancelado não é reativado pela conclusão",
  );
  ok(
    os.itens.find((i) => i.id === pronto).concluido_em ===
      antesConclusao.itens.find((i) => i.id === pronto).concluido_em,
    "Data de item já concluído é preservada",
  );
  ok(
    os.historico.some(
      (h) =>
        h.metadados?.acao === "concluir_no_mapa" &&
        h.metadados.itens.length === 1,
    ),
    "Histórico identifica itens concluídos pelo mapa",
  );
  ok(
    os.entrega_prevista_em === antesConclusao.entrega_prevista_em &&
      os.responsavel === "João" &&
      os.recebido_em === antesConclusao.recebido_em,
    "Prazo, responsável e entrada preservados",
  );
  await login(owner);
  ok(
    Number(
      await scalar(
        "select count(*) from public.movimentacoes_estoque where ordem_servico_id=$1",
        [os.id],
      ),
    ) === 0,
    "Concluir não antecipa a baixa de estoque da entrega",
  );
  await fail(
    () => acao("concluir", null, null, antesConclusao.revisao),
    codigoConflitoRevisao,
    "Conclusão repetida com revisão antiga é rejeitada",
  );
  await fail(
    () => acao("concluir"),
    "23514",
    "Serviço pronto não é concluído novamente",
  );
  await fail(
    () => acao("parar", "parts"),
    "23514",
    "Serviço pronto deve voltar à conferência antes de parar",
  );
  await mover("avancar");
  ok(
    Number(
      await scalar(
        "select count(*) from public.titulos_financeiros where ordem_servico_id=$1 and automatico",
        [os.id],
      ),
    ) === 1,
    "Entrega posterior mantém integração financeira única",
  );
  for (const nome of ["concluir", "parar", "retomar"])
    await fail(() => acao(nome, "parts"), "23514", `Entregue bloqueia ${nome}`);
  await login(owner);
  os = await nova();
  await scalar(
    "select public.atualizar_mapa_ordem_servico($1,$2,$3,'cancelled',null,null,null,null,'Teste')",
    [oficina, os.id, os.revisao],
  );
  os = await ler();
  await fail(
    () => acao("parar", "parts"),
    "23514",
    "Cancelada permanece encerrada",
  );
  await login(other);
  await fail(
    () => acao("parar", "parts"),
    "42501",
    "Conta de outra oficina não altera OS",
  );
  const outra = await scalar(
    "select public.criar_oficina('Outra oficina',null)",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${outra}'`,
  );
  await login(other);
  await fail(
    () => acao("parar", "parts", null, os.revisao, outra),
    "P0002",
    "ID de OS alheia não atravessa isolamento entre oficinas",
  );
  await login("", "anon");
  await fail(
    () => acao("parar", "parts"),
    "42501",
    "Anônimo não executa a RPC",
  );
  console.log(`${n} verificações de conclusão, parada e retomada aprovadas.`);
} finally {
  await db.close();
}
