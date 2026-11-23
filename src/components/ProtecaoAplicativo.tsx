import { Component, useEffect, useState, type ReactNode } from "react";
import { registrarDiagnostico } from "../lib/diagnosticos";

export class ProtecaoAplicativo extends Component<
  { children: ReactNode },
  { falhou: boolean }
> {
  state = { falhou: false };
  static getDerivedStateFromError() {
    return { falhou: true };
  }
  componentDidCatch(erro: unknown) {
    registrarDiagnostico("tela", erro);
  }
  render() {
    if (this.state.falhou)
      return (
        <main className="tela-acesso">
          <section className="cartao-acesso" role="alert">
            <h1>Não conseguimos abrir esta tela.</h1>
            <p>
              Recarregue a página para tentar novamente. Se você estava salvando algo,
              confira o histórico antes de repetir a operação.
            </p>
            <button className="botao-primario" onClick={() => window.location.reload()}>
              Recarregar
            </button>
            <a href="/">Voltar para o início</a>
            <a href="/ajuda">Ajuda e diagnóstico</a>
          </section>
        </main>
      );
    return this.props.children;
  }
}

export function AvisoConexao() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);
  return online ? null : (
    <div role="alert" className="aviso-conexao">
      Sem conexão. <a href="/execucao-offline">Continue na área sem internet</a> e envie
      as pendências quando a conexão voltar.
    </div>
  );
}
