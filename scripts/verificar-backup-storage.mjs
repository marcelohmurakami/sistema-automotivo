import { verificarBackupStorage } from "./lib/backup-storage.mjs";
if (!process.argv[2]) throw new Error("Informe a pasta de backup.");
const dados = await verificarBackupStorage(process.argv[2]);
console.log(
  `Integridade validada: ${dados.itens.length} objetos. Esta verificação não equivale a uma restauração.`,
);
