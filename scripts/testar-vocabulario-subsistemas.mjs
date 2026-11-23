import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { especialidades } from "../src/lib/especialidades.ts";
import { interfaceRamo, vocabularioEstoque } from "../src/lib/interfaceRamo.ts";
import { menuAssistencia } from "../src/lib/navegacaoAssistencia.ts";
import { novaFichaEspecialidade } from "../src/lib/perfisAtendimento.ts";
import { gerarPdfAtendimento } from "../src/services/pdfAtendimento.ts";

const esperados = {
  mecanica: /freios|revisão/i,
  retifica: /cabeçote|retífica/i,
  autoeletrica: /alternador|carga/i,
  autocenter: /alinhamento|balanceamento/i,
  borracharia: /pneu/i,
  estetica: /polimento/i,
  lava_rapido: /lavagem/i,
  troca_oleo: /óleo/i,
  acessorios: /instalação/i,
  funilaria: /pintura/i,
  assistencia_geral: /equipamento/i,
  assistencia_celulares: /tela|toque/i,
  assistencia_informatica: /SSD|sistema/i,
  assistencia_eletrodomesticos: /lavagem|lavadora/i,
  assistencia_eletronica: /fonte|bancada/i,
  manutencao_climatizacao: /split/i,
  manutencao_eletrica: /circuito/i,
  manutencao_hidraulica: /vazamento/i,
  manutencao_equipamentos: /bomba/i,
  manutencao_geral: /residencial/i,
  limpeza_residencial: /cozinha|quartos/i,
  limpeza_comercial: /áreas comuns|sanitários/i,
  limpeza_pos_obra: /obra|resíduos/i,
  limpeza_estofados: /sofá|tapete/i,
  limpeza_vidros: /vidros|fachada/i,
  limpeza_geral: /ambientes|escopo/i,
};
for (const [ramo, plural] of [
  ["automotivo", "peças"],
  ["assistencia_tecnica", "peças"],
  ["manutencao_campo", "materiais"],
  ["limpeza", "produtos"],
]) {
  assert.equal(vocabularioEstoque(ramo).plural, plural);
}
const menuLimpeza = menuAssistencia(() => true, "owner", "", false, true);
assert.doesNotMatch(
  menuLimpeza.map((x) => x.nome).join(" "),
  /assistência|reparo|equipamento|peças/i,
);
assert(menuLimpeza.some((x) => x.nome === "Locais de atendimento"));
assert(menuLimpeza.some((x) => x.nome === "Compras" && x.rota === "/compras"));
const menuColaborador = menuAssistencia(() => true, "staff", "", false, true);
assert(
  !menuColaborador.some((x) =>
    ["/financeiro", "/funcionarios", "/equipe"].includes(x.rota),
  ),
);
assert(
  !menuAssistencia((x) => x !== "inventory", "owner", "", false, true).some(
    (x) => x.rota === "/compras",
  ),
);
assert.equal(
  menuAssistencia(() => true, "owner", "locais", false, true)[0].rota,
  "/objetos",
);
for (const [id, e] of Object.entries(especialidades)) {
  const ui = interfaceRamo(e.ramo, id);
  assert.match(ui.exemploServico, esperados[id], id);
  if (e.ramo !== "automotivo")
    assert.doesNotMatch(ui.exemploServico, /alinhamento|pneu|direção/i, id);
  if (e.ramo === "limpeza") {
    assert.doesNotMatch(
      ui.agendaDescricao + " " + ui.operacaoDescricao,
      /diagnóstico|reparo|retirada|bancada/i,
      id,
    );
    const ficha = novaFichaEspecialidade(id);
    const pdf = gerarPdfAtendimento(
      {
        atendimento: {
          id: "qa",
          numero: 1,
          titulo: "Limpeza contratada",
          valor_centavos: 15000,
          data_servico: "2026-10-19",
          vencimento: "2026-10-19",
          dados: { observacoes_cliente: "Conferir os ambientes contratados" },
          ficha_especialidade: ficha,
        },
        cliente: { nome: "Cliente QA" },
        objeto: {
          nome: "Local QA",
          dados: { endereco: "Rua Ficticia 123, unidade 4" },
        },
        itens: [
          {
            descricao: "Servico contratado",
            quantidade: 1,
            unidade: "un",
            preco_centavos: 15000,
          },
        ],
        comercial: { desconto_centavos: 0 },
      },
      { nome: "Empresa QA", especialidade: id },
    );
    const texto = pdf.output();
    assert.match(texto, /Local do servi/);
    assert.match(texto, /Rua Ficticia 123, unidade 4/);
    assert.doesNotMatch(texto, /Equipamento \/ local|IMEI|PNC|Diagn.stico do reparo/);
    if (process.env.PDF_QA_OUTPUT) {
      await mkdir(process.env.PDF_QA_OUTPUT, { recursive: true });
      await writeFile(
        resolve(process.env.PDF_QA_OUTPUT, id + ".pdf"),
        Buffer.from(pdf.output("arraybuffer")),
      );
    }
  }
}
for (const id of ["assistencia_celulares", "assistencia_informatica"]) {
  const ui = interfaceRamo("assistencia_tecnica", id);
  assert.doesNotMatch(
    JSON.stringify(ui),
    /lavadora|geladeira|ciclo de lavagem|mangueiras|PMOC|pneu/i,
    id,
  );
}
assert.equal(interfaceRamo("automotivo").exemploServico, "Alinhamento da direção");
assert.doesNotMatch(
  interfaceRamo("limpeza").exemploServico,
  /estofado/i,
  "Perfil geral não presume estofados",
);
console.log(
  "PASS vocabulário dos 26 perfis, separação de celulares/informática e endereço nos seis comprovantes de limpeza",
);
