import { useState } from "react";
import { Link } from "react-router-dom";
import { documentosPublicos } from "../lib/configuracaoPublica";
import { lerDiagnosticos } from "../lib/diagnosticos";
import { useAcesso } from "../auth/contexto";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "../lib/rpc";
import { linkPublico } from "../lib/configuracaoPublica";
export function Ajuda() {
  const a = useAcesso();
  const suporte = useQuery({
    queryKey: ["suporte-empresa", a.usuario, a.oficina?.id],
    enabled: !!a.oficina && !a.demo && !a.segundoFatorExigido,
    queryFn: ({ signal }) =>
      rpc<{
        url: string;
        horarios: string;
        prazo_horas: string;
        responsavel: string;
      } | null>("consultar_suporte_empresa", { p_oficina: a.oficina!.id }, signal),
    retry: false,
  });
  const canal = linkPublico(suporte.data?.url) || documentosPublicos.suporte;
  const [aviso, setAviso] = useState("");
  async function copiar() {
    const dados = {
      versao: import.meta.env.VITE_RELEASE_ID || "local",
      navegadorConectado: navigator.onLine,
      ocorrencias: lerDiagnosticos(),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(dados, null, 2));
      setAviso("Diagnóstico copiado. Não inclui dados de clientes, senhas ou valores.");
    } catch {
      setAviso("O navegador não permitiu copiar. Tente novamente.");
    }
  }
  return (
    <main className="tela-acesso">
      <section className="cartao-acesso">
        <h1>Ajuda e suporte</h1>
        <p>
          Se uma operação não terminar, atualize a lista e confira se o registro foi
          salvo antes de tentar novamente.
        </p>
        <p>
          O histórico dos atendimentos, movimentos do estoque e contas financeiras ajuda
          a conferir o que aconteceu.
        </p>
        {canal ? (
          <a className="botao-primario" href={canal} target="_blank" rel="noreferrer">
            Falar com o suporte
          </a>
        ) : (
          <p>O canal de suporte será informado pelo responsável pela contratação.</p>
        )}
        {suporte.data?.horarios && <p>Atendimento: {suporte.data.horarios}</p>}
        {canal && suporte.data?.horarios && suporte.data.prazo_horas && (
          <p>
            Primeira resposta em até {suporte.data.prazo_horas} horas úteis de
            atendimento.
          </p>
        )}
        <button className="botao-secundario" onClick={() => void copiar()}>
          Copiar diagnóstico para o suporte
        </button>
        {aviso && <p role="status">{aviso}</p>}
        <p>Versão: {import.meta.env.VITE_RELEASE_ID || "desenvolvimento"}</p>
        <p>
          {documentosPublicos.termos && (
            <a href={documentosPublicos.termos} target="_blank" rel="noreferrer">
              Termos de uso
            </a>
          )}
          {documentosPublicos.termos && documentosPublicos.privacidade ? " · " : ""}
          {documentosPublicos.privacidade && (
            <a href={documentosPublicos.privacidade} target="_blank" rel="noreferrer">
              Privacidade
            </a>
          )}
        </p>
        <Link to="/">Voltar ao sistema</Link>
      </section>
    </main>
  );
}
