export function Paginacao({
  pagina,
  total,
  mudar,
}: {
  pagina: number;
  total: number;
  mudar: (p: number) => void;
}) {
  return (
    <div className="compra-paginacao">
      <span>
        {total} registro(s) · Página {pagina + 1}
      </span>
      <button
        type="button"
        className="botao-secundario"
        disabled={!pagina}
        onClick={() => mudar(pagina - 1)}
      >
        Anterior
      </button>
      <button
        type="button"
        className="botao-secundario"
        disabled={(pagina + 1) * 30 >= total}
        onClick={() => mudar(pagina + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
