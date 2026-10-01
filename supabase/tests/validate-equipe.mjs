import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
const db = await criarBancoLocal("20260930000300");
let n = 0;
const owner = randomUUID(),
  staff = randomUUID(),
  other = randomUUID(),
  pending = randomUUID();
const esc = (x) => `'${String(x).replaceAll("'", "''")}'`;
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
const login = async (id) =>
  db.exec(
    `reset role; select set_config('request.jwt.claim.sub',${esc(id)},false); set role authenticated;`,
  );
const ok = (v, t) => {
  assert.ok(v, t);
  console.log("PASS", t);
  n++;
};
const fail = async (sql, code, t) => {
  await assert.rejects(
    () => db.exec(sql),
    (e) => e.code === code,
    t,
  );
  console.log("PASS", t);
  n++;
};
const token = () =>
  randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
const hash = (t) => createHash("sha256").update(t).digest("hex");
try {
  await db.exec(
    `alter table auth.users add column email text, add column email_confirmed_at timestamptz; insert into auth.users values('${owner}','owner@example.com',now()),('${staff}','staff@example.com',now()),('${other}','other@example.com',now()),('${pending}','pending@example.com',null);`,
  );
  await login(pending);
  await fail(
    `select public.configurar_nova_oficina('${randomUUID()}','Oficina teste','', '{}')`,
    "42501",
    "Conta sem confirmação não cria oficina pelo onboarding",
  );
  await login(owner);
  const chave = randomUUID();
  const w = await scalar(
    `select public.configurar_nova_oficina('${chave}','Oficina teste','+5516999999999','{"cidade":"Franca"}')`,
  );
  ok(
    w ===
      (await scalar(
        `select public.configurar_nova_oficina('${chave}','Oficina teste','+5516999999999','{"cidade":"Franca"}')`,
      )),
    "Cadastro repetido não duplica oficina",
  );
  const acesso = await scalar("select public.consultar_meu_acesso()");
  ok(
    acesso[0].codigo_plano === "basic" && acesso[0].perfil === "owner",
    "Nova empresa inicia no Básico com proprietário",
  );
  const config = await scalar(
    `select public.consultar_configuracoes_oficina('${w}')`,
  );
  ok(
    config.endereco.cidade === "Franca" && config.telefone === "+5516999999999",
    "Contato e endereço salvos",
  );
  await fail(
    `select public.criar_convite_equipe('${w}','staff@example.com','owner','${hash(token())}')`,
    "22023",
    "Convite não promove proprietário",
  );
  await fail(
    `select public.criar_convite_equipe('${w}','invalido','staff','${hash(token())}')`,
    "22023",
    "E-mail inválido rejeitado",
  );
  const t = token(),
    id = await scalar(
      `select public.criar_convite_equipe('${w}',' STAFF@example.com ','staff','${hash(t)}')`,
    );
  let equipe = await scalar(`select public.consultar_equipe('${w}')`);
  ok(
    equipe.convites[0].email === "staff@example.com" &&
      !JSON.stringify(equipe).includes(hash(t)),
    "Lista normaliza email e não expõe hash",
  );
  await login(other);
  await fail(
    `select public.consultar_convite_equipe('${t}')`,
    "42501",
    "Prévia não revela oficina para outro e-mail",
  );
  await fail(
    `select public.consultar_equipe('${w}')`,
    "42501",
    "Outra oficina não lê equipe",
  );
  await fail(
    `select public.aceitar_convite_equipe('${t}')`,
    "42501",
    "Convite não funciona com outro email",
  );
  await fail(
    "select * from public.convites_equipe",
    "42501",
    "Tabela de convites não é exposta",
  );
  await login(staff);
  const previa = await scalar(`select public.consultar_convite_equipe('${t}')`);
  ok(
    previa.oficina === "Oficina teste" && previa.perfil === "staff",
    "Destinatário confere empresa e perfil antes do aceite",
  );
  ok(
    (await scalar(`select public.aceitar_convite_equipe('${t}')`)) === w,
    "Destinatário confirmado aceita convite",
  );
  ok(
    (await scalar(`select public.aceitar_convite_equipe('${t}')`)) === w,
    "Aceite repetido não duplica membro",
  );
  await fail(
    `select public.criar_convite_equipe('${w}','other@example.com','staff','${hash(token())}')`,
    "42501",
    "Funcionário não convida",
  );
  await fail(
    `select public.alterar_membro_equipe('${w}','${staff}',1,'manager',true)`,
    "42501",
    "Funcionário não aumenta permissões",
  );
  await fail(
    `update public.membros_oficina set perfil='owner' where usuario_id='${staff}'`,
    "42501",
    "Escrita direta de permissão bloqueada",
  );
  await login(owner);
  await db.exec(
    `select public.alterar_membro_equipe('${w}','${staff}',1,'manager',true)`,
  );
  await fail(
    `select public.alterar_membro_equipe('${w}','${staff}',1,'staff',true)`,
    "PT409",
    "Revisão antiga bloqueada",
  );
  await fail(
    `select public.alterar_membro_equipe('${w}','${owner}',1,'staff',false)`,
    "42501",
    "Proprietário protegido contra remoção",
  );
  await login(staff);
  await fail(
    `select public.criar_convite_equipe('${w}','other@example.com','staff','${hash(token())}')`,
    "42501",
    "Gerente não administra equipe",
  );
  await login(owner);
  await db.exec(
    `select public.alterar_membro_equipe('${w}','${staff}',2,'manager',false)`,
  );
  await login(staff);
  ok(
    (await scalar("select public.consultar_meu_acesso()")).length === 0,
    "Suspensão remove oficina dos acessos",
  );
  await fail(
    `select public.listar_clientes('${w}')`,
    "42501",
    "Suspensão bloqueia operação no banco",
  );
  await fail(
    `select public.aceitar_convite_equipe('${t}')`,
    "22023",
    "Convite usado não reativa suspenso",
  );
  await login(owner);
  await db.exec(
    `select public.alterar_membro_equipe('${w}','${staff}',3,'staff',true)`,
  );
  await login(staff);
  ok(
    (await scalar("select public.consultar_meu_acesso()"))[0].perfil ===
      "staff",
    "Reativação respeita perfil definido",
  );
  await login(owner);
  const rev = token(),
    revId = await scalar(
      `select public.criar_convite_equipe('${w}','other@example.com','staff','${hash(rev)}')`,
    );
  const novo = token();
  await scalar(
    `select public.criar_convite_equipe('${w}','other@example.com','manager','${hash(novo)}')`,
  );
  await login(other);
  await fail(
    `select public.aceitar_convite_equipe('${rev}')`,
    "22023",
    "Novo convite invalida anterior",
  );
  await login(owner);
  equipe = await scalar(`select public.consultar_equipe('${w}')`);
  const novoId = equipe.convites.find((c) => c.situacao === "pendente").id;
  await db.exec(`select public.revogar_convite_equipe('${w}','${novoId}')`);
  await login(other);
  await fail(
    `select public.aceitar_convite_equipe('${novo}')`,
    "22023",
    "Convite revogado bloqueado",
  );
  await login(owner);
  const expirado = token();
  const expId = await scalar(
    `select public.criar_convite_equipe('${w}','other@example.com','staff','${hash(expirado)}')`,
  );
  await db.exec(
    `reset role;update public.convites_equipe set expira_em=now()-interval '1 day' where id='${expId}'`,
  );
  await login(other);
  await fail(
    `select public.aceitar_convite_equipe('${expirado}')`,
    "22023",
    "Convite expirado bloqueado",
  );
  await login(owner);
  const pend = token();
  await scalar(
    `select public.criar_convite_equipe('${w}','pending@example.com','staff','${hash(pend)}')`,
  );
  await login(pending);
  await fail(
    `select public.aceitar_convite_equipe('${pend}')`,
    "42501",
    "Aceite exige email confirmado",
  );
  await login(owner);
  await fail(
    `select public.criar_convite_equipe('${w}','staff@example.com','staff','${hash(token())}')`,
    "22023",
    "Convite não sobrescreve membro existente",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set situacao='suspended' where oficina_id='${w}'`,
  );
  await login(owner);
  await fail(
    `select public.criar_convite_equipe('${w}','other@example.com','staff','${hash(token())}')`,
    "42501",
    "Plano suspenso bloqueia novos convites",
  );
  ok(
    (await scalar(`select public.consultar_equipe('${w}')`)).membros.length ===
      2,
    "Proprietário pode revisar acessos mesmo com plano suspenso",
  );
  await db.exec(
    `select public.alterar_membro_equipe('${w}','${staff}',4,'staff',false)`,
  );
  ok(true, "Suspensão de membro disponível com plano suspenso");
  await db.exec("reset role");
  ok(
    Number(
      await scalar(
        `select count(*) from public.registros_auditoria where oficina_id='${w}' and acao like 'equipe.%'`,
      ),
    ) >= 8,
    "Operações de equipe registradas em auditoria",
  );
  await db.exec("set role anon");
  await fail(
    `select public.aceitar_convite_equipe('${t}')`,
    "42501",
    "Anônimo não aceita convite",
  );
  console.log(
    `${n} verificações aprovadas. Convites de teste: ${id}, ${revId}.`,
  );
} finally {
  await db.close();
}
