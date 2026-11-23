import type { CampoTecnico } from "./perfisAtendimento.ts";

export const texto = (id: string, nome: string, ajuda?: string): CampoTecnico => ({
  id,
  nome,
  ajuda,
});
export const area = (id: string, nome: string, ajuda?: string): CampoTecnico => ({
  id,
  nome,
  ajuda,
  tipo: "area",
});
export const numero = (id: string, nome: string, unidade: string): CampoTecnico => ({
  id,
  nome,
  unidade,
  tipo: "numero",
});
export const data = (id: string, nome: string): CampoTecnico => ({
  id,
  nome,
  tipo: "data",
});
export const opcao = (id: string, nome: string, opcoes: string[]): CampoTecnico => ({
  id,
  nome,
  opcoes,
  tipo: "opcao",
});
