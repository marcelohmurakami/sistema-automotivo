import "./EstadoCriacaoOS.css";

export function EstadoCriacaoOS({
  pronto,
  alterar,
}: {
  pronto: boolean;
  alterar: (valor: boolean) => void;
}) {
  return (
    <label className="os-pronta-criacao">
      <input
        type="checkbox"
        name="estado_criacao"
        checked={pronto}
        onChange={(e) => alterar(e.target.checked)}
      />
      <span>O serviço já está pronto para entrega</span>
    </label>
  );
}
