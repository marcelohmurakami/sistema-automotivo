import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { consultarIdentidade } from "../services/documentos";
import "./MarcaEmpresa.css";

export function MarcaEmpresa({ onClick }: { onClick?: () => void }) {
  const a = useAcesso();
  const [falha, setFalha] = useState("");
  const identidade = useQuery({
    queryKey: ["identidade", a.demo, a.oficina?.id],
    enabled: !!a.oficina,
    queryFn: ({ signal }) => consultarIdentidade(a.demo, a.oficina!.id, signal),
  });
  const nome = a.oficina?.nome || "Minha empresa";
  const logo = identidade.data?.logo || "";
  const chave = `${a.oficina?.id}:${logo}`;
  return (
    <Link
      to="/"
      className="marca-empresa"
      onClick={onClick}
      aria-label={`${nome}, início`}
    >
      {logo && falha !== chave ? (
        <img src={logo} alt={nome} onError={() => setFalha(chave)} />
      ) : (
        <span className="marca-empresa-nome">{nome}</span>
      )}
    </Link>
  );
}
