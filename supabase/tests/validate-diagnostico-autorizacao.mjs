import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";

process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261026000200";
const f = await criarCenarioSubsistemas();
const { db, registros, login, ids } = f;
const resultados = [];
const provas = [];
const one = async (s, args = []) => Object.values((await db.query(s, args)).rows[0])[0];
const call = (fn, args) => one(`select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")})`, args);
const bloqueia = async (fn, code) => assert.rejects(fn, e => e.code === code);
try {
  for (const [perfil, r] of Object.entries(registros)) {
    const auto = !!r.proposta;
    await login(ids[perfil]);
    const original = await call(auto ? "consultar_orcamento" : "consultar_detalhes_atendimento", [r.w, auto ? r.proposta.id : r.atendimento]);
    for (const modo of ["total", "parcial", "recusa", "sem_abatimento", "taxa_maior", "equipe", "recebida", "revisao", ...(auto ? ["pela_os"] : ["portal"])]) {
      await login(ids[perfil]);
      const taxa = { valor_centavos: modo === "taxa_maior" ? 50000 : 5000, abater_na_aprovacao: modo !== "sem_abatimento", vencimento: r.hoje };
      const itensBase = [
        { descricao: "Serviço QA", quantidade: 1, unidade: "un", grupo_servico: "Principal", depende_grupo: "", preco: 10000 },
        { descricao: "Complemento QA", quantidade: 1, unidade: "un", grupo_servico: "Adicional", depende_grupo: "", preco: 10000 },
      ];
      let id, rev, versao, dados, osPendente, pagamento;
      const chave = randomUUID();
      if (auto) {
        dados = { ...original.versao, cliente_id: original.cliente_id, veiculo_id: original.veiculo_id, taxa_diagnostico: taxa, desconto_centavos: 2000, itens: itensBase.map(i => ({ ...i, tipo: "service", preco_unitario_centavos: i.preco })) };
        const q = await call("salvar_orcamento", [r.w, dados, chave]);
        id = q.id; rev = q.revisao; versao = q.versao_atual_id;
        assert.equal((await call("salvar_orcamento", [r.w, dados, chave])).id, id);
      } else {
        id = chave;
        dados = { ...original.atendimento, valor_centavos: 0, situacao: "orcamento", dados: { documento: "orcamento" }, taxa_diagnostico: taxa };
        await call("criar_atendimento_com_itens", [r.w, id, dados, itensBase.map(i => ({ ...i, id: randomUUID(), tipo: "servico", preco_centavos: i.preco, origem: "externa" })), 2000]);
        await call("criar_atendimento_com_itens", [r.w, id, dados, [], 0]);
        rev = (await call("consultar_detalhes_atendimento", [r.w, id])).atendimento.revisao;
      }
      const financeiro = await call("consultar_taxa_diagnostico", [r.w, id, auto ? "automotivo" : "servico"]);
      assert.equal(financeiro.valor_centavos, taxa.valor_centavos);
      assert.equal(financeiro.recebido_centavos, 0, "Não presume pagamento");
      const tipo = auto ? "automotivo" : "servico";
      await bloqueia(() => call("configurar_taxa_diagnostico", [r.w, id, tipo, rev - 1, 5000, true, r.hoje]), "PT409");
      await bloqueia(() => call("configurar_taxa_diagnostico", [r.w, id, tipo, rev, -1, true, r.hoje]), "22023");
      await call("configurar_taxa_diagnostico", [r.w, id, tipo, rev, taxa.valor_centavos, taxa.abater_na_aprovacao, r.hoje]);
      if (!auto) {
        const d = await call("consultar_detalhes_atendimento", [r.w, id]);
        await bloqueia(() => call("salvar_atendimento_servico", [r.w, id, { ...d.atendimento, situacao: "aprovado" }, rev]), "22023");
      }
      if (modo === "recebida") {
        const baixa = await call("baixar_titulo_financeiro", [r.w, financeiro.titulo_id, randomUUID(), 5000, 0, r.hoje, "caixa", "pix"]);
        assert.ok(baixa);
        pagamento = baixa;
        assert.equal((await call("consultar_taxa_diagnostico", [r.w, id, tipo])).recebido_centavos, 5000);
        await bloqueia(() => call("configurar_taxa_diagnostico", [r.w, id, tipo, rev, 6000, true, r.hoje]), "22023");
      }
      await login(ids.stranger);
      await bloqueia(() => call("consultar_taxa_diagnostico", [r.w, id, auto ? "automotivo" : "servico"]), "42501");
      await login(ids[perfil]);
      if (modo === "total") {
        await call("configurar_taxa_diagnostico", [r.w, id, tipo, rev, 0, true, r.hoje]);
        assert.equal((await call("consultar_taxa_diagnostico", [r.w, id, tipo])).cancelado, true);
        rev++;
        await call("configurar_taxa_diagnostico", [r.w, id, tipo, rev, 5000, true, r.hoje]);
        rev++;
        assert.equal((await call("consultar_taxa_diagnostico", [r.w, id, tipo])).titulo_id, financeiro.titulo_id);
      }
      if (modo === "pela_os") {
        // Um veículo novo por entrada: não reaproveita o veículo com OS aberta da fixture.
        const veiculo = await call("cadastrar_veiculo_orcamento", [r.w, original.cliente_id, "Entrada de diagnóstico", null, "QA"]);
        const q = await call("consultar_orcamento", [r.w, id]);
        const atualizado = await call("salvar_orcamento", [r.w, { ...dados, veiculo_id: veiculo }, randomUUID(), id, q.revisao]);
        rev = atualizado.revisao;
        osPendente = await call("criar_os_aguardando_orcamento", [r.w, id]);
        rev = (await call("consultar_orcamento", [r.w, id])).revisao;
      }
      if (modo === "portal") {
        await call("compartilhar_atendimento_cliente", [r.w, id, rev, true, "Serviços autorizados pelo cliente"]);
        rev++;
        await login(ids.customer);
        const portal = await call("consultar_meu_portal", [r.w]);
        assert.equal(portal.atendimentos.find(a => a.id === id).taxa_diagnostico.valor_centavos, 5000);
        await login(ids[perfil]);
      }
      const token = randomBytes(32).toString("hex"), hash = createHash("sha256").update(token).digest("hex");
      if (auto) await call("emitir_orcamento", [r.w, id, rev, 7, hash]);
      else await call("gerar_link_proposta_atendimento", [r.w, id, rev, hash, 7]);
      await login("", "anon");
      const consultar = () => call(auto ? "consultar_orcamento_publico" : "consultar_proposta_atendimento", [token]);
      const proposta = await consultar();
      assert.equal((auto ? proposta.versao : proposta.documento).taxa_diagnostico.valor_centavos, taxa.valor_centavos);
      const grupos = modo === "parcial" || modo === "taxa_maior" ? ["Principal"] : ["Principal", "Adicional"];
      const bruto = grupos.length === 1 ? 9000 : 18000;
      const abatimento = modo === "recusa" || modo === "sem_abatimento" ? 0 : Math.min(taxa.valor_centavos, bruto);
      const total = modo === "recusa" ? 0 : bruto - abatimento;
      const decisao = modo === "recusa" ? (auto ? "declined" : "recusado") : (auto ? "approved" : "aprovado");
      const fn = auto ? "responder_grupos_orcamento" : "responder_link_proposta_atendimento";
      const args = auto ? [token, "Cliente QA", decisao, true, grupos] : [token, "Cliente QA", decisao, grupos, true];
      async function responder() {
        if (modo === "pela_os") {
          await login(ids[perfil]);
          const os = await call("consultar_ordem_servico", [r.w, osPendente]);
          if (os.orcamento_pendente) await call("registrar_autorizacao_pela_os", [r.w, os.id, os.revisao, id, os.orcamento_pendente.revisao, versao, "Cliente QA", "telefone", true]);
          await login("", "anon");
        } else if (modo === "equipe") {
          await login(ids[perfil]);
          const argsEquipe = auto ? [r.w, id, rev + 1, versao, "Cliente QA", "whatsapp", true] : [r.w, id, rev, grupos, "Cliente QA", true, "whatsapp"];
          await call(auto ? "registrar_autorizacao_orcamento" : "registrar_autorizacao_atendimento", argsEquipe);
          await login("", "anon");
        } else if (modo === "portal") {
          await login(ids.customer);
          await call("responder_meu_orcamento_servico", [r.w, id, rev, grupos, "Cliente QA", "aprovado", true]);
          await login("", "anon");
        } else await call(fn, args);
      }
      await responder();
      const primeira = await consultar();
      await responder();
      const resposta = await consultar();
      const prova = auto ? resposta.aprovacao.comprovante : resposta.comprovante;
      assert.equal(prova.total_centavos, total);
      assert.equal(prova.taxa_diagnostico.abatimento_centavos, abatimento);
      assert.equal(prova.documento.total_centavos, 18000);
      assert.equal(prova.documento.itens.length, 2);
      assert.equal(prova.origem, ["equipe", "pela_os"].includes(modo) ? "equipe" : modo === "portal" ? "portal" : "link");
      if (modo === "equipe") assert.match(prova.registro_equipe, /whatsapp/);
      if (modo === "pela_os") assert.match(prova.registro_equipe, /telefone/);
      if (["mecanica", "assistencia_celulares", "manutencao_climatizacao", "limpeza_residencial"].includes(perfil) && ["parcial", "recusa"].includes(modo)) provas.push({ perfil, modo, prova });
      assert.match(prova.hash_sha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(prova, auto ? primeira.aprovacao.comprovante : primeira.comprovante, "Repetição não muda a manifestação");
      assert.equal(await one("select encode(sha256(convert_to(($1::jsonb-'hash_sha256')::text,'UTF8')),'hex')", [prova]), prova.hash_sha256);
      await login(ids[perfil]);
      const fin = await call("consultar_taxa_diagnostico", [r.w, id, auto ? "automotivo" : "servico"]);
      assert.equal(fin.titulo_id, financeiro.titulo_id);
      assert.equal(fin.aberto_centavos, modo === "recebida" ? 0 : taxa.valor_centavos);
      const revTitulo = await one("select revisao from public.titulos_financeiros where id=$1", [fin.titulo_id]);
      await bloqueia(() => call("salvar_titulo_financeiro", [r.w, fin.titulo_id, { natureza: "receber", categoria: "servicos", valor_centavos: 1, descricao: "Tentativa de alterar taxa fora da proposta", competencia: r.hoje, vencimento: r.hoje }, revTitulo]), "22023");
      if (pagamento) {
        await call("estornar_baixa_financeira", [r.w, pagamento, r.hoje, "Teste de estorno da taxa"]);
        assert.equal((await call("consultar_taxa_diagnostico", [r.w, id, tipo])).aberto_centavos, 5000);
      }
      if (modo === "revisao") {
        if (auto) {
          const atual = await call("consultar_orcamento", [r.w, id]);
          const novo = await call("revisar_orcamento", [r.w, id, atual.revisao]);
          rev = novo.revisao;
        } else {
          const atual = await call("consultar_detalhes_atendimento", [r.w, id]);
          await call("salvar_atendimento_servico", [r.w, id, { ...atual.atendimento, situacao: "orcamento" }, atual.atendimento.revisao]);
          rev = (await call("consultar_detalhes_atendimento", [r.w, id])).atendimento.revisao;
        }
        const token2 = randomBytes(32).toString("hex"), hash2 = createHash("sha256").update(token2).digest("hex");
        await call(auto ? "emitir_orcamento" : "gerar_link_proposta_atendimento", auto ? [r.w, id, rev, 7, hash2] : [r.w, id, rev, hash2, 7]);
        await login("", "anon");
        await call(fn, auto ? [token2, "Cliente QA", decisao, true, grupos] : [token2, "Cliente QA", decisao, grupos, true]);
        const nova = await call(auto ? "consultar_orcamento_publico" : "consultar_proposta_atendimento", [token2]);
        assert.equal((auto ? nova.aprovacao.comprovante : nova.comprovante).total_centavos, total, "Revisar não duplica abatimento");
        await login(ids[perfil]);
      }
      if (modo !== "recusa") {
        if (auto) {
          const os = await call("converter_orcamento_em_os", [r.w, id]);
          const ordem = await call("consultar_ordem_servico", [r.w, os]);
          assert.equal(ordem.total_centavos, total);
          assert.equal(ordem.itens.length, grupos.length);
        } else {
          const d = await call("consultar_detalhes_atendimento", [r.w, id]);
          assert.equal(d.atendimento.valor_centavos, total);
          assert.equal(d.comercial.abatimento_diagnostico_centavos, abatimento);
          await call("salvar_atendimento_servico", [r.w, id, { ...d.atendimento, titulo: "Título atualizado sem alterar valores" }, d.atendimento.revisao]);
          const atualizado = await call("consultar_detalhes_atendimento", [r.w, id]);
          await call("salvar_itens_atendimento", [r.w, id, atualizado.atendimento.revisao, atualizado.itens, atualizado.comercial.desconto_centavos, 0, ""]);
          assert.equal((await call("consultar_detalhes_atendimento", [r.w, id])).atendimento.valor_centavos, total, "Edição não aplica abatimento duas vezes");
          if (total > 0) {
            const titulo = await call("faturar_atendimento_servico", [r.w, id]);
            assert.equal(await one("select valor_centavos from public.titulos_financeiros where id=$1", [titulo]), total);
          }
        }
      }
      resultados.push({ perfil, modo, total, abatimento, passou: true });
    }
    if (!auto) {
      const id = randomUUID();
      await call("criar_atendimento_com_itens", [registros[perfil].w, id, { ...original.atendimento, situacao: "aprovado", valor_centavos: 0, dados: { documento: "ordem" }, taxa_diagnostico: { valor_centavos: 0, abater_na_aprovacao: true, vencimento: "" } }, [{ id: randomUUID(), tipo: "servico", descricao: "Serviço sem taxa", quantidade: 1, unidade: "un", preco_centavos: 10000, origem: "externa" }], 0]);
      const ordem = await call("consultar_detalhes_atendimento", [r.w, id]);
      assert.equal(ordem.atendimento.situacao, "aprovado");
      assert.equal(ordem.atendimento.valor_centavos, 10000);
      assert.equal(await call("consultar_taxa_diagnostico", [r.w, id, "servico"]), null);
      resultados.push({ perfil, modo: "os_sem_taxa", total: 10000, abatimento: 0, passou: true });
    }
    console.log("PASS", perfil, "taxa, manifestação, pagamento e revisão");
  }
  await mkdir("output/diagnostico-autorizacao-20261026", { recursive: true });
  await writeFile("output/diagnostico-autorizacao-20261026/banco.json", JSON.stringify(resultados, null, 2));
  await writeFile("output/diagnostico-autorizacao-20261026/comprovantes-qa.json", JSON.stringify(provas, null, 2));
  console.log("PASS", resultados.length, "fluxos completos");
} finally { await db.close(); }
