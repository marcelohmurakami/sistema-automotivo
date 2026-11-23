import { jsPDF } from "jspdf";
import type { DetalhesAtendimento } from "../types/servicosCompletos";
import type { Identidade } from "./documentos";
import { documentoAtendimento } from "../lib/documentoAtendimento.ts";
import { gerarPdfOrdemServico } from "./pdfOrdemServico.ts";
import { gerarPdfProposta } from "./pdfProposta.ts";
import { perfilAtendimento } from "../lib/perfisAtendimento.ts";
import { especialidades } from "../lib/especialidades.ts";
export function gerarPdfAtendimento(
  d: DetalhesAtendimento,
  empresa: Identidade,
  modo: "atendimento" | "orcamento" | "tecnica" = "atendimento",
) {
  return modo === "tecnica"
    ? gerarFichaTecnica(d, empresa)
    : modo === "orcamento"
      ? gerarPdfProposta(documentoAtendimento(d, empresa, modo))
      : gerarPdfOrdemServico(documentoAtendimento(d, empresa, modo), false);
}

function gerarFichaTecnica(d: DetalhesAtendimento, empresa: Identidade) {
  const pdf = new jsPDF(),
    a = d.atendimento;
  const assistencia =
    especialidades[a.ficha_especialidade?.especialidade || empresa.especialidade || ""]
      ?.ramo === "assistencia_tecnica";
  const manutencao =
    especialidades[a.ficha_especialidade?.especialidade || empresa.especialidade || ""]
      ?.ramo === "manutencao_campo";
  const limpeza =
    especialidades[a.ficha_especialidade?.especialidade || empresa.especialidade || ""]
      ?.ramo === "limpeza";
  const cor = /^#[0-9a-f]{6}$/i.test(empresa.cor || "") ? empresa.cor! : "#244336";
  let y = 23;
  function reservar(altura: number) {
    if (y + altura > 275) {
      pdf.addPage();
      pdf.setFillColor(cor);
      pdf.rect(15, 12, 180, 1, "F");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(90);
      pdf.text(
        `${empresa.nome.slice(0, 70)} · #${a.numero || a.id.slice(0, 8)}`,
        15,
        19,
      );
      pdf.setTextColor(35);
      y = 28;
      return true;
    }
    return false;
  }
  const linha = (texto: string, bold = false, tamanho = 9.5) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(tamanho);
    for (const l of pdf.splitTextToSize(texto || "—", 180) as string[]) {
      reservar(tamanho * 0.45 + 1.5);
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(tamanho);
      pdf.text(l, 15, y);
      y += tamanho * 0.45 + 1.5;
    }
  };
  pdf.setFillColor(cor);
  pdf.rect(15, 11, 180, 2, "F");
  pdf.setTextColor(35);
  if (empresa.logo) {
    try {
      const imagem = pdf.getImageProperties(empresa.logo);
      const escala = Math.min(32 / imagem.width, 18 / imagem.height);
      pdf.addImage(
        empresa.logo,
        163,
        18,
        imagem.width * escala,
        imagem.height * escala,
      );
    } catch {
      // A identificação em texto permanece disponível se uma imagem antiga falhar.
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  for (const nome of pdf.splitTextToSize(
    empresa.nome,
    empresa.logo ? 140 : 180,
  ) as string[]) {
    pdf.text(nome, 15, y);
    y += 8;
  }
  if (empresa.documento) linha(empresa.documento);
  if (empresa.telefone_e164 || empresa.telefone)
    linha(empresa.telefone_e164 || empresa.telefone!);
  const endereco = Object.values(empresa.endereco || {})
    .filter(Boolean)
    .join(" · ");
  if (endereco) linha(endereco, false, 9);
  y = Math.max(42, y + 4);
  pdf.setFillColor(241, 245, 242);
  pdf.roundedRect(15, y - 6, 180, 13, 2, 2, "F");
  linha(`FICHA TÉCNICA #${a.numero || a.id.slice(0, 8)}`, true, 14);
  y += 6;
  linha(`Cliente: ${d.cliente.nome}`, true);
  if (d.cliente.telefone) linha(`Telefone: ${d.cliente.telefone}`);
  linha(
    `${assistencia ? "Equipamento" : limpeza ? "Local do serviço" : "Equipamento / local"}: ${d.objeto.nome}`,
  );
  const tecnica = a.ficha_especialidade;
  if (
    tecnica?.especialidade === "assistencia_eletrodomesticos" &&
    tecnica.campos.modalidade === "Domicílio"
  ) {
    linha("Modalidade: atendimento no domicílio");
    const localVisita = tecnica.campos.endereco_visita || d.objeto.dados.endereco;
    if (localVisita) linha(`Endereço da visita: ${localVisita}`);
  }
  if (limpeza) {
    const c = tecnica?.campos || {};
    if (c.endereco_visita || d.objeto.dados.endereco)
      linha(`Endereço do serviço: ${c.endereco_visita || d.objeto.dados.endereco}`);
    for (const [id, nome] of [
      ["area", "Área contratada (m²)"],
      ["ambientes", "Ambientes incluídos"],
      ["frequencia", "Frequência"],
      ["base_cobranca", "Contratação"],
      ["exclusoes", "Não incluído"],
      ["pecas", "Bens a higienizar"],
      ["tipo_bem", "Bem a higienizar"],
      ["quantidade_lugares", "Lugares / unidades"],
      ["modalidade", "Local da higienização"],
    ])
      if (c[id])
        linha(
          `${nome}: ${id === "area" ? Number(c[id]).toLocaleString("pt-BR") : c[id]}`,
        );
    if (a.dados.solicitacao) linha(`Escopo: ${a.dados.solicitacao}`);
  }
  if (manutencao) {
    const c = tecnica?.campos || {};
    if (c.endereco_visita || d.objeto.dados.endereco)
      linha(`Local do serviço: ${c.endereco_visita || d.objeto.dados.endereco}`);
    if (c.ativo || d.objeto.dados.serie)
      linha(`Ativo / identificação: ${c.ativo || d.objeto.dados.serie}`);
  }
  const identificacao = tecnica?.campos.identificacao || d.objeto.dados.serie;
  if (assistencia && identificacao)
    linha(
      `${tecnica?.especialidade === "assistencia_celulares" ? "IMEI / série" : "Série / identificação"}: ${identificacao}`,
    );
  if (
    tecnica?.especialidade === "assistencia_celulares" &&
    tecnica.campos.imei_secundario
  )
    linha(`Segundo IMEI: ${tecnica.campos.imei_secundario}`);
  if (
    tecnica?.especialidade === "assistencia_eletrodomesticos" &&
    tecnica.campos.codigo_produto
  )
    linha(`Código do produto / PNC: ${tecnica.campos.codigo_produto}`);
  if (tecnica?.especialidade === "assistencia_eletronica") {
    if (tecnica.campos.placa) linha(`Placa: ${tecnica.campos.placa}`);
    if (tecnica.campos.revisao_placa) linha(`Revisão: ${tecnica.campos.revisao_placa}`);
  }
  linha(
    `Data do serviço: ${(a.data_servico || a.vencimento).split("-").reverse().join("/")}`,
  );
  linha(a.titulo, true, 12);
  y += 4;
  const rotulos: Record<string, string> = {
    marca: "Marca",
    modelo: "Modelo",
    serie: "Série / identificação",
    acessorios: "Acessórios recebidos",
    condicao: "Condição de entrada",
    endereco: "Endereço do cadastro",
    area: "Área (m²)",
    contato: "Contato no local",
    acesso: "Orientações de acesso",
    equipamento: "Equipamento / instalação",
    ambientes: "Ambientes",
  };
  for (const [k, v] of Object.entries(d.objeto.dados))
    if (v) linha(`${rotulos[k] || k}: ${v}`);
  const notas = [
    ["solicitacao", limpeza ? "Escopo da limpeza" : "Solicitação / defeito relatado"],
    ["diagnostico", "Diagnóstico complementar"],
    ["execucao", "Serviços realizados"],
    [
      "materiais",
      limpeza ? "Produtos e materiais registrados" : "Peças e materiais registrados",
    ],
    ["garantia", "Condições de garantia"],
    ["orientacoes", "Orientações"],
    ["restricoes", "Restrições e cuidados"],
    ["detalhes_especialidade", "Detalhes complementares"],
    ["checklist", "Checklist complementar"],
    ["conferencia", "Conferência / aceite"],
    ["observacoes_cliente", "Observações para o cliente"],
  ];
  for (const [k, nome] of notas) if (a.dados[k]) linha(`${nome}: ${a.dados[k]}`);
  const ficha = a.ficha_especialidade;
  if (ficha) {
    const perfil = perfilAtendimento(ficha.especialidade);
    linha(perfil.nome, true, 13);
    if (ficha.etapa) linha(`Etapa: ${ficha.etapa}`);
    for (const g of perfil.grupos) {
      const preenchidos = g.campos.filter((c) => ficha.campos[c.id]);
      if (!preenchidos.length) continue;
      y += 4;
      linha(g.nome, true);
      for (const c of preenchidos) {
        const valor = c.rotulosOpcoes?.[ficha.campos[c.id]] || ficha.campos[c.id];
        linha(
          `${c.nome}: ${c.tipo === "data" ? valor.split("-").reverse().join("/") : valor}${c.unidade ? ` ${c.unidade}` : ""}`,
        );
      }
    }
    const marcados = Object.entries(ficha.checklist).filter(([, v]) => v);
    if (marcados.length) {
      y += 4;
      linha("Conferências registradas", true);
      for (const [c] of marcados) linha(`- ${c}`);
    }
  }
  y += 5;
  linha("Responsável: ____________________________________");
  if (empresa.rodape) {
    y += 4;
    linha(empresa.rodape, false, 9);
  }
  for (let p = 1; p <= pdf.getNumberOfPages(); p++) {
    pdf.setPage(p);
    pdf.setDrawColor(210);
    pdf.line(15, 284, 195, 284);
    pdf.setTextColor(95);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("Ficha de acompanhamento técnico", 15, 290);
    pdf.text(`${p} / ${pdf.getNumberOfPages()}`, 195, 290, { align: "right" });
  }
  return pdf;
}
