// Bancada local: empresas, contas e operações inteiramente fictícias.
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
import { especialidades } from "../../src/lib/especialidades.ts";
import { novaFichaEspecialidade } from "../../src/lib/perfisAtendimento.ts";
import { cenariosEspecialidades } from "./cenarios-especialidades.mjs";

export const exemplosSubsistemas = {
  mecanica: ["Fiat Uno QA", "Revisão de freios", "Pastilha de freio"],
  retifica: ["Cabeçote AP QA", "Retífica de cabeçote", "Guia de válvula"],
  autoeletrica: ["Gol QA", "Diagnóstico do alternador", "Regulador de tensão"],
  autocenter: ["Onix QA", "Alinhamento e balanceamento", "Pneu"],
  borracharia: ["Celta QA", "Reparo de pneu", "Válvula de pneu"],
  estetica: ["Corolla QA", "Polimento da pintura", "Composto de polimento"],
  lava_rapido: ["Palio QA", "Lavagem completa", "Xampu automotivo"],
  troca_oleo: ["Sandero QA", "Troca de óleo e filtro", "Filtro de óleo"],
  acessorios: ["HB20 QA", "Instalação de câmera de ré", "Câmera de ré"],
  funilaria: ["Civic QA", "Pintura do para-lama", "Tinta automotiva"],
  assistencia_geral: ["Impressora QA", "Reparo da alimentação", "Fonte"],
  assistencia_celulares: ["Celular QA", "Troca de tela", "Tela de celular"],
  assistencia_informatica: ["Notebook QA", "Troca de SSD", "SSD"],
  assistencia_eletrodomesticos: [
    "Lavadora QA",
    "Reparo da drenagem",
    "Bomba de drenagem",
  ],
  assistencia_eletronica: ["Placa fonte QA", "Reparo da fonte", "Capacitor"],
  manutencao_climatizacao: ["Split QA", "Manutenção do split", "Tubo de cobre"],
  manutencao_eletrica: [
    "Quadro elétrico QA",
    "Manutenção do circuito",
    "Cabo elétrico",
  ],
  manutencao_hidraulica: ["Rede de água QA", "Reparo de vazamento", "Tubo PPR"],
  manutencao_equipamentos: [
    "Bomba industrial QA",
    "Manutenção preventiva da bomba",
    "Mangueira",
  ],
  manutencao_geral: ["Residência QA", "Reparo residencial", "Material de reparo"],
  limpeza_residencial: ["Apartamento QA", "Limpeza dos cômodos", "Detergente neutro"],
  limpeza_comercial: ["Escritório QA", "Limpeza das áreas comuns", "Desinfetante"],
  limpeza_pos_obra: ["Obra concluída QA", "Limpeza pós-obra", "Limpador de piso"],
  limpeza_estofados: ["Sofá QA", "Higienização do sofá", "Produto para tecido"],
  limpeza_vidros: ["Fachada QA", "Limpeza dos vidros", "Limpa-vidros"],
  limpeza_geral: ["Imóvel QA", "Limpeza conforme escopo", "Produto de limpeza"],
};

export async function criarCenarioSubsistemas({ realista = false } = {}) {
  const db = await criarBancoLocal("20261019000500");
  const ids = Object.fromEntries(
    [...Object.keys(especialidades), "customer", "stranger"].map((k) => [
      k,
      randomUUID(),
    ]),
  );
  const one = async (sql, args = []) =>
    Object.values((await db.query(sql, args)).rows[0])[0];
  const login = async (id = "", role = "authenticated") => {
    if (!["authenticated", "anon"].includes(role)) throw Error("Papel inválido");
    await db.exec("reset role");
    await one("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  };
  await db.exec(
    "alter table auth.users add column email text, add column email_confirmed_at timestamptz",
  );
  for (const [k, id] of Object.entries(ids))
    await db.query("insert into auth.users values($1,$2,now())", [
      id,
      k + "@subsistemas.test",
    ]);
  const empresas = {},
    registros = {};
  const hoje = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  for (const [perfil, e] of Object.entries(especialidades)) {
    await login(ids[perfil]);
    const call = (fn, args) =>
      one(`select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")})`, args);
    const w = await call("configurar_nova_empresa", [
      randomUUID(),
      "QA · " + e.nome,
      "",
      {},
      e.ramo,
      perfil,
    ]);
    empresas[perfil] = w;
    await db.exec("reset role");
    await db.query(
      "update public.assinaturas_oficina set codigo_plano='complete' where oficina_id=$1",
      [w],
    );
    await login(ids[perfil]);
    const [nome, servico, material] = exemplosSubsistemas[perfil];
    const cliente = await call("salvar_cliente", [
      w,
      {
        nome: "Cliente QA " + e.nome,
        email: "customer@subsistemas.test",
        telefone_e164: "+5511999999999",
      },
    ]);
    const produto = randomUUID(),
      funcionario = randomUUID(),
      recurso = randomUUID();
    await call("salvar_produto_estoque", [
      w,
      {
        descricao: material,
        unidade: "un",
        codigo: "QA-" + perfil,
        custo_centavos: 2000,
        preco_padrao_centavos: 5000,
      },
      produto,
    ]);
    await call("movimentar_estoque", [
      w,
      produto,
      "entrada",
      10,
      "Estoque fictício",
      randomUUID(),
      1,
    ]);
    await call("salvar_item_catalogo", [
      w,
      randomUUID(),
      {
        descricao: servico,
        tipo: "service",
        unidade: "un",
        preco_padrao_centavos: 10000,
      },
    ]);
    await call("salvar_funcionario", [
      w,
      funcionario,
      {
        nome: "Profissional QA",
        funcao: e.ramo === "limpeza" ? "Auxiliar de limpeza" : "Técnico",
        ativo: true,
      },
    ]);
    const ficha = novaFichaEspecialidade(perfil);
    if (realista) ficha.campos = { ...cenariosEspecialidades[perfil].entrada };
    let objeto, atendimento, proposta;
    if (e.ramo === "automotivo") {
      objeto = await call("cadastrar_veiculo_orcamento", [w, cliente.id, nome, null]);
      proposta = await call("salvar_orcamento", [
        w,
        {
          cliente_id: cliente.id,
          veiculo_id: objeto,
          tipo_servico: e.tipos[0],
          ficha_especialidade: ficha,
          observacoes: "Observação do cliente QA",
          condicoes: "",
          desconto_centavos: 0,
          itens: [
            {
              tipo: "service",
              descricao: servico,
              unidade: "un",
              quantidade: 1,
              preco_unitario_centavos: 10000,
            },
            ...(realista
              ? [
                  {
                    tipo: "part",
                    descricao: material,
                    unidade: "un",
                    quantidade: 1,
                    preco_unitario_centavos: perfil === "acessorios" ? 0 : 5000,
                  },
                ]
              : []),
          ],
        },
        randomUUID(),
      ]);
    } else {
      objeto = randomUUID();
      atendimento = randomUUID();
      await call("salvar_objeto_atendimento", [
        w,
        objeto,
        {
          cliente_id: cliente.id,
          nome,
          dados:
            e.ramo === "assistencia_tecnica"
              ? { marca: "Marca QA", modelo: "Modelo QA", serie: "SERIE-" + perfil }
              : { endereco: "Rua Fictícia, 123", contato: "Cliente QA" },
        },
      ]);
      await call("salvar_recurso_agenda", [w, recurso, "Profissional QA", true]);
      await call("salvar_atendimento_servico", [
        w,
        atendimento,
        {
          cliente_id: cliente.id,
          objeto_id: objeto,
          titulo: servico,
          situacao: "orcamento",
          valor_centavos: 15000,
          data_servico: hoje,
          vencimento: hoje,
          dados: {
            tipo_servico: e.tipos[0],
            observacoes_cliente: "Observação do cliente QA",
          },
          ficha_especialidade: ficha,
        },
      ]);
      let d = await call("consultar_detalhes_atendimento", [w, atendimento]);
      await call("salvar_itens_atendimento", [
        w,
        atendimento,
        d.atendimento.revisao,
        [
          {
            id: randomUUID(),
            tipo: "servico",
            descricao: servico,
            quantidade: 1,
            unidade: "un",
            preco_centavos: 10000,
            custo_centavos: 3000,
            origem: "externa",
          },
          {
            id: randomUUID(),
            tipo: "material",
            descricao: material,
            quantidade: 1,
            unidade: "un",
            preco_centavos: 5000,
            origem: "estoque",
            produto_id: produto,
          },
        ],
        0,
        0,
        "",
      ]);
    }
    await call("configurar_site", [
      w,
      {
        identificador_url: "qa-" + perfil.replaceAll("_", "-"),
        titulo: e.nome + " QA",
        descricao: "Serviços especializados de " + e.nome,
        publicado: true,
        portal_habilitado: true,
        pedidos_pecas_habilitados: true,
      },
    ]);
    await call("definir_acesso_portal", [w, cliente.id, "customer@subsistemas.test"]);
    registros[perfil] = {
      w,
      cliente: cliente.id,
      objeto,
      atendimento,
      proposta,
      produto,
      funcionario,
      recurso,
      hoje,
    };
  }
  return { db, ids, empresas, registros, office: empresas.mecanica, login };
}
