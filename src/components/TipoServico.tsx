import { useState, type ReactNode } from "react";
import {
  Wrench,
  Cog,
  CircuitBoard,
  ClipboardCheck,
  Disc3,
  BatteryCharging,
  Zap,
  Lightbulb,
  CircleDot,
  Crosshair,
  Droplet,
  Droplets,
  Sparkles,
  SprayCan,
  Plug,
  Hammer,
  Paintbrush,
  Smartphone,
  Laptop,
  Refrigerator,
  Code,
  Snowflake,
  House,
  Building2,
  HardHat,
  Sofa,
  PanelsTopLeft,
  CircleHelp,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import {
  especialidades,
  especialidadePadrao,
  tiposDaEspecialidade,
  tiposServico,
  type TipoServico,
} from "../lib/especialidades";
import "./TipoServico.css";

const icones = {
  ferramenta: Wrench,
  engrenagem: Cog,
  circuito: CircuitBoard,
  check: ClipboardCheck,
  disco: Disc3,
  bateria: BatteryCharging,
  raio: Zap,
  lampada: Lightbulb,
  pneu: CircleDot,
  alvo: Crosshair,
  gota: Droplet,
  agua: Droplets,
  brilho: Sparkles,
  spray: SprayCan,
  plugue: Plug,
  martelo: Hammer,
  pincel: Paintbrush,
  celular: Smartphone,
  computador: Laptop,
  geladeira: Refrigerator,
  codigo: Code,
  frio: Snowflake,
  casa: House,
  predio: Building2,
  capacete: HardHat,
  sofa: Sofa,
  janela: PanelsTopLeft,
};
const desenhos: Record<string, string> = {
  motor: "M3 8h4l3-3h7v3h3v4h2v7h-5l-2-2H7v-3H3Z M10 2h6 M13 2v3 M1 8v6",
  cabecote: "M3 7h18v10H3Z M5 4h14 M7 4v3 M17 4v3 M7 10v4 M12 10v4 M17 10v4 M5 20h14",
  pistao: "M6 3h12v7H6Z M6 6h12 M10 10v7 M14 10v7 M15 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  virabrequim: "M2 10h4v7h4V7h4v10h4v-7h4 M2 7v6 M22 7v6 M8 17v4 M16 17v4",
  bloco: "M3 5h18v15H3Z M7 8v8 M12 8v8 M17 8v8 M1 10h2 M21 10h2",
  suspensao: "M12 2v3 M7 5h10l-10 4 10 4-10 4h10 M12 17v5",
};
export function IconeTipoServico({
  tipo,
  legenda = false,
}: {
  tipo?: string | null;
  legenda?: boolean;
}) {
  const config = tiposServico[tipo as TipoServico];
  const nome = config?.[0] || "Tipo não informado";
  const simbolo = config?.[1] || "";
  const Icone = icones[simbolo as keyof typeof icones] || CircleHelp;
  return (
    <span className="tipo-servico-selo" title={nome} role="img" aria-label={nome}>
      {desenhos[simbolo] ? (
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={desenhos[simbolo]} />
        </svg>
      ) : (
        <Icone size={30} strokeWidth={1.7} aria-hidden="true" />
      )}
      {legenda && <span aria-hidden="true">{nome}</span>}
    </span>
  );
}
export function CampoTipoServico({
  inicial = "",
  aoAlterar,
  especialidade: perfil,
  children,
}: {
  inicial?: string | null;
  aoAlterar?: (tipo: string) => void;
  especialidade?: string;
  children?: ReactNode;
}) {
  const a = useAcesso();
  const especialidade =
    perfil || a.oficina?.especialidade || especialidadePadrao(a.oficina?.ramo);
  const opcoes = tiposDaEspecialidade(especialidade);
  const [valor, setValor] = useState(inicial || "");
  return (
    <details
      className="os-detalhes"
      onInvalidCapture={(e) => {
        e.currentTarget.open = true;
      }}
    >
      <summary>Identificação visual do serviço (opcional)</summary>
      <fieldset
        className="tipo-servico-campo"
        aria-label="Identificação visual do serviço"
      >
        <p>
          Se quiser, escolha o serviço principal. Sem identificação, o símbolo será “?”.
        </p>
        <div className="tipos-servico-opcoes">
          <label className={valor === "" ? "selecionado" : ""}>
            <input
              type="radio"
              name="tipo_servico"
              value=""
              checked={valor === ""}
              onChange={() => {
                setValor("");
                aoAlterar?.("");
              }}
            />
            <IconeTipoServico legenda />
          </label>
          {Array.from(
            new Set([
              ...opcoes,
              ...(inicial && tiposServico[inicial as TipoServico]
                ? [inicial as TipoServico]
                : []),
            ]),
          ).map((id) => (
            <label key={id} className={valor === id ? "selecionado" : ""}>
              <input
                type="radio"
                name="tipo_servico"
                value={id}
                checked={valor === id}
                onChange={() => {
                  setValor(id);
                  aoAlterar?.(id);
                }}
              />
              <IconeTipoServico tipo={id} legenda />
            </label>
          ))}
        </div>
      </fieldset>
      {children}
    </details>
  );
}

export function CampoDetalhesServico({
  observacoes = "",
  aoAlterar,
  especialidade: perfil,
}: {
  observacoes?: string;
  aoAlterar?: (texto: string) => void;
  especialidade?: string;
}) {
  const a = useAcesso();
  const especialidade =
    perfil || a.oficina?.especialidade || especialidadePadrao(a.oficina?.ramo);
  return (
    <label>
      Detalhes específicos do serviço (opcional)
      <textarea
        name="detalhes_especialidade"
        maxLength={3000}
        defaultValue={observacoes}
        onChange={(e) => aoAlterar?.(e.target.value)}
        placeholder={especialidades[especialidade]?.orientacao}
        rows={3}
      />
    </label>
  );
}
