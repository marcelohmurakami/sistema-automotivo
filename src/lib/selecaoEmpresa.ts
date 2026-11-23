export function chaveEmpresaUsuario(usuario: string | null, demo: boolean) {
  return demo
    ? "patio_empresa_demo"
    : usuario
      ? `patio_empresa_usuario:${usuario}`
      : null;
}
export function resolverEmpresa<T extends { id: string; padrao?: boolean }>(
  empresas: T[],
  selecionada: string,
) {
  return (
    empresas.find((e) => e.id === selecionada) ??
    empresas.find((e) => e.padrao) ??
    empresas[0] ??
    null
  );
}
