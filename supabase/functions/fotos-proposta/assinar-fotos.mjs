// Recebe somente os caminhos já autorizados por fotos_proposta_publica.
// Assina em lotes para não fazer uma ida ao Storage para cada fotografia.
export async function assinarFotos(fotos, bucket) {
  const caminhos = [...new Set(fotos.map((foto) => foto.caminho))];
  const links = new Map();
  for (let inicio = 0; inicio < caminhos.length; inicio += 100) {
    const lote = caminhos.slice(inicio, inicio + 100);
    const { data, error } = await bucket.createSignedUrls(lote, 60);
    if (error) throw error;
    for (const link of data || []) {
      if (link.error || !link.path || !link.signedUrl)
        throw Error("Não foi possível assinar uma das fotos.");
      links.set(link.path, link.signedUrl);
    }
    if (lote.some((caminho) => !links.has(caminho)))
      throw Error("A assinatura das fotos ficou incompleta.");
  }
  // A ordem da resposta do Storage não define a ordem ou a legenda da galeria.
  return fotos.map((foto) => ({
    legenda: foto.legenda,
    url: links.get(foto.caminho),
  }));
}
