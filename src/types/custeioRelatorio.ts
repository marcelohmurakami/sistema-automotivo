/** Resumo da mesma apuração usada pelo custeio da OS e pela ficha da equipe. */
export type ParticipanteRelatorio = {
  funcionario_id: string;
  nome: string;
  receita: number;
  vendas: number;
  custo: number;
  contribuicao: number;
  minutos: number;
  comissoes: number;
  garantias: number;
};
export type CusteioRelatorio = {
  custo: number;
  conferido: boolean;
  minutos: number;
  fontes_pendentes: number;
  participantes: ParticipanteRelatorio[];
  atribuicao_revisar: boolean;
};
