import {rpc as anterior, fixtureLucro as doc, fixtureItem as item} from './custos-itens-rpc.js';
import {novaFichaEspecialidade} from '../../src/lib/perfisAtendimento';
const p=new URLSearchParams(location.search);
const atendimento={id:'os',numero:123,revisao:1,titulo:'Serviço com insumos de teste',cliente_id:'cliente',objeto_id:'equipamento',data_servico:'2026-11-10',vencimento:'2026-11-10',valor_centavos:18000,situacao:p.get('estado')||'orcamento',dados:{documento:p.get('documento')||'ordem'},ficha_especialidade:novaFichaEspecialidade(p.get('perfil')||'assistencia_celulares')};
const detalhes={atendimento,cliente:{nome:'Cliente de teste',telefone:null},objeto:{id:'equipamento',nome:'Equipamento de teste',dados:{}},itens:[],comercial:{desconto_centavos:2000},equipe:[],horas:[],qualidade:[],eventos:[],propostas:[]};
function dados(){
 atendimento.revisao=doc.revisao;atendimento.valor_centavos=doc.receita;
 detalhes.itens=[{id:item.id,tipo:'servico',descricao:item.descricao,quantidade:item.quantidade,unidade:'un',preco_centavos:item.preco,custo_centavos:item.custo_unitario,custo_informado:true,origem:'externa'}];
 detalhes.comercial.desconto_centavos=doc.desconto;
 return structuredClone(detalhes);
}
export async function rpc(n,args={}){
 if(n==='consultar_reservas_atendimento')return {revisao:doc.revisao,itens:[]};
 if(n==='consultar_detalhes_atendimento'){window.fixtureChamadas.push({n,args});return dados();}
 if(n==='salvar_itens_atendimento_nota'){
  window.fixtureChamadas.push({n,args});
  const i=args.p_itens[0];item.quantidade=i.quantidade;item.preco=i.preco_centavos;item.custo_unitario=i.custo_centavos;
  item.custo=i.quantidade*i.custo_centavos;doc.bruto=i.quantidade*i.preco_centavos;doc.desconto=args.p_desconto;doc.receita=doc.bruto-doc.desconto;doc.aberto=doc.receita-doc.pago;
  item.receita=doc.receita;item.margem=item.receita-item.custo;doc.custo=item.custo+2000;doc.margem=doc.receita-doc.custo;doc.revisao++;
  return;
 }
 return anterior(n,args);
}
