import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { rpc } from "../../lib/rpc";
import { supabase, erroPublico } from "../../lib/supabase";
type Foto = {
  id: string;
  arquivo_id: string;
  fase: string;
  legenda: string;
  caminho: string;
  situacao: string;
};

export function FotosAtendimento({
  atendimento,
  cancelado,
  aoProcessar,
}: {
  atendimento: string;
  cancelado: boolean;
  aoProcessar: (ocupado: boolean) => void;
}) {
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id;
  const [ocupado, mudarOcupado] = useState(false),
    [erro, setErro] = useState("");
  function setOcupado(valor: boolean) {
    mudarOcupado(valor);
    aoProcessar(valor);
  }
  const chave = ["fotos-atendimento", oficina, atendimento, a.demo];
  const parametros = { p_oficina: oficina, p_atendimento: atendimento };
  const q = useQuery({
    queryKey: chave,
    queryFn: ({ signal }) =>
      a.demo
        ? Promise.resolve([] as Foto[])
        : rpc<Foto[]>("listar_fotos_atendimento", parametros, signal),
  });
  async function atualizar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: chave }),
      qc.invalidateQueries({
        queryKey: ["detalhes-atendimento", oficina, atendimento],
      }),
    ]);
  }
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado) return;
    const form = e.currentTarget,
      dados = new FormData(form),
      arquivo = dados.get("arquivo");
    setOcupado(true);
    setErro("");
    try {
      if (
        !(arquivo instanceof File) ||
        !["image/jpeg", "image/png", "image/webp"].includes(arquivo.type) ||
        arquivo.size < 1 ||
        arquivo.size > 10485760
      )
        throw new Error("Selecione uma foto JPG, PNG ou WebP de até 10 MB.");
      const foto = await rpc<{ id: string; caminho: string }>(
        "reservar_foto_atendimento",
        {
          ...parametros,
          p_nome: arquivo.name,
          p_mime: arquivo.type,
          p_tamanho: arquivo.size,
          p_fase: dados.get("fase"),
          p_legenda: dados.get("legenda") || "",
        },
      );
      const { error } = await supabase!.storage
        .from("workshop-files")
        .upload(foto.caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (error) throw error;
      await rpc("confirmar_foto_atendimento", { ...parametros, p_arquivo: foto.id });
      form.reset();
    } catch (err) {
      setErro(erroPublico(err));
    } finally {
      await atualizar();
      setOcupado(false);
    }
  }
  return (
    <section className="atendimento-fotos">
      <h3>Fotos antes e depois</h3>
      {!cancelado && !a.demo && (
        <form className="atendimento-form" onSubmit={(e) => void enviar(e)}>
          <fieldset disabled={ocupado} className="atendimento-campos">
            <label>
              Momento
              <select name="fase">
                <option value="antes">Antes do serviço</option>
                <option value="depois">Depois do serviço</option>
              </select>
            </label>
            <label>
              Legenda (opcional)
              <input
                name="legenda"
                maxLength={500}
                placeholder="Ex.: condição antes do serviço"
              />
            </label>
            <label>
              Foto
              <input
                type="file"
                name="arquivo"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </label>
            <button className="botao-primario" disabled={ocupado}>
              {ocupado ? "Enviando…" : "Adicionar foto"}
            </button>
          </fieldset>
        </form>
      )}
      {a.demo && <p>Entre em uma conta real para enviar fotos.</p>}
      <p className="texto-suave">
        JPG, PNG ou WebP de até 10 MB. Até 40 fotos por atendimento.
      </p>
      {(erro || q.isError) && (
        <p role="alert">
          {erro || erroPublico(q.error)}{" "}
          <button onClick={() => void q.refetch()}>Atualizar galeria</button>
        </p>
      )}
      {q.isPending && <p role="status">Carregando fotos…</p>}
      <div className="atendimento-campos">
        {["antes", "depois"].map((fase) => (
          <section key={fase}>
            <h4>{fase === "antes" ? "Antes" : "Depois"}</h4>
            {!q.isPending && !q.data?.some((f) => f.fase === fase) && (
              <p className="texto-suave">Nenhuma foto.</p>
            )}
            {q.data
              ?.filter((f) => f.fase === fase)
              .map((f) => (
                <figure key={f.id} className="atendimento-foto">
                  {f.situacao === "ready" ? (
                    <ImagemFoto foto={f} />
                  ) : (
                    <p>
                      Envio incompleto. Remova este registro e envie a foto novamente.
                    </p>
                  )}
                  <figcaption>{f.legenda}</figcaption>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={async () => {
                      setOcupado(true);
                      setErro("");
                      try {
                        await rpc("remover_foto_atendimento", {
                          ...parametros,
                          p_foto: f.id,
                        });
                        await atualizar();
                      } catch (err) {
                        setErro(erroPublico(err));
                      } finally {
                        setOcupado(false);
                      }
                    }}
                  >
                    Remover da galeria
                  </button>
                </figure>
              ))}
          </section>
        ))}
      </div>
    </section>
  );
}
function ImagemFoto({ foto }: { foto: Foto }) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["foto-atendimento-url", a.usuario, a.oficina!.id, foto.caminho],
    queryFn: async () => {
      const { data, error } = await supabase!.storage
        .from("workshop-files")
        .createSignedUrl(foto.caminho, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 120000,
    refetchInterval: 180000,
  });
  return q.data ? (
    <a href={q.data} target="_blank" rel="noreferrer">
      <img
        src={q.data}
        alt={foto.legenda || `Foto ${foto.fase} do serviço`}
        loading="lazy"
        style={{
          width: "100%",
          maxHeight: 280,
          objectFit: "contain",
          borderRadius: 12,
        }}
      />
    </a>
  ) : (
    <p>{q.isError ? "Falha ao carregar a foto." : "Carregando foto…"}</p>
  );
}
