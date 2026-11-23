import { randomBytes, randomUUID } from "node:crypto";

export function planejarContas(especialidades, lote) {
  if (!/^\d{8}$/.test(lote)) throw new Error("O lote deve usar AAAAMMDD.");
  return Object.entries(especialidades).map(([especialidade, perfil]) => ({
    especialidade,
    ramo: perfil.ramo,
    nome: perfil.nome,
    empresa: `ZZ [TESTE ${lote}] ${perfil.nome}`,
    email: `qa.${lote}.${especialidade}@example.com`,
  }));
}

export function novoManifesto(contas, lote, projeto) {
  return {
    versao: 1,
    lote,
    projeto,
    criado_em: new Date().toISOString(),
    contas: contas.map((conta) => ({
      ...conta,
      chave: randomUUID(),
      senha: `Qa!${randomBytes(24).toString("base64url")}`,
      status: "pendente",
    })),
  };
}

export function conferirManifesto(manifesto, plano, lote, projeto) {
  if (
    manifesto.versao !== 1 ||
    manifesto.lote !== lote ||
    manifesto.projeto !== projeto ||
    manifesto.contas.length !== plano.length
  )
    throw new Error("Manifesto incompatível com o lote/projeto.");
  const vistos = new Set();
  for (const conta of manifesto.contas) {
    const prevista = plano.find((p) => p.especialidade === conta.especialidade);
    if (
      !prevista ||
      vistos.has(conta.especialidade) ||
      Object.keys(prevista).some((k) => prevista[k] !== conta[k]) ||
      typeof conta.senha !== "string" ||
      conta.senha.length < 24 ||
      !/^[0-9a-f-]{36}$/.test(conta.chave)
    )
      throw new Error("Conta inesperada ou inválida no manifesto.");
    vistos.add(conta.especialidade);
  }
}

export function conferirUsuario(usuario, conta, lote) {
  if (
    usuario.email !== conta.email ||
    usuario.app_metadata?.qa_lote !== lote ||
    usuario.app_metadata?.qa_especialidade !== conta.especialidade ||
    (conta.usuario_id && conta.usuario_id !== usuario.id)
  ) {
    throw new Error(
      `Já existe um usuário não pertencente a este lote: ${conta.email}. Nenhuma senha será alterada.`,
    );
  }
}

export function conferirAcesso(acessos, conta, exigirCompleto = false) {
  if (!Array.isArray(acessos) || acessos.length !== 1)
    throw new Error(`Acesso inesperado para ${conta.email}.`);
  const empresa = acessos[0];
  if (
    empresa.id !== conta.empresa_id ||
    empresa.nome !== conta.empresa ||
    empresa.ramo !== conta.ramo ||
    empresa.especialidade !== conta.especialidade ||
    empresa.perfil !== "owner" ||
    (exigirCompleto &&
      (empresa.codigo_plano !== "complete" || empresa.situacao !== "active"))
  ) {
    throw new Error(`Empresa/permissões divergentes para ${conta.email}.`);
  }
}

const escapar = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export function paginaCredenciais(manifesto) {
  const prontas = manifesto.contas.filter((c) => c.status === "conferida");
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acessos de teste — ${escapar(manifesto.lote)}</title>
<style>body{font:16px system-ui;background:#152019;color:#edf3ec;margin:32px auto;padding:0 24px;max-width:1400px}h1{margin-bottom:8px}p{color:#bdcdbd;line-height:1.6}section{overflow-x:auto}table{border-collapse:collapse;width:100%;background:#202d23}td,th{padding:16px;text-align:left;border-bottom:1px solid #3b493e}th{color:#d7f47d}code{white-space:nowrap;font-size:14px;user-select:all}input{padding:14px;border-radius:8px;border:1px solid #56705b;background:#202d23;color:white;margin:16px 0;width:min(90%,500px)}small{display:block;color:#b7c6b8;margin-top:6px}.badge{color:#d7f47d}</style>
<h1>Suas contas de teste</h1><p><span class="badge">${prontas.length} de ${manifesto.contas.length} contas verificadas</span> · Plano Completo · Empresas independentes<br>Use o e-mail e a senha no login do sistema. Saia da conta anterior antes de trocar de empresa.<br>Arquivo privado: contém senhas de teste. Os endereços @example.com não recebem e-mail; recuperação por e-mail não funciona nessas contas.</p>
<input id="busca" placeholder="Encontrar sistema ou subsetor" aria-label="Encontrar sistema ou subsetor"><section><table><thead><tr><th>Sistema / empresa</th><th>E-mail</th><th>Senha</th></tr></thead><tbody>
${prontas.map((c) => `<tr><td><strong>${escapar(c.nome)}</strong><small>${escapar(c.empresa)}</small></td><td><code>${escapar(c.email)}</code></td><td><code>${escapar(c.senha)}</code></td></tr>`).join("\n")}
</tbody></table></section><script>document.getElementById('busca').addEventListener('input',function(){const q=this.value.toLocaleLowerCase('pt-BR');document.querySelectorAll('tbody tr').forEach(r=>r.hidden=!r.textContent.toLocaleLowerCase('pt-BR').includes(q))})</script></html>`;
}
