import { lazy, Suspense, useState } from "react";
import { MapPin } from "lucide-react";
import { DialogoLocalizacao as Dialogo } from "./localizacao/DialogoLocalizacao";
import { useAcesso } from "../auth/contexto";
import type { VinculoFisico } from "../lib/localizacaoFisica";
const Painel = lazy(() =>
  import("../pages/Localizacao").then((m) => ({ default: m.PainelLocalizacao })),
);
export function AtalhoLocalizacao({ tipo, id }: VinculoFisico) {
  const a = useAcesso();
  const [aberto, setAberto] = useState(false);
  if (!a.permite("work_orders")) return null;
  return (
    <>
      <button
        type="button"
        className="botao-secundario"
        onClick={() => setAberto(true)}
      >
        <MapPin size={18} /> Localização e etiquetas
      </button>
      {aberto && (
        <Dialogo
          aberto
          fechar={() => setAberto(false)}
          titulo="Localização e etiquetas"
          classe="dialogo-largo"
        >
          <Suspense fallback={<p role="status">Carregando localização…</p>}>
            <Painel vinculo={{ tipo, id }} />
          </Suspense>
        </Dialogo>
      )}
    </>
  );
}
