export type CapturaAtendimento = {
  placa: string | null;
  quilometragem: number | null;
  relato: string;
  itens: { descricao: string; tipo: "service" | "part"; quantidade: number }[];
};
export async function reduzirFoto(arquivo: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(arquivo.type) ||
    arquivo.size > 15_000_000
  )
    throw new Error("Escolha uma foto JPG, PNG ou WebP de até 15 MB.");
  const bmp = await createImageBitmap(arquivo);
  try {
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a imagem.");
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.8);
    if (data.length > 2_000_000)
      throw new Error(
        "Foto muito grande após compressão. Aproxime o detalhe que deseja registrar e fotografe novamente.",
      );
    return data;
  } finally {
    bmp.close();
  }
}
export function conferirCaptura(v: unknown): CapturaAtendimento {
  if (!v || typeof v !== "object") throw new Error("Resposta de captura inválida.");
  const d = v as Record<string, unknown>;
  if (
    typeof d.relato !== "string" ||
    d.relato.length > 4000 ||
    !Array.isArray(d.itens) ||
    d.itens.length > 30
  )
    throw new Error("Confira as informações extraídas.");
  const placa =
    d.placa == null
      ? null
      : String(d.placa)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
  if (placa && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa))
    throw new Error("Não foi possível ler a placa com segurança. Digite manualmente.");
  const km = d.quilometragem == null ? null : Number(d.quilometragem);
  if (km !== null && (!Number.isInteger(km) || km < 0 || km > 9999999))
    throw new Error("Quilometragem inválida. Confira o painel.");
  const itens = d.itens.map((i: unknown) => {
    if (!i || typeof i !== "object") throw new Error("Item inválido.");
    const x = i as Record<string, unknown>;
    if (
      typeof x.descricao !== "string" ||
      !x.descricao.trim() ||
      x.descricao.length > 300 ||
      !["service", "part"].includes(String(x.tipo)) ||
      typeof x.quantidade !== "number" ||
      x.quantidade <= 0 ||
      x.quantidade > 100000
    )
      throw new Error("Item da captura inválido.");
    return {
      descricao: x.descricao,
      tipo: x.tipo as "service" | "part",
      quantidade: x.quantidade,
    };
  });
  return { placa, quilometragem: km, relato: d.relato, itens };
}
