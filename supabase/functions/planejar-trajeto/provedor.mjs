// Sem nomes, telefones ou dados do atendimento nas chamadas ao provedor.
export function validarPedido(d) {
  if (!d || !/^[0-9a-f-]{36}$/i.test(d.oficina || "")) throw Error("Empresa inválida.");
  for (const campo of ["origem", "destino"]) {
    if (
      typeof d[campo] !== "string" ||
      d[campo].trim().length < 6 ||
      d[campo].length > 300
    )
      throw Error("Informe origem e destino completos, com cidade e estado.");
    const ponto = d[`${campo}_ponto`];
    if (
      ponto != null &&
      (!Array.isArray(ponto) ||
        ponto.length !== 2 ||
        !ponto.every(Number.isFinite) ||
        Math.abs(ponto[0]) > 180 ||
        Math.abs(ponto[1]) > 90)
    )
      throw Error("Localização inválida.");
  }
  if (typeof d.retorno !== "boolean")
    throw Error("Informe se haverá retorno ao ponto de partida.");
  return d;
}
export async function planejarTrajeto(entrada, { key, buscar = fetch, signal }) {
  const d = validarPedido(entrada);
  async function consultar(path, body) {
    const r = await buscar(`https://api.heigit.org${path}`, {
      method: body ? "POST" : "GET",
      signal,
      headers: { Authorization: key, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok)
      throw Error(
        r.status === 429 || r.status === 403
          ? "Limite do cálculo de trajetos atingido. Tente mais tarde ou informe os minutos manualmente."
          : "Não foi possível calcular este trajeto. Confira os endereços ou informe os minutos manualmente.",
      );
    return r.json();
  }
  async function localizar(campo) {
    if (d[`${campo}_ponto`]) return [{ ponto: d[`${campo}_ponto`], nome: d[campo] }];
    const params = new URLSearchParams({
      text: d[campo].trim(),
      size: "3",
      "boundary.country": "BR",
    });
    const json = await consultar(`/pelias/v1/search?${params}`);
    return (json.features || [])
      .filter(
        (f) =>
          f.geometry?.type === "Point" &&
          Array.isArray(f.geometry.coordinates) &&
          f.geometry.coordinates.length === 2 &&
          f.geometry.coordinates.every(Number.isFinite) &&
          typeof f.properties?.label === "string",
      )
      .slice(0, 3)
      .map((f) => ({
        ponto: f.geometry.coordinates,
        nome: f.properties.label.slice(0, 300),
      }));
  }
  const [origens, destinos] = await Promise.all([
    localizar("origem"),
    localizar("destino"),
  ]);
  if (!origens.length || !destinos.length)
    throw Error(
      "Endereço não localizado. Acrescente número, bairro, cidade e estado, ou informe o tempo manualmente.",
    );
  // O usuário confirma os pontos encontrados antes de reservar um trajeto.
  if (!d.origem_ponto || !d.destino_ponto)
    return { confirmar: true, origens, destinos };
  async function trecho(a, b) {
    const json = await consultar("/openrouteservice/v2/directions/driving-car/json", {
      coordinates: [a, b],
      instructions: false,
      geometry: false,
    });
    const s = json.routes?.[0]?.summary;
    if (
      !s ||
      !Number.isFinite(s.duration) ||
      !Number.isFinite(s.distance) ||
      s.duration < 0 ||
      s.distance < 0 ||
      s.duration > 43200 ||
      s.distance > 2000000
    )
      throw Error("Trajeto indisponível ou maior que 12 horas. Confira os endereços.");
    return {
      minutos: Math.max(1, Math.ceil(s.duration / 60)),
      metros: Math.round(s.distance),
    };
  }
  // A volta pode usar ruas diferentes; nunca presumir a mesma duração da ida.
  const [ida, volta] = await Promise.all([
    trecho(d.origem_ponto, d.destino_ponto),
    d.retorno ? trecho(d.destino_ponto, d.origem_ponto) : null,
  ]);
  return {
    confirmar: false,
    ida,
    volta,
    calculado_em: new Date().toISOString(),
    fonte: "openrouteservice",
  };
}
