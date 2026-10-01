import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

// Somente uma oficina de validação explicitamente configurada. Nunca usa service_role no atendimento.
const configPath = process.argv[2];
if (!configPath) {
  console.error(
    "Uso: node scripts/validar-atendimento-real.mjs <configuracao.local>",
  );
  process.exit(1);
}
const entrada =
  configPath === "-"
    ? await (async () => {
        let s = "";
        for await (const bloco of process.stdin) s += bloco.toString();
        return s;
      })()
    : await readFile(configPath, "utf8");
const config = JSON.parse(entrada.replace(/^\uFEFF/, ""));
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const url = env.VITE_SUPABASE_URL,
  key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.equal(
  new URL(url).hostname,
  "hzihxtjirttetnfdujcx.supabase.co",
  "Projeto diferente do autorizado",
);
assert.equal(config.contas?.length, 2, "Configure duas contas independentes");
const oficina = config.oficina_id,
  run = randomUUID(),
  prefixo = "[VALIDAÇÃO " + run.slice(0, 8) + "]";
const pasta = "docs/validacao-real";
await mkdir(pasta, { recursive: true });
const relatorio = {
  execucao: run,
  inicio: new Date().toISOString(),
  projeto: "hzihxtjirttetnfdujcx",
  oficina_id: oficina,
  tipo: "Auth, PostgREST e Storage reais; pagamentos apenas escriturais de teste",
  verificacoes: [],
  concorrencia: [],
  registros: {},
  resultado: "em_andamento",
};
const persistir = () =>
  writeFile(`${pasta}/${run}.json`, JSON.stringify(relatorio, null, 2));
const segredos = [key, ...config.contas.map((c) => c.senha)];
const limpo = (s) =>
  segredos
    .filter(Boolean)
    .reduce((v, seg) => v.replaceAll(seg, "[omitido]"), String(s));
function ok(cond, msg, detalhes) {
  assert.ok(cond, msg);
  relatorio.verificacoes.push({
    teste: msg,
    resultado: "aprovado",
    ...(detalhes ? { detalhes } : {}),
  });
  console.log("PASS", msg);
}
function cliente() {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
const A = cliente(),
  B = cliente(),
  anon = cliente();
async function rpc(c, n, p) {
  const { data, error } = await c.rpc(n, p);
  if (error)
    throw Object.assign(new Error(limpo(`${n}: ${error.message}`)), {
      code: error.code,
    });
  return data;
}
async function falha(fn, codigos, msg) {
  try {
    await fn();
  } catch (e) {
    ok(codigos.includes(e.code), msg, { codigo: e.code });
    return;
  }
  throw new Error("Operação deveria ter sido rejeitada: " + msg);
}
async function disputa(nome, operacoes) {
  const r = await Promise.all(
    operacoes.map(async (fn, i) => {
      const inicio = new Date().toISOString();
      try {
        const data = await fn();
        return {
          usuario: i ? "B" : "A",
          inicio,
          fim: new Date().toISOString(),
          data,
        };
      } catch (e) {
        return {
          usuario: i ? "B" : "A",
          inicio,
          fim: new Date().toISOString(),
          erro: { code: e.code, message: limpo(e.message) },
        };
      }
    }),
  );
  relatorio.concorrencia.push({
    teste: nome,
    resultados: r.map(({ data, ...v }) => ({ ...v, sucesso: !v.erro })),
  });
  return r;
}
function umaEdicao(r, msg) {
  ok(
    r.filter((x) => !x.erro).length === 1 &&
      r.filter((x) => x.erro?.code === "PT409").length === 1,
    msg,
  );
}
// PNGs de teste sintéticos, sem imagem de cliente ou veículo real.
function png(rgb) {
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) {
      c ^= x;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (tipo, d) => {
    const t = Buffer.from(tipo),
      len = Buffer.alloc(4),
      check = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    check.writeUInt32BE(crc(Buffer.concat([t, d])));
    return Buffer.concat([len, t, d, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(48, 0);
  header.writeUInt32BE(48, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(48 * (1 + 48 * 3));
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++)
      for (let k = 0; k < 3; k++) pixels[y * 145 + 1 + x * 3 + k] = rgb[k];
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
let o, q, token;
try {
  const usuarios = [];
  for (const [i, c] of [A, B].entries()) {
    const { data, error } = await c.auth.signInWithPassword({
      email: config.contas[i].email,
      password: config.contas[i].senha,
    });
    if (error)
      throw new Error(
        "Falha no login " + (i ? "B" : "A") + ": " + error.message,
      );
    segredos.push(data.session.access_token, data.session.refresh_token);
    const verificado = await c.auth.getUser();
    assert.equal(verificado.data.user?.id, data.user.id);
    usuarios.push(data.user.id);
  }
  ok(
    usuarios[0] !== usuarios[1],
    "Duas identidades reais distintas autenticadas pelo Supabase Auth",
  );
  relatorio.usuarios = usuarios;
  for (const c of [A, B]) {
    const acesso = await rpc(c, "consultar_meu_acesso", {}),
      w = acesso.find((w) => w.id === oficina);
    assert.ok(
      w && w.nome.startsWith("[VALIDAÇÃO]"),
      "Use uma oficina separada com nome iniciado por [VALIDAÇÃO]",
    );
    for (const f of [
      "quotes",
      "work_orders",
      "service_media",
      "inventory",
      "finance",
    ])
      assert.ok(w.recursos.includes(f), "Plano de teste sem recurso " + f);
  }
  ok(
    true,
    "As duas contas acessam a oficina de validação com os recursos necessários",
  );
  const inicial = await rpc(A, "listar_ordens_servico", { p_oficina: oficina });
  assert.equal(
    inicial.total,
    0,
    "Use uma oficina de validação vazia para não misturar execuções.",
  );
  const c = await rpc(A, "salvar_cliente", {
    p_oficina: oficina,
    p_dados: {
      nome: prefixo + " Cliente fictício",
      observacoes: "Teste automatizado sem efeito comercial",
    },
  });
  relatorio.registros.cliente = c.id;
  const v = await rpc(B, "cadastrar_veiculo_orcamento", {
    p_oficina: oficina,
    p_cliente: c.id,
    p_modelo: prefixo + " Veículo fictício",
    p_placa: null,
  });
  relatorio.registros.veiculo = v;
  const p = randomUUID();
  await rpc(A, "salvar_produto_estoque", {
    p_oficina: oficina,
    p_id: p,
    p_revisao: null,
    p_dados: {
      descricao: prefixo + " Filtro teste",
      unidade: "un",
      preco_padrao_centavos: 3500,
      custo_centavos: 2000,
      minimo: 1,
    },
  });
  relatorio.registros.produto = p;
  const estoque = async () => {
    const r = await A.from("estoque_produtos")
      .select("saldo,custo_centavos,revisao")
      .eq("oficina_id", oficina)
      .eq("item_catalogo_id", p)
      .single();
    if (r.error) throw r.error;
    return r.data;
  };
  await rpc(A, "movimentar_estoque", {
    p_oficina: oficina,
    p_produto: p,
    p_tipo: "entrada",
    p_quantidade: 5,
    p_motivo: prefixo + " Saldo fictício",
    p_chave: randomUUID(),
    p_revisao: 1,
    p_documento: prefixo,
  });
  ok(
    Number((await estoque()).saldo) === 5,
    "Produto de teste começa com cinco unidades",
  );
  const dados = {
    cliente_id: c.id,
    veiculo_id: v,
    itens: [
      {
        tipo: "service",
        descricao: prefixo + " Serviço teste",
        quantidade: 1,
        preco_unitario_centavos: 12000,
        unidade: "serv",
      },
      {
        tipo: "part",
        item_catalogo_id: p,
        descricao: prefixo + " Filtro teste",
        quantidade: 2,
        preco_unitario_centavos: 3500,
        unidade: "un",
      },
    ],
    desconto_centavos: 1000,
    observacoes: prefixo,
    condicoes:
      "VALIDAÇÃO DE SOFTWARE. DADOS FICTÍCIOS, SEM EFEITO COMERCIAL. Não autoriza serviço nem cobrança real.",
  };
  const chave = randomUUID();
  const criacao = await disputa(
    "Criar orçamento com a mesma chave",
    [A, B].map(
      (c) => () =>
        rpc(c, "salvar_orcamento", {
          p_oficina: oficina,
          p_dados: dados,
          p_chave: chave,
        }),
    ),
  );
  assert.ok(criacao.every((r) => !r.erro));
  q = criacao[0].data;
  ok(q.id === criacao[1].data.id, "Criação simultânea não duplica orçamento");
  relatorio.registros.orcamento = q.id;
  const edicoes = await disputa(
    "Editar orçamento com a mesma revisão",
    [A, B].map(
      (c, i) => () =>
        rpc(c, "salvar_orcamento", {
          p_oficina: oficina,
          p_dados: { ...dados, observacoes: prefixo + " Edição " + i },
          p_chave: chave,
          p_orcamento: q.id,
          p_revisao: q.revisao,
        }),
    ),
  );
  umaEdicao(
    edicoes,
    "Somente uma edição de orçamento vence; outra recebe conflito",
  );
  q = await rpc(A, "consultar_orcamento", {
    p_oficina: oficina,
    p_orcamento: q.id,
  });
  ok(
    q.versao.total_centavos === 18000,
    "Orçamento totaliza R$ 180 com desconto calculado no servidor",
  );
  token = randomBytes(32).toString("hex");
  segredos.push(token);
  q = await rpc(A, "emitir_orcamento", {
    p_oficina: oficina,
    p_orcamento: q.id,
    p_revisao: q.revisao,
    p_validade_dias: 1,
    p_hash_token: createHash("sha256").update(token).digest("hex"),
  });
  const publico = await rpc(anon, "consultar_orcamento_publico", {
    p_token: token,
  });
  ok(
    publico.versao.total_centavos === 18000 &&
      !("oficina_id" in publico) &&
      !("email" in publico.versao.dados_cliente),
    "Link público expõe a proposta correta sem campos privados",
  );
  await falha(
    () =>
      rpc(anon, "consultar_orcamento_publico", {
        p_token: randomBytes(32).toString("hex"),
      }),
    ["P0002"],
    "Token inexistente não revela orçamento",
  );
  await falha(
    () =>
      rpc(anon, "responder_orcamento", {
        p_token: token,
        p_nome: "Cliente de validação",
        p_decisao: "approved",
        p_confirmo: false,
      }),
    ["22023"],
    "Aprovação exige confirmação explícita",
  );
  const aprovado = await rpc(anon, "responder_orcamento", {
    p_token: token,
    p_nome: "Cliente de validação",
    p_decisao: "approved",
    p_confirmo: true,
  });
  ok(
    aprovado.situacao === "approved",
    "Cliente anônimo aprova a versão publicada",
  );
  await rpc(anon, "responder_orcamento", {
    p_token: token,
    p_nome: "Cliente de validação",
    p_decisao: "approved",
    p_confirmo: true,
  });
  ok(true, "Repetição da aprovação é idempotente");
  const conversoes = await disputa(
    "Converter orçamento aprovado simultaneamente",
    [A, B].map(
      (c) => () =>
        rpc(c, "converter_orcamento_em_os", {
          p_oficina: oficina,
          p_orcamento: q.id,
        }),
    ),
  );
  assert.ok(conversoes.every((r) => !r.erro));
  const osId = conversoes[0].data;
  ok(osId === conversoes[1].data, "Conversão simultânea gera uma única OS");
  relatorio.registros.os = osId;
  const os = () =>
    rpc(A, "consultar_ordem_servico", { p_oficina: oficina, p_os: osId });
  o = await os();
  ok(
    o.total_centavos === 18000 && o.itens.length === 2,
    "OS preserva itens e valor aprovados",
  );
  const ficha = {
    cliente_id: c.id,
    veiculo_id: v,
    queixa_cliente: prefixo + " Checagem",
    diagnostico: "Diagnóstico fictício",
    responsavel: "Técnico de validação",
    prioridade: "normal",
    checklist: { "Teste de funcionamento realizado": true },
    entrega_prevista_em: new Date(Date.now() + 86400000).toISOString(),
  };
  const osEdit = await disputa(
    "Editar OS com a mesma revisão",
    [A, B].map(
      (c, i) => () =>
        rpc(c, "salvar_ordem_servico", {
          p_oficina: oficina,
          p_os: osId,
          p_revisao: o.revisao,
          p_chave: randomUUID(),
          p_dados: {
            ...ficha,
            observacoes_internas: prefixo + " Operador " + i,
          },
        }),
    ),
  );
  umaEdicao(
    osEdit,
    "Edições simultâneas da OS não sobrescrevem dados silenciosamente",
  );
  o = await os();
  async function foto(c, fase, rgb) {
    const bytes = png(rgb);
    const reserva = await rpc(c, "reservar_foto_os", {
      p_oficina: oficina,
      p_os: osId,
      p_fase: fase,
      p_nome: prefixo + "-" + fase + ".png",
      p_mime: "image/png",
      p_tamanho: bytes.length,
      p_legenda: prefixo + " Foto sintética " + fase,
    });
    const upload = await c.storage
      .from("workshop-files")
      .upload(reserva.caminho, bytes, {
        contentType: "image/png",
        upsert: false,
      });
    if (upload.error) throw upload.error;
    await rpc(c, "confirmar_foto_os", {
      p_oficina: oficina,
      p_arquivo: reserva.id,
    });
    const urlFoto = await c.storage
      .from("workshop-files")
      .createSignedUrl(reserva.caminho, 60);
    if (urlFoto.error) throw urlFoto.error;
    const download = await fetch(urlFoto.data.signedUrl);
    assert.equal(download.status, 200);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await download.arrayBuffer()))
        .digest("hex"),
      createHash("sha256").update(bytes).digest("hex"),
    );
    return reserva.caminho;
  }
  const fotos = await Promise.all([
    foto(A, "before", [190, 80, 50]),
    foto(B, "after", [60, 140, 80]),
  ]);
  relatorio.registros.fotos = fotos;
  o = await os();
  ok(
    o.fotos.length === 2 &&
      o.fotos.some((f) => f.fase === "before") &&
      o.fotos.some((f) => f.fase === "after"),
    "Dois usuários enviam fotos antes/depois e os arquivos reais são recuperáveis",
  );
  const proibido = await anon.storage.from("workshop-files").download(fotos[0]);
  ok(!!proibido.error, "Foto privada não permite download anônimo");
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const titulo = await rpc(A, "preparar_financeiro_os", {
    p_oficina: oficina,
    p_os: osId,
  });
  relatorio.registros.titulo = titulo;
  const financeiroOS = () =>
    rpc(A, "consultar_financeiro_os", { p_oficina: oficina, p_os: osId });
  const financeiro = () =>
    rpc(A, "consultar_financeiro", {
      p_oficina: oficina,
      p_inicio: hoje,
      p_fim: hoje,
      p_filtro: "todos",
    });
  await rpc(A, "combinar_pagamento_os", {
    p_oficina: oficina,
    p_os: osId,
    p_vencimento: hoje,
  });
  const chaveSinal = randomUUID(),
    sinal = {
      p_oficina: oficina,
      p_titulo: titulo,
      p_chave: chaveSinal,
      p_valor: 5000,
      p_taxa: 100,
      p_data: hoje,
      p_conta: "banco",
      p_forma: "pix",
      p_observacao: prefixo + " Registro fictício, sem transação bancária",
    };
  const pagamentos = await disputa(
    "Repetir o mesmo sinal simultaneamente",
    [A, B].map((c) => () => rpc(c, "baixar_titulo_financeiro", sinal)),
  );
  assert.ok(pagamentos.every((r) => !r.erro));
  ok(
    pagamentos[0].data === pagamentos[1].data,
    "Sinal enviado por dois usuários é registrado uma única vez",
  );
  let f = await financeiroOS();
  ok(
    f.baixado_centavos === 5000 && f.aberto_centavos === 13000 && f.provisorio,
    "Pagamento parcial deixa R$ 130 em aberto antes da entrega",
  );
  const antes = await financeiro();
  ok(
    antes.resumo.receitas === 0 && antes.resumo.entradas === 4900,
    "Sinal entra no caixa líquido, sem reconhecer receita prematura",
  );
  async function mudar(c, situacao, registro) {
    return rpc(c, "atualizar_mapa_ordem_servico", {
      p_oficina: oficina,
      p_ordem_servico: osId,
      p_revisao_esperada: registro.revisao,
      p_situacao: situacao,
      p_etapa: null,
      p_local: null,
      p_entrega_prevista_em: registro.entrega_prevista_em,
      p_recebido_em: registro.recebido_em || new Date().toISOString(),
      p_motivo_cancelamento: null,
    });
  }
  o = await os();
  await mudar(A, "in_progress", o);
  o = await os();
  await mudar(B, "quality_check", o);
  o = await os();
  await falha(
    () => mudar(A, "ready", o),
    ["22023", "23514"],
    "Itens pendentes impedem liberação do veículo",
  );
  for (const item of o.itens) {
    o = await os();
    await rpc(B, "salvar_item_os", {
      p_oficina: oficina,
      p_os: osId,
      p_revisao: o.revisao,
      p_item: item.id,
      p_dados: { situacao: "done" },
    });
  }
  o = await os();
  await mudar(A, "ready", o);
  ok(
    Number((await estoque()).saldo) === 5,
    "Até a liberação, estoque permanece sem baixa",
  );
  o = await os();
  const entregas = await disputa(
    "Entregar a mesma OS simultaneamente",
    [A, B].map((c) => () => mudar(c, "delivered", o)),
  );
  umaEdicao(entregas, "Somente uma entrega é aceita com a mesma revisão");
  o = await os();
  ok(o.situacao === "delivered", "OS entregue");
  ok(
    Number((await estoque()).saldo) === 3,
    "Entrega baixa exatamente duas unidades do estoque",
  );
  const mov = await A.from("movimentacoes_estoque")
    .select("id,quantidade,ordem_servico_id")
    .eq("oficina_id", oficina)
    .eq("ordem_servico_id", osId)
    .eq("tipo", "consumo_os");
  if (mov.error) throw mov.error;
  ok(
    mov.data.length === 1 && Number(mov.data[0].quantidade) === -2,
    "Baixa única rastreável até a OS",
  );
  f = await financeiroOS();
  ok(
    f.id === titulo && !f.provisorio && f.aberto_centavos === 13000,
    "Entrega mantém a cobrança e o sinal, sem duplicar financeiro",
  );
  const saldos = await disputa(
    "Quitar saldo em duas contas com chaves diferentes",
    [A, B].map(
      (c) => () =>
        rpc(c, "baixar_titulo_financeiro", {
          ...sinal,
          p_chave: randomUUID(),
          p_valor: 13000,
          p_taxa: 0,
        }),
    ),
  );
  ok(
    saldos.filter((x) => !x.erro).length === 1 &&
      saldos.filter((x) => x.erro?.code === "22023").length === 1,
    "Segundo pagamento simultâneo não ultrapassa saldo devedor",
  );
  f = await financeiroOS();
  ok(
    f.baixado_centavos === 18000 && f.aberto_centavos === 0,
    "OS totalmente quitada, sem recebimento duplicado",
  );
  const final = await financeiro();
  ok(
    final.resumo.receitas === 18000 &&
      final.resumo.pecas === 4000 &&
      final.resumo.taxas === 100 &&
      final.resumo.entradas === 17900,
    "Receita, custo de peças, taxa e caixa conferem com o atendimento",
  );
  ok(
    final.resumo.receitas -
      final.resumo.despesas -
      final.resumo.pecas -
      final.resumo.taxas ===
      13900,
    "Resultado do atendimento de teste: R$ 139,00",
  );
  const hist = await rpc(A, "historico_financeiro", {
    p_oficina: oficina,
    p_titulo: titulo,
  });
  ok(hist.length === 2, "Histórico financeiro contém apenas sinal e quitação");
  o = await os();
  ok(
    usuarios.every((u) => o.historico.some((h) => h.usuario_autor_id === u)),
    "Histórico de OS identifica ações dos dois usuários",
  );
  await falha(
    () =>
      rpc(B, "reservar_foto_os", {
        p_oficina: oficina,
        p_os: osId,
        p_fase: "after",
        p_nome: "nao-enviar.png",
        p_mime: "image/png",
        p_tamanho: 10,
      }),
    ["22023"],
    "OS entregue impede novas fotos",
  );
  const mapa = await B.from("ordens_servico")
    .select("id")
    .eq("oficina_id", oficina)
    .eq("id", osId)
    .in("situacao", ["open", "in_progress", "quality_check", "ready"]);
  if (mapa.error) throw mapa.error;
  ok(mapa.data.length === 0, "OS entregue sai do mapa operacional");
  const publicoFinal = await rpc(anon, "consultar_orcamento_publico", {
    p_token: token,
  });
  ok(
    publicoFinal.situacao === "approved" &&
      publicoFinal.versao.total_centavos === 18000,
    "Proposta aprovada mantém o valor original após atendimento",
  );
  relatorio.resultado = "aprovado";
  relatorio.resumo = {
    total_centavos: 18000,
    estoque_inicial: 5,
    consumo: 2,
    estoque_final: 3,
    recebido_centavos: 18000,
    taxas_centavos: 100,
    caixa_liquido_centavos: 17900,
    custo_pecas_centavos: 4000,
    resultado_centavos: 13900,
  };
} catch (e) {
  relatorio.resultado = "falhou";
  relatorio.falha = { mensagem: limpo(e.message), codigo: e.code };
  console.error("FAIL", limpo(e.message));
  process.exitCode = 1;
} finally {
  relatorio.fim = new Date().toISOString();
  await persistir();
  await Promise.allSettled([
    A.auth.signOut({ scope: "local" }),
    B.auth.signOut({ scope: "local" }),
  ]);
  console.log("Relatório:", `${pasta}/${run}.json`);
}
