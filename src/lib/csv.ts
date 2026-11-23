/** CSV compatível com planilhas brasileiras, protegendo texto contra fórmulas. */
export function gerarCSV(linhas: readonly (readonly unknown[])[]): string {
  return (
    "\ufeff" +
    linhas
      .map((linha) =>
        linha
          .map(
            (valor) =>
              '"' +
              String(valor ?? "")
                .replace(/^[\s]*[=+@-]/, (prefixo) =>
                  /^-?\d+(?:[.,]\d+)?$/.test(String(valor)) ? prefixo : "'" + prefixo,
                )
                .replaceAll('"', '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n")
  );
}

export function baixarCSV(linhas: readonly (readonly unknown[])[], nome: string) {
  const url = URL.createObjectURL(
    new Blob([gerarCSV(linhas)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
