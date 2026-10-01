export type Etapa = "recepcao" | "execucao" | "aguardando" | "pronto";
export type Veiculo = {
  id: number;
  modelo: string;
  versao: string;
  placa: string;
  cliente: string;
  servico: string;
  etapa: Etapa;
  prazo: string;
  atrasado?: boolean;
  motivo?: string;
  tecnico: string;
  iniciais: string;
  cor: string;
  valor: number;
  local: string;
};
export type Orcamento = {
  id: number;
  cliente: string;
  placa: string;
  descricao: string;
  valor: number;
  situacao: "Aguardando aprovação" | "Aprovado" | "Rascunho";
  itens?: { descricao: string; valor: number }[];
};
export const etapas: { id: Etapa; nome: string; descricao: string }[] = [
  { id: "recepcao", nome: "Recepção", descricao: "Tudo começa por aqui" },
  { id: "execucao", nome: "Em execução", descricao: "Mãos à obra" },
  { id: "aguardando", nome: "Aguardando", descricao: "Precisam de atenção" },
  { id: "pronto", nome: "Prontos", descricao: "Só falta entregar a chave" },
];
export const veiculosIniciais: Veiculo[] = [
  {
    id: 1048,
    modelo: "Volkswagen Polo",
    versao: "1.0 TSI · 2022",
    placa: "FRA2J48",
    cliente: "Ricardo Almeida",
    servico: "Revisão de 40 mil km",
    etapa: "recepcao",
    prazo: "Hoje, 17h",
    tecnico: "Lucas",
    iniciais: "LC",
    cor: "azul",
    valor: 680,
    local: "Recepção",
  },
  {
    id: 1049,
    modelo: "Chevrolet Onix",
    versao: "1.0 LT · 2021",
    placa: "GHT4B21",
    cliente: "Juliana Costa",
    servico: "Diagnóstico do motor",
    etapa: "recepcao",
    prazo: "Amanhã, 12h",
    tecnico: "Pedro",
    iniciais: "PD",
    cor: "roxo",
    valor: 250,
    local: "Recepção",
  },
  {
    id: 1042,
    modelo: "Honda Civic",
    versao: "2.0 EXL · 2020",
    placa: "EJK7F32",
    cliente: "Fernando Martins",
    servico: "Troca de pastilhas e discos",
    etapa: "execucao",
    prazo: "Hoje, 15h",
    tecnico: "Marcos",
    iniciais: "MC",
    cor: "verde",
    valor: 1240,
    local: "Elevador 01",
  },
  {
    id: 1045,
    modelo: "Fiat Strada",
    versao: "1.3 Freedom · 2023",
    placa: "RBC3D56",
    cliente: "André Oliveira",
    servico: "Troca de óleo e filtros",
    etapa: "execucao",
    prazo: "Hoje, 16h",
    tecnico: "Lucas",
    iniciais: "LC",
    cor: "azul",
    valor: 390,
    local: "Elevador 02",
  },
  {
    id: 1046,
    modelo: "Hyundai HB20",
    versao: "1.0 Comfort · 2022",
    placa: "FQP8A19",
    cliente: "Camila Santos",
    servico: "Alinhamento e balanceamento",
    etapa: "execucao",
    prazo: "Amanhã, 10h",
    tecnico: "Pedro",
    iniciais: "PD",
    cor: "roxo",
    valor: 180,
    local: "Box 03",
  },
  {
    id: 1039,
    modelo: "Jeep Renegade",
    versao: "1.8 Longitude · 2019",
    placa: "GKL5H78",
    cliente: "Bruno Ferreira",
    servico: "Substituição da bomba d’água",
    etapa: "aguardando",
    prazo: "Hoje, 11h",
    atrasado: true,
    motivo: "Aguardando peça",
    tecnico: "Marcos",
    iniciais: "MC",
    cor: "verde",
    valor: 960,
    local: "Pátio 01",
  },
  {
    id: 1041,
    modelo: "Toyota Corolla",
    versao: "2.0 XEi · 2021",
    placa: "FZT1C90",
    cliente: "Ana Paula Lima",
    servico: "Revisão da suspensão",
    etapa: "aguardando",
    prazo: "Hoje, 12h",
    atrasado: true,
    motivo: "Aguardando aprovação",
    tecnico: "Lucas",
    iniciais: "LC",
    cor: "azul",
    valor: 1480,
    local: "Pátio 02",
  },
  {
    id: 1038,
    modelo: "Volkswagen T-Cross",
    versao: "1.0 200 TSI · 2023",
    placa: "RFA6E45",
    cliente: "Roberto Silva",
    servico: "Revisão completa",
    etapa: "pronto",
    prazo: "Hoje, 17h30",
    tecnico: "Marcos",
    iniciais: "MC",
    cor: "verde",
    valor: 890,
    local: "Saída",
  },
];
export const orcamentosIniciais: Orcamento[] = [
  {
    id: 209,
    cliente: "Ana Paula Lima",
    placa: "FZT1C90",
    descricao: "Revisão da suspensão",
    valor: 1480,
    situacao: "Aguardando aprovação",
  },
  {
    id: 210,
    cliente: "Ricardo Almeida",
    placa: "FRA2J48",
    descricao: "Revisão de 40 mil km",
    valor: 680,
    situacao: "Aguardando aprovação",
  },
  {
    id: 208,
    cliente: "Roberto Silva",
    placa: "RFA6E45",
    descricao: "Revisão completa",
    valor: 890,
    situacao: "Aprovado",
  },
];
export const catalogo = [
  {
    nome: "Troca de óleo e filtro",
    tipo: "Serviço",
    valor: 190,
    unidade: "serviço",
  },
  {
    nome: "Alinhamento e balanceamento",
    tipo: "Serviço",
    valor: 180,
    unidade: "serviço",
  },
  {
    nome: "Revisão preventiva",
    tipo: "Serviço",
    valor: 350,
    unidade: "serviço",
  },
  {
    nome: "Óleo sintético 5W30",
    tipo: "Peça / produto",
    valor: 49.9,
    unidade: "litro",
  },
  {
    nome: "Filtro de óleo",
    tipo: "Peça / produto",
    valor: 39.9,
    unidade: "unidade",
  },
  {
    nome: "Jogo de pastilhas de freio",
    tipo: "Peça / produto",
    valor: 220,
    unidade: "jogo",
  },
];
export const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
