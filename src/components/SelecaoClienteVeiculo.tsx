import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { salvarCliente, normalizarTelefone } from "../services/clientes";
import { rpc, type Auxiliares } from "../services/orcamentos";
import { erroPublico } from "../lib/supabase";
export function SelecaoClienteVeiculo({
  aux,
  cliente,
  veiculo,
  selecionarCliente,
  selecionarVeiculo,
  aoProcessar,
}: {
  aux: Auxiliares;
  cliente: string;
  veiculo: string;
  selecionarCliente: (id: string) => void;
  selecionarVeiculo: (id: string) => void;
  aoProcessar: (ocupado: boolean) => void;
}) {
  const acesso = useAcesso(),
    cache = useQueryClient(),
    salvando = useRef(false);
  const [painel, setPainel] = useState<"cliente" | "veiculo" | null>(null),
    [nome, setNome] = useState(""),
    [telefone, setTelefone] = useState(""),
    [modelo, setModelo] = useState(""),
    [placa, setPlaca] = useState(""),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [ocupado, setOcupado] = useState(false);
  const [novosClientes, setNovosClientes] = useState<Auxiliares["clientes"]>(
      [],
    ),
    [novosVeiculos, setNovosVeiculos] = useState<
      (Auxiliares["veiculos"][number] & { cliente_id: string })[]
    >([]);
  const clientes = [
    ...aux.clientes,
    ...novosClientes.filter((c) => !aux.clientes.some((a) => a.id === c.id)),
  ];
  const carros = [
    ...aux.veiculos.filter((v) =>
      aux.vinculos.some(
        (l) => l.cliente_id === cliente && l.veiculo_id === v.id,
      ),
    ),
    ...novosVeiculos.filter(
      (v) =>
        v.cliente_id === cliente && !aux.veiculos.some((a) => a.id === v.id),
    ),
  ];
  function abrir(p: "cliente" | "veiculo") {
    setPainel(painel === p ? null : p);
    setErro("");
    setAviso("");
  }
  async function cadastrar() {
    if (salvando.current) return;
    setErro("");
    setAviso("");
    salvando.current = true;
    setOcupado(true);
    aoProcessar(true);
    try {
      if (painel === "cliente") {
        if (nome.trim().length < 2)
          throw new Error(
            "Informe o nome do cliente com pelo menos 2 caracteres.",
          );
        const c = await salvarCliente(acesso.demo, acesso.oficina!.id, {
          nome: nome.trim(),
          telefone_e164: normalizarTelefone(telefone),
          email: "",
          tipo: "pessoa_fisica",
          endereco: "",
          observacoes: "",
        });
        setNovosClientes((v) => [...v, c]);
        selecionarCliente(c.id);
        selecionarVeiculo("");
        setNome("");
        setTelefone("");
        setAviso(
          `${c.nome} cadastrado e selecionado. Agora informe o veículo.`,
        );
        setPainel(acesso.demo ? null : "veiculo");
      } else if (painel === "veiculo") {
        if (!cliente || !modelo.trim())
          throw new Error("Selecione o cliente e informe o modelo do veículo.");
        const id = await rpc<string>("cadastrar_veiculo_orcamento", {
          p_oficina: acesso.oficina!.id,
          p_cliente: cliente,
          p_modelo: modelo.trim(),
          p_placa: placa,
        });
        setNovosVeiculos((v) => [
          ...v,
          {
            id,
            cliente_id: cliente,
            modelo: modelo.trim(),
            placa: placa || null,
            marca: null,
            ano_modelo: null,
          },
        ]);
        selecionarVeiculo(id);
        setModelo("");
        setPlaca("");
        setPainel(null);
        setAviso("Veículo cadastrado e selecionado.");
      }
      await Promise.allSettled(
        ["clientes", "aux-orcamento", "auxiliares-orcamento"].map((k) =>
          cache.invalidateQueries({ queryKey: [k] }),
        ),
      );
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      salvando.current = false;
      setOcupado(false);
      aoProcessar(false);
    }
  }
  return (
    <>
      <div className="dupla-campos">
        <label>
          Cliente
          <select
            required
            value={cliente}
            onChange={(e) => {
              selecionarCliente(e.target.value);
              selecionarVeiculo("");
              setAviso("");
            }}
          >
            <option value="">Selecione o cliente</option>
            {clientes.map((c) => (
              <option value={c.id} key={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Veículo
          <select
            required
            value={veiculo}
            onChange={(e) => selecionarVeiculo(e.target.value)}
          >
            <option value="">Selecione o veículo</option>
            {carros.map((v) => (
              <option key={v.id} value={v.id}>
                {v.placa ? `${v.placa} · ` : ""}
                {v.modelo}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="atalhos-cadastro">
        <button
          type="button"
          aria-expanded={painel === "cliente"}
          onClick={() => abrir("cliente")}
        >
          <Plus size={15} />
          Novo cliente
        </button>
        {!acesso.demo && (
          <button
            type="button"
            disabled={!cliente}
            aria-expanded={painel === "veiculo"}
            onClick={() => abrir("veiculo")}
          >
            <Plus size={15} />
            Novo veículo
          </button>
        )}
      </div>
      {aviso && (
        <p className="aviso-cliente" role="status">
          {aviso}
        </p>
      )}
      {painel && (
        <div
          className="cadastro-inline"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
              e.preventDefault();
              e.stopPropagation();
              void cadastrar();
            }
          }}
        >
          <strong>
            {painel === "cliente"
              ? "Cadastro rápido de cliente"
              : "Veículo do cliente selecionado"}
          </strong>
          <p className="texto-suave">
            {painel === "cliente"
              ? "Cadastre sem sair desta tela. Os dados do atendimento serão mantidos."
              : "Adicione o veículo para continuar o atendimento."}
          </p>
          <div className="dupla-campos">
            {painel === "cliente" ? (
              <>
                <label>
                  Nome do novo cliente
                  <input
                    autoComplete="name"
                    value={nome}
                    maxLength={160}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </label>
                <label>
                  Telefone com DDD (opcional)
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={telefone}
                    maxLength={24}
                    onChange={(e) => setTelefone(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Modelo
                  <input
                    value={modelo}
                    maxLength={100}
                    onChange={(e) => setModelo(e.target.value)}
                  />
                </label>
                <label>
                  Placa (opcional)
                  <input
                    value={placa}
                    maxLength={8}
                    onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  />
                </label>
              </>
            )}
          </div>
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <div className="atalhos-cadastro">
            <button
              className="botao-secundario"
              type="button"
              disabled={ocupado}
              onClick={() => void cadastrar()}
            >
              {ocupado ? "Cadastrando…" : "Cadastrar e selecionar"}
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                setPainel(null);
                setErro("");
              }}
            >
              Cancelar cadastro
            </button>
          </div>
        </div>
      )}
    </>
  );
}
