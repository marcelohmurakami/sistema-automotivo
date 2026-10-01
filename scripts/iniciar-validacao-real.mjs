import { emitKeypressEvents } from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const oficina = process.argv[2];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oficina ?? '')) {
  console.error('Uso: node scripts/iniciar-validacao-real.mjs ID_DA_OFICINA');
  process.exit(1);
}
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Execute em um terminal interativo para digitar as senhas com seguranca.');
  process.exit(1);
}

emitKeypressEvents(process.stdin);
function lerSenha(email) {
  return new Promise((resolve, reject) => {
    let valor = '';
    const rawAnterior = process.stdin.isRaw;
    function encerrar() {
      process.stdin.removeListener('keypress', receber);
      process.stdin.setRawMode(rawAnterior);
      process.stdin.pause();
      process.stdout.write('\n');
    }
    function receber(texto, tecla = {}) {
      if (tecla.ctrl && tecla.name === 'c') {
        valor = '';
        encerrar();
        reject(new Error('Cancelado. Os testes nao foram iniciados.'));
      } else if (tecla.name === 'return' || tecla.name === 'enter') {
        if (!valor) return;
        encerrar();
        resolve(valor);
        valor = '';
      } else if (tecla.name === 'backspace') {
        valor = Array.from(valor).slice(0, -1).join('');
      } else if (!tecla.ctrl && !tecla.meta && texto && !/[\u0000-\u001f\u007f]/.test(texto)) {
        valor += texto;
      }
    }
    process.stdout.write(`Senha de ${email} (nao aparece na tela): `);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', receber);
    process.stdin.resume();
  });
}

const contas = [];
try {
  console.log('Validacao com duas contas reais. Use as senhas criadas no Supabase.');
  for (const letra of ['a', 'b']) {
    const email = `qa.automotivo.${letra}.20260930@example.com`;
    contas.push({ email, senha: await lerSenha(email) });
  }
  const processo = spawn(process.execPath, [fileURLToPath(new URL('./validar-atendimento-real.mjs', import.meta.url)), '-'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: false,
  });
  // Credenciais somente pela entrada padrao; nunca em argumentos, arquivos ou logs.
  processo.stdin.on('error', () => {});
  const resultado = new Promise((resolve, reject) => {
    processo.once('error', reject);
    processo.once('close', (codigo) => resolve(codigo ?? 1));
  });
  processo.stdin.end(JSON.stringify({ oficina_id: oficina, contas }));
  for (const conta of contas) conta.senha = '';
  process.exitCode = await resultado;
} catch {
  console.error('Validacao cancelada ou nao iniciada. Nenhuma senha foi gravada pelo iniciador.');
  process.exitCode = 1;
} finally {
  for (const conta of contas) conta.senha = '';
}
