import "./EstadoCriacaoOS.css";

export function EstadoCriacaoOS({
  pronto,
  alterar,
  emCampo = false,
}: {
  pronto: boolean;
  alterar: (valor: boolean) => void;
  emCampo?: boolean;
}) {
  return (
    <section className="os-pronta-criacao">
      <h3>O serviço já está pronto?</h3>
      <div className="atendimento-opcoes">
        <label>
          <input
            type="radio"
            name="estado_criacao"
            checked={!pronto}
            onChange={() => alterar(false)}
          />
          Ainda não · seguir o atendimento normal
        </label>
        <label className="os-check">
          <input
            type="radio"
            name="estado_criacao"
            checked={pronto}
            onChange={() => alterar(true)}
          />
          Sim · salvar como pronto e imprimir
        </label>
      </div>
      <p className="texto-suave">
        {emCampo ? "Conclui o serviço." : "Deixa a OS pronta para retirada."} Antes de
        imprimir, você confere se o cliente já pagou ou vai pagar depois.
      </p>
    </section>
  );
}
