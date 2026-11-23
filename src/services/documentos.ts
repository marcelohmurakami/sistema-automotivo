import { rpc } from "../lib/rpc";

import type { ItemProposta } from "./orcamentos";
export type Identidade = {
  nome: string;
  documento?: string;
  pix_qr?: string;
  especialidade?: string;
  telefone?: string;
  telefone_e164?: string | null;
  endereco?: Record<string, string>;
  cor?: string;
  logo?: string;
  rodape?: string;
};
export type DetalhesNotinha = {
  data_servico?: string;
  vencimento?: string;
  veiculo?: string;
  motor?: string;
  forma_pagamento?: string;
  empresa_cliente?: string;
  documento_cliente?: string;
  assinatura?: "recebimento" | "pendente";
  pix_copia_cola?: string;
};
export type Notinha = {
  detalhes?: DetalhesNotinha;
  id: string;
  cliente_id?: string;
  numero: number;
  situacao: string;
  emitido_em: string;
  dados_cliente: {
    nome: string;
    telefone_e164?: string | null;
    endereco?: string;
  };
  dados_oficina: Identidade;
  itens: ItemProposta[];
  subtotal_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  observacoes: string;
};
export async function consultarIdentidade(
  demo: boolean,
  oficina: string,
  signal?: AbortSignal,
): Promise<Identidade> {
  if (demo)
    return JSON.parse(
      localStorage.getItem(`patio_identidade_demo:${oficina}`) ||
        JSON.stringify({
          nome:
            oficina === "demo-assistencia_tecnica"
              ? "Assistência técnica · Demonstração"
              : "Oficina demonstração",
          cor: "#244336",
          rodape: "",
        }),
    );
  return rpc<Identidade>("consultar_identidade", { p_oficina: oficina }, signal);
}
export async function salvarIdentidade(
  demo: boolean,
  oficina: string,
  dados: Identidade,
) {
  if (demo) {
    localStorage.setItem(`patio_identidade_demo:${oficina}`, JSON.stringify(dados));
    return;
  }
  await rpc("salvar_identidade", { p_oficina: oficina, p_dados: dados });
}
export async function prepararLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw new Error("Escolha um PNG ou JPG de até 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const logo = canvas.toDataURL("image/jpeg", 0.8);
    if (logo.length > 160000) throw new Error("Escolha um logo mais simples.");
    return logo;
  } finally {
    bitmap.close();
  }
}

export async function prepararQrPix(file: File) {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw new Error("Escolha um PNG ou JPG de até 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    if (data.length > 1000000)
      throw new Error("Envie uma imagem recortada apenas no QR Code.");
    return data;
  } finally {
    bitmap.close();
  }
}
