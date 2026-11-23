// Ambiente descartável: PostgreSQL real via PGlite; Auth/SMTP simulados.
// Não usa chaves nem dados de produção. Escuta somente no loopback.
import { createServer } from "node:http";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";
import { criarCenarioSite } from "../supabase/tests/site-fixture.mjs";
process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= readdirSync("supabase/migrations")
  .filter((f) => /^\d{14}_.*\.sql$/.test(f))
  .sort()
  .at(-1)
  .slice(0, 14);
const digitais = process.argv.includes("--digitais");
const subsistemas = process.argv.includes("--subsistemas");
const manutencao = process.argv.includes("--manutencao");
const reparos = digitais || process.argv.includes("--reparos");
const c = subsistemas ? await (await import("../supabase/tests/subsistemas-fixture.mjs")).criarCenarioSubsistemas({realista:process.argv.includes('--realista')}) : manutencao ? await (await import("../supabase/tests/manutencao-fixture.mjs")).criarCenarioManutencao() : reparos
  ? await (await import("../supabase/tests/reparos-fixture.mjs")).criarCenarioReparos({ digitais })
  : await criarCenarioSite();
const porta = subsistemas ? 5205 : manutencao ? 5204 : digitais ? 5203 : reparos ? 5202 : 5201;
const origem = subsistemas ? "http://127.0.0.1:5179" : manutencao ? "http://127.0.0.1:5178" : digitais ? "http://127.0.0.1:5177" : reparos ? "http://127.0.0.1:5176" : "http://127.0.0.1:5174";
const dominio = subsistemas ? "subsistemas.test" : manutencao ? "manutencao.test" : reparos ? "reparos.test" : "site.test";
const sessions = new Map();
let queue = Promise.resolve();
const profiles = Object.fromEntries(
  Object.entries(c.ids).map(([name, id]) => [
    name.toLowerCase() + "@" + dominio,
    {
      id,
      email: name.toLowerCase() + "@" + dominio,
      aud: "authenticated",
      role: "authenticated",
      email_confirmed_at: name === "unconfirmed" ? null : new Date().toISOString(),
      app_metadata: { provider: "email" },
      user_metadata: {},
    },
  ]),
);
const session = (user) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    { alg: "HS256", typ: "JWT" },
    { sub: user.id, exp, role: "authenticated" },
    "local-qa",
  ]
    .map((x) =>
      Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url"),
    )
    .join(".");
  sessions.set(token, user);
  sessions.set("refresh-" + user.id, user);
  return {
    access_token: token,
    refresh_token: "refresh-" + user.id,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user,
  };
};
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", origem);
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ||
      "authorization,apikey,content-type,x-client-info,prefer,range,x-supabase-api-version",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "content-range");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, "http://127.0.0.1:5201");
  // Viewport real em iframe, inclusive quando o navegador hospedeiro não aceita resize.
  if (reparos && url.pathname === "/__qa/viewport") {
    const width = Number(url.searchParams.get("width") || 390);
    const destino = url.searchParams.get("path") || "/atendimentos";
    if (!/^\/(?:atendimentos|agenda|objetos|estoque|financeiro|relatorios|meu-site|clientes|catalogo|funcionarios|fornecedores|compras|configuracoes)(?:\?atendimento=[a-f0-9-]{36})?$/.test(destino)) {
      res.writeHead(400); res.end("Destino inválido"); return;
    }
    if (!Number.isInteger(width) || width < 320 || width > 1920) {
      res.writeHead(400); res.end("Largura inválida"); return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="pt-BR"><title>QA local · ${width}px</title><body style="margin:0;background:#ddd"><iframe title="Aplicativo em ${width}px" src="${origem}${destino}" style="display:block;border:0;width:${width}px;height:844px"></iframe></body></html>`);
    return;
  }
  console.log("QA_REQUEST", req.method, url.pathname);
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const send = (data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "X-Supabase-Api-Version": "2024-01-01",
    });
    res.end(JSON.stringify(data));
  };
  const user = sessions.get((req.headers.authorization || "").replace(/^Bearer /, ""));
  try {
    if (url.pathname === "/auth/v1/token") {
      const found =
        url.searchParams.get("grant_type") === "refresh_token"
          ? sessions.get(body.refresh_token)
          : profiles[body.email];
      if (
        !found ||
        (url.searchParams.get("grant_type") !== "refresh_token" &&
          body.password !== "LocalQa!23456")
      )
        return send(
          {
            code: "invalid_credentials",
            error_code: "invalid_credentials",
            msg: "Invalid login credentials",
          },
          400,
        );
      if (!found.email_confirmed_at)
        return send(
          {
            code: "email_not_confirmed",
            error_code: "email_not_confirmed",
            msg: "Email not confirmed",
          },
          400,
        );
      return send(session(found));
    }
    if (url.pathname === "/auth/v1/user")
      return user ? send(user) : send({ msg: "Unauthorized" }, 401);
    if (url.pathname === "/auth/v1/logout") {
      if (user) {
        for (const [token, u] of sessions) if (u.id === user.id) sessions.delete(token);
      }
      return send({});
    }
    if (url.pathname === "/auth/v1/recover") {
      console.log("RECOVERY_SIMULATED", url.searchParams.get("redirect_to"));
      return send({});
    }
    if (url.pathname === "/auth/v1/signup")
      return send(
        {
          code: "email_address_invalid",
          msg: "Criação de conta não simulada. Use as contas QA existentes.",
        },
        422,
      );
    if (url.pathname.startsWith("/functions/v1/"))
      return send({ erro: "Integrações externas não são simuladas neste ambiente de auditoria." }, 503);
    if (!url.pathname.startsWith("/rest/v1/"))
      return send({
        ambiente: "QA local descartável",
        smtp: "simulado",
        oficina: c.office,
      });
    const work = async () => {
      await c.login(user?.id || "", user ? "authenticated" : "anon");
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").at(-1);
        if (!/^[a-z_]+$/.test(name)) throw Error("RPC inválida");
        // Parâmetros são vinculados, nunca interpolados como SQL.
        const keys = Object.keys(body);
        if (keys.some((k) => !/^p_[a-z_]+$/.test(k))) throw Error("Parâmetro inválido");
        const result = await c.db.query(
          `select public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(",")}) as data`,
          // O PGlite escolhe a serialização pelo tipo SQL (jsonb ou text[]).
          keys.map((k) => body[k]),
        );
        return result.rows[0].data;
      }
      // Subconjunto de leitura PostgREST usado pelas telas internas. As consultas
      // executam sob o usuário corrente e as políticas RLS reais do banco local.
      const table = url.pathname.slice("/rest/v1/".length);
      if (
        req.method === "GET" &&
        [
          "clientes",
          "veiculos",
          "clientes_veiculos",
          "itens_catalogo",
          "estoque_produtos",
          "ordens_servico",
        ].includes(table)
      ) {
        const args = [],
          conditions = [];
        for (const [column, filter] of url.searchParams) {
          if (["select", "order", "limit", "offset"].includes(column)) continue;
          if (!/^[a-z_]+$/.test(column)) throw Error("Coluna inválida no adaptador QA");
          if (filter === "is.null") conditions.push(`t.${column} is null`);
          else if (filter.startsWith("eq.") || filter.startsWith("gt.")) {
            args.push(filter.slice(3));
            conditions.push(
              `t.${column} ${filter.startsWith("eq.") ? "=" : ">"} $${args.length}`,
            );
          } else if (filter.startsWith("in.(") && filter.endsWith(")")) {
            args.push(filter.slice(4, -1).split(","));
            conditions.push(`t.${column}::text = any($${args.length}::text[])`);
          } else throw Error("Filtro não coberto pelo adaptador QA");
        }
        const order = (url.searchParams.get("order") || "")
          .split(",")
          .filter(Boolean)
          .map((p) => {
            if (!/^[a-z_]+\.(asc|desc)$/.test(p)) throw Error("Ordenação inválida");
            const [column, direction] = p.split(".");
            return `t.${column} ${direction}`;
          });
        const relation =
          table === "ordens_servico"
            ? ",coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'motivo',p.motivo,'detalhes',p.detalhes,'encerrado_em',p.encerrado_em)) from public.paradas_ordem_servico p where p.ordem_servico_id=t.id),'[]') as paradas"
            : "";
        const result = await c.db.query(
          `select t.*${relation} from public.${table} t${conditions.length ? " where " + conditions.join(" and ") : ""}${order.length ? " order by " + order.join(",") : ""}`,
          args,
        );
        const offset = Number(url.searchParams.get("offset") || 0);
        const limit = Number(url.searchParams.get("limit") || 1000);
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 1000
        )
          throw Error("Paginação inválida");
        const rows = result.rows.slice(offset, offset + limit);
        res.setHeader(
          "Content-Range",
          `${offset}-${Math.max(offset, offset + rows.length - 1)}/${result.rows.length}`,
        );
        return rows;
      }
      throw Error("Endpoint não coberto pelo adaptador QA");
    };
    const result = queue.then(work);
    queue = result.catch(() => {});
    send(await result);
  } catch (e) {
    console.log("QA_ERROR", url.pathname, e.code, e.message);
    send(
      {
        code: e.code || "QA_ERROR",
        message: e.message,
        details: null,
        hint: null,
      },
      e.code === "42501" ? 403 : 400,
    );
  }
});
server.listen(porta, "127.0.0.1", () =>
  console.log(
    `QA local pronta na porta ${porta}; contas ${Object.keys(c.ids).join(", ")} @${dominio}; senha fictícia LocalQa!23456`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await c.db.close();
      process.exit(0);
    }),
  );
