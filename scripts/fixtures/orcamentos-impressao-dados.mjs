import { especialidades } from '../../src/lib/especialidades.ts';
import { documentoDoOrcamento } from '../../src/lib/documentoCliente.ts';
import { documentoAtendimento } from '../../src/lib/documentoAtendimento.ts';

export const perfisOrcamento = Object.keys(especialidades);
export function cenarioOrcamento(perfil = 'mecanica', caso = 'normal') {
  const e = especialidades[perfil];
  const auto = e.ramo === 'automotivo', assistencia = e.ramo === 'assistencia_tecnica', limpeza = e.ramo === 'limpeza';
  const empresa = { nome: auto ? 'Horizonte Centro Automotivo' : assistencia ? 'Conecta Assistência Técnica' : limpeza ? 'Essencial Limpeza e Conservação' : 'Prisma Manutenção',
    documento: '00.000.000/0001-00', telefone:'(16) 99999-0000', endereco:{rua:'Av. das Acácias, 240 · Centro',cidade:'Franca / SP'},
    cor: assistencia ? '#245c82' : '#244336', rodape:'Obrigado pela confiança. Estamos à disposição para esclarecer qualquer dúvida.',especialidade:perfil };
  let itens = (auto ? [
    ['Revisão do sistema de freios e teste de rodagem', 'service', 1, 18000, 'serv'],
    ['Jogo de pastilhas de freio dianteiras', 'part', 1, 22500, 'un'],
    ['Troca de óleo e filtro do motor', 'service', 1, 9500, 'serv'],
    ['Óleo sintético 5W30', 'part', 3.5, 4990, 'L'],
    ['Filtro de óleo', 'part', 1, 4200, 'un'],
  ] : assistencia ? [
    ['Substituição do conjunto da tela e teste de toque', 'service', 1, 15000, 'serv'],
    ['Conjunto de tela compatível com o aparelho', 'part', 1, 32000, 'un'],
    ['Limpeza dos conectores e verificação da carga', 'service', 1, 6500, 'serv'],
  ] : limpeza ? [
    ['Limpeza e higienização dos ambientes contratados', 'service', 1, 42000, 'serv'],
    ['Material de limpeza', 'part', 2, 3500, 'un'],
  ] : [
    ['Manutenção preventiva e teste de funcionamento', 'service', 2, 21000, 'serv'],
    ['Materiais de instalação e vedação', 'part', 1, 8500, 'un'],
    ['Deslocamento da equipe ao local', 'service', 1, 6000, 'serv'],
  ]).map(([descricao,tipo,quantidade,preco_unitario_centavos,unidade])=>({descricao,tipo,quantidade,preco_unitario_centavos,unidade,total_item_centavos:Math.round(quantidade*preco_unitario_centavos)}));
  if(caso === 'longo') itens = Array.from({length:70},(_,i)=>({...itens[i%itens.length],descricao:`ITEM_${String(i+1).padStart(3,'0')} · ${itens[i%itens.length].descricao}. Conferência dos componentes e orientação ao cliente.`}));
  if(caso === 'descricao-extensa') itens = [{...itens[0],descricao:'INICIO_EXTENSO '+('Descrição técnica fornecida ao cliente para conferência detalhada do escopo. '.repeat(240))+' FIM_EXTENSO'}];
  const subtotal=itens.reduce((s,i)=>s+i.total_item_centavos,0),desconto=Math.round(subtotal*.1),total=subtotal-desconto;
  const cliente = {nome:'Ana Carolina de Oliveira',telefone_e164:'+5516999991111'};
  let documento;
  let atendimento;
  if(auto) documento=documentoDoOrcamento({id:'qa',numero:128,situacao:'awaiting_approval',versao_atual_id:'v1',
    versao:{id:'v1',numero_versao:1,dados_oficina:empresa,dados_cliente:cliente,dados_veiculo:{marca:'Chevrolet',modelo:'Onix 1.0 / 2021',placa:'ABC1D23',motor:'GM Família 1'},
      publicado_em:'2026-11-11T12:00:00Z',expira_em:'2026-11-25T21:00:00Z',forma_pagamento:'Pix ou cartão',subtotal_centavos:subtotal,desconto_centavos:desconto,total_centavos:total,
      observacoes:'Execução dos serviços após aprovação deste orçamento. Qualquer serviço adicional será informado previamente.',condicoes:'Prazo estimado: 2 dias úteis após a aprovação, conforme disponibilidade das peças.'},itens,historico:[]},new Date('2026-11-11T15:00:00Z'));
  else {
    atendimento={atendimento:{id:'qa',numero:128,situacao:'orcamento',titulo:'Proposta de serviço',valor_centavos:total,data_servico:'2026-11-11',
      ficha_especialidade:{especialidade:perfil,campos:{}},dados:{forma_pagamento:'Pix ou cartão',observacoes_cliente:'O serviço será iniciado após a aprovação do orçamento.',condicoes:'Qualquer serviço adicional será informado previamente.'}},cliente,
      objeto:{nome:assistencia?'Samsung Galaxy A54':limpeza?'Apartamento · Edifício Jardim':'Ar-condicionado Split · Sala comercial',dados:{}},
      itens:itens.map(i=>({...i,preco_centavos:i.preco_unitario_centavos,tipo:i.tipo==='part'?'material':'servico',total_centavos:i.total_item_centavos})),comercial:{desconto_centavos:desconto}};
    documento=documentoAtendimento(atendimento,empresa,'orcamento');
  }
  if(caso==='sem-itens') {documento.itens=[];documento.subtotal=0;documento.desconto=0;documento.total=0;}
  if(caso==='rascunho') {documento.situacao='Rascunho - não emitido';documento.destaque=true;}
  if(caso==='identidade-longa') {
    documento.identidade={...documento.identidade,nome:'Empresa de Serviços Técnicos Especializados e Manutenção Integrada Horizonte',endereco:{endereco:'Avenida das Acácias, número 240, conjunto comercial 307, Bairro Jardim das Palmeiras, Franca, São Paulo, CEP 14400-000'},cor:'#ffff00'};
    documento.cliente='Condomínio Residencial Jardim das Palmeiras e Administração de Imóveis';
  }
  return {documento,atendimento,empresa,subtotal,desconto,total};
}
