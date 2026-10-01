import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
export function FotosPropostaPublica({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ["fotos-proposta-publica", token],
    queryFn: async () => {
      const { data, error } = await supabase!.functions.invoke(
        "fotos-proposta",
        { body: { token } },
      );
      if (error) throw error;
      return data.fotos as { legenda: string; url: string }[];
    },
    retry: false,
    refetchInterval: 45000,
    gcTime: 0,
  });
  return (
    <section>
      <h3>Fotos anexadas</h3>
      {q.isError ? (
        <p>
          Não foi possível carregar as fotos. Peça à oficina para verificar o
          acesso.
        </p>
      ) : q.isPending ? (
        <p>Carregando fotos…</p>
      ) : q.data?.length ? (
        <div className="documentos-grade">
          {q.data.map((f, i) => (
            <figure key={i}>
              <img
                src={f.url}
                alt={f.legenda || "Peça ou problema encontrado"}
                style={{ maxWidth: "100%", maxHeight: 350, borderRadius: 12 }}
              />
              <figcaption>{f.legenda}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p>Nenhuma foto anexada.</p>
      )}
    </section>
  );
}
