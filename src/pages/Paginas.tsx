import { Link } from "react-router-dom";
import { ArrowLeft, CarFront } from "lucide-react";

export function PaginaNaoEncontrada() {
  return (
    <div className="estado-vazio pagina-404">
      <CarFront size={46} />
      <h1>Essa vaga está vazia.</h1>
      <p>A página que você procurou não foi encontrada.</p>
      <Link to="/" className="botao-primario">
        <ArrowLeft size={18} />
        Voltar para a oficina
      </Link>
    </div>
  );
}
