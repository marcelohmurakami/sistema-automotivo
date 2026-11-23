import {consultarFinanceiro,historicoFinanceiro,consultarTituloFinanceiro} from '../../src/services/financeiro';
import {consultarDetalheFinanceiro} from '../../src/services/detalheFinanceiro';
import {consultarContasBancarias} from '../../src/services/contasBancarias';
window.fixtureChamadas=[];
export async function rpc(n,p={}){
 window.fixtureChamadas.push({n,p});if(window.fixtureFalhar===n){window.fixtureFalhar=null;throw Error('Falha simulada na consulta. Tente novamente.');}
 switch(n){
 case 'sincronizar_contas_recorrentes':return null;
 case 'consultar_painel_financeiro':
 case 'consultar_financeiro':return consultarFinanceiro(true,p.p_oficina,{inicio:p.p_inicio,fim:p.p_fim,busca:p.p_busca,filtro:p.p_filtro,natureza:p.p_natureza,pagina:p.p_pagina,os:p.p_os,titulo:p.p_titulo});
 case 'consultar_detalhe_financeiro':await new Promise(r=>setTimeout(r,100));return consultarDetalheFinanceiro(true,p.p_oficina,{indicador:p.p_indicador,inicio:p.p_inicio,fim:p.p_fim,busca:p.p_busca,categoria:p.p_categoria,conta:p.p_conta,pagina:p.p_pagina,filtrarVencimento:p.p_filtrar_vencimento});
 case 'consultar_contas_financeiras':return consultarContasBancarias(true,p.p_oficina);
 case 'historico_financeiro':return historicoFinanceiro(true,p.p_oficina,p.p_titulo);
 case 'consultar_titulo_alerta':return consultarTituloFinanceiro(true,p.p_oficina,p.p_titulo);
 default:throw Error('RPC sem fixture: '+n);
 }
}
