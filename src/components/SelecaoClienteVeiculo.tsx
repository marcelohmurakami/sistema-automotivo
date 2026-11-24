import { SelecaoRapida } from "./SelecaoRapida";
import { veiculoUnicoDoCliente } from "../lib/selecaoCliente";
import { unirOpcoesPorId } from "../lib/buscaSelecaoRapida";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { salvarCliente, normalizarTelefone } from "../services/clientes";
import { cadastrarVeiculoOrcamento, type Auxiliares } from "../services/orcamentos";
import { erroPublico } from "../lib/supabase";
import { useCadastrosOrcamento } from "../lib/useCadastrosOrcamento";
import { atualizarConsultas } from "../lib/atualizarConsultas";
export function SelecaoClienteVeiculo({
  aux,
  cliente,
  veiculo,
  selecionarCliente,
  selecionarVeiculo,
  aoProcessar,
  entradaLivreRetifica = false,
  permitirAvulso = false,
  dadosAvulsos,
  alterarAvulsos,
  campoAoLadoDoCliente,
  selecionarUnicoAoAbrir = false,
  focoInicial = true,
}: {
  focoInicial?: boolean;
  selecionarUnicoAoAbrir?: boolean;
  campoAoLadoDoCliente?: ReactNode;
  entradaLivreRetifica?: boolean;
  permitirAvulso?: boolean;
  dadosAvulsos?: { nome: string; telefone: string };
  alterarAvulsos?: (dados: { nome: string; telefone: string }) => void;
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
  const [novosClientes, setNovosClientes] = useState<Auxiliares["clientes"]>([]),
    [novosVeiculos, setNovosVeiculos] = useState<
      (Auxiliares["veiculos"][number] & { cliente_id: string })[]
    >([]);
  const avulso = cliente === "avulso";
  const [dadosLivres, setDadosLivres] = useState(
    dadosAvulsos ?? { nome: "", telefone: "" },
  );
  function atualizarLivre(campo: "nome" | "telefone", valor: string) {
    const novos = { ...dadosLivres, [campo]: valor };
    setDadosLivres(novos);
    alterarAvulsos?.(novos);
  }
  const retifica = acesso.oficina?.especialidade === "retifica";
  const consulta = useCadastrosOrcamento(aux, cliente, veiculo);
  const escolhaCliente = useRef(0);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);
  const iniciouSelecao = useRef(false);
  useEffect(() => {
    if (
      !selecionarUnicoAoAbrir ||
      iniciouSelecao.current ||
      !cliente ||
      cliente === "avulso" ||
      veiculo ||
      entradaLivreRetifica
    )
      return;
    iniciouSelecao.current = true;
    const escolha = ++escolhaCliente.current;
    if (acesso.demo) {
      const unico = veiculoUnicoDoCliente(cliente, aux.veiculos, aux.vinculos);
      if (unico) selecionarVeiculo(unico);
    } else {
      void consulta
        .carregarVeiculos(cliente)
        .then((veiculos) => {
          if (
            ativo.current &&
            escolha === escolhaCliente.current &&
            veiculos.length === 1
          )
            selecionarVeiculo(veiculos[0].id);
        })
        .catch(() => {
          /* O seletor mantém o erro e permite tentar novamente. */
        });
    }
  }, [
    selecionarUnicoAoAbrir,
    cliente,
    veiculo,
    entradaLivreRetifica,
    acesso.demo,
    aux,
    consulta,
    selecionarVeiculo,
  ]);
  const clientes = useMemo(
    () => unirOpcoesPorId(consulta.clientes, novosClientes),
    [consulta.clientes, novosClientes],
  );
  const carros = useMemo(() => {
    const ids = new Set(
      consulta.vinculos
        .filter((l) => l.cliente_id === cliente)
        .map((l) => l.veiculo_id),
    );
    return unirOpcoesPorId(
      consulta.veiculos.filter((v) => avulso || ids.has(v.id)),
      novosVeiculos.filter((v) => v.cliente_id === cliente),
    );
  }, [consulta.veiculos, consulta.vinculos, novosVeiculos, cliente, avulso]);
  const placasPorCliente = useMemo(() => {
    const placas = new Map(aux.veiculos.map((v) => [v.id, v.placa || ""]));
    const porCliente = new Map<string, string[]>();
    for (const v of aux.vinculos) {
      const lista = porCliente.get(v.cliente_id) ?? [];
      lista.push(placas.get(v.veiculo_id) || "");
      porCliente.set(v.cliente_id, lista);
    }
    return new Map([...porCliente].map(([id, lista]) => [id, lista.join(" ")]));
  }, [aux.veiculos, aux.vinculos]);
  function abrir(p: "cliente" | "veiculo") {
    ++escolhaCliente.current;
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
          throw new Error("Informe o nome do cliente com pelo menos 2 caracteres.");
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
          `${c.nome} cadastrado e selecionado. Agora informe ${entradaLivreRetifica ? "o carro e o motor" : "o veículo"}.`,
        );
        setPainel(entradaLivreRetifica ? null : "veiculo");
      } else if (painel === "veiculo") {
        if (!cliente || !modelo.trim())
          throw new Error("Selecione o cliente e informe o modelo do veículo.");
        const id = await cadastrarVeiculoOrcamento(
          acesso.demo,
          acesso.oficina!.id,
          cliente,
          modelo,
          placa,
        );
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
      await atualizarConsultas(
        cache,
        ["clientes", "aux-orcamento", "auxiliares-orcamento", "selecao-operacao"].map(
          (k) => [k],
        ),
        [],
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
        <SelecaoRapida
          rotulo="Cliente"
          valor={cliente}
          obrigatorio
          autoFocus={focoInicial && !cliente}
          placeholder="Nome, telefone ou placa…"
          aoBuscar={consulta.buscarCliente}
          carregando={consulta.carregandoClientes}
          erro={consulta.erroClientes ? erroPublico(consulta.erroClientes) : undefined}
          opcoes={[
            ...(permitirAvulso
              ? [{ id: "avulso", nome: "Informar cliente sem cadastrar" }]
              : []),
            ...clientes.map((c) => ({
              id: c.id,
              nome: c.nome,
              detalhe: c.telefone_e164 || undefined,
              busca: placasPorCliente.get(c.id) || "",
            })),
          ]}
          selecionar={(id) => {
            const escolha = ++escolhaCliente.current;
            selecionarCliente(id);
            selecionarVeiculo(
              entradaLivreRetifica
                ? ""
                : veiculoUnicoDoCliente(
                    id,
                    [...aux.veiculos, ...novosVeiculos],
                    [
                      ...aux.vinculos,
                      ...novosVeiculos.map((v) => ({
                        cliente_id: v.cliente_id,
                        veiculo_id: v.id,
                      })),
                    ],
                  ),
            );
            if (!acesso.demo && id && id !== "avulso" && !entradaLivreRetifica) {
              void consulta
                .carregarVeiculos(id)
                .then((v) => {
                  if (
                    ativo.current &&
                    escolha === escolhaCliente.current &&
                    v.length === 1
                  )
                    selecionarVeiculo(v[0].id);
                })
                .catch(() => {
                  /* O seletor exibe o erro e permite tentar novamente. */
                });
            }
            setAviso("");
          }}
        />
        {!avulso && campoAoLadoDoCliente}
        {!entradaLivreRetifica && (
          <SelecaoRapida
            rotulo={retifica ? "Motor, peça ou veículo" : "Veículo"}
            valor={veiculo}
            obrigatorio
            placeholder="Placa ou modelo…"
            aoBuscar={consulta.buscarVeiculo}
            carregando={consulta.carregandoVeiculos}
            erro={
              consulta.erroVeiculos ? erroPublico(consulta.erroVeiculos) : undefined
            }
            opcoes={[
              ...carros.map((v) => ({
                id: v.id,
                nome: (v.placa ? v.placa + " · " : "") + v.modelo,
              })),
              {
                id: "novo",
                nome: retifica
                  ? "Cadastrar motor ou peça…"
                  : "Digitar um novo veículo…",
              },
            ]}
            selecionar={(id) => {
              ++escolhaCliente.current;
              if (id === "novo") {
                selecionarVeiculo("");
                setPainel("veiculo");
                setErro("");
              } else selecionarVeiculo(id);
            }}
          />
        )}
      </div>
      {avulso && (
        <div className="dupla-campos">
          <label>
            Nome do cliente
            <input
              name="cliente_nome_livre"
              value={dadosLivres.nome}
              onChange={(e) => atualizarLivre("nome", e.target.value)}
              required
              minLength={2}
              maxLength={160}
              placeholder="Nome salvo somente neste atendimento"
            />
          </label>
          {campoAoLadoDoCliente}
          <label>
            Telefone (opcional)
            <input
              name="cliente_telefone_livre"
              value={dadosLivres.telefone}
              onChange={(e) => atualizarLivre("telefone", e.target.value)}
              type="tel"
              maxLength={30}
            />
          </label>
        </div>
      )}
      <div className="atalhos-cadastro">
        {permitirAvulso && !avulso && (
          <button
            type="button"
            onClick={() => {
              ++escolhaCliente.current;
              selecionarCliente("avulso");
              selecionarVeiculo("");
              setPainel(null);
            }}
          >
            Cliente sem cadastro
          </button>
        )}
        <button
          type="button"
          aria-expanded={painel === "cliente"}
          onClick={() => abrir("cliente")}
        >
          <Plus size={15} />
          Novo cliente
        </button>
        {!entradaLivreRetifica && (
          <button
            type="button"
            aria-expanded={painel === "veiculo"}
            onClick={() => abrir("veiculo")}
          >
            <Plus size={15} />
            {retifica ? "Novo motor / peça" : "Novo veículo"}
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
              : "Cadastro rápido de veículo"}
          </strong>
          <p className="texto-suave">
            {painel === "cliente"
              ? "Cadastre sem sair desta tela. Os dados do atendimento serão mantidos."
              : cliente
                ? "Informe o nome ou modelo. A placa é opcional."
                : "Você pode digitar o veículo agora. Selecione ou cadastre o cliente antes de salvar."}
          </p>
          <div className="dupla-campos">
            {painel === "cliente" ? (
              <>
                <label>
                  Nome do novo cliente
                  <input
                    autoFocus
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
                  {retifica
                    ? "Identificação do motor ou da peça"
                    : "Nome / modelo do veículo"}
                  <input
                    autoFocus
                    value={modelo}
                    placeholder="Ex.: Chevrolet Onix 1.0"
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
