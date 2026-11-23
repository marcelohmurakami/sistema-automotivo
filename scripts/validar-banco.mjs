// Compatibilidade com a bancada e comandos antigos: a bateria atual descobre
// todas as suítes e aplica a migração mais recente ao banco local isolado.
process.argv.push("--banco");
await import("./testar-tudo.mjs");
