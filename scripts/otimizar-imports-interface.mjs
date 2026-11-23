// Transformação conservadora: somente componentes de abas e diálogos já condicionais.
import ts from 'typescript';
import {readFile,writeFile} from 'node:fs/promises';
const alvos={
 'pages/Financeiro.tsx':['CustosServicos','PrecificacaoServicos','ApuracaoCompleta','ConciliacaoBancaria','CobrancasContratos','ContasBancarias','FormularioBaixaFinanceira','FormularioTituloFinanceiro','Comissoes','ContasRecorrentes'],
 'pages/Servicos.tsx':['DetalhesAtendimento','Agenda','Formulario','PainelAssistencia'],
 'pages/OrdensServico.tsx':['FormularioOS','PdfOS','FinanceiroNaOS','LucroServico','ComissoesNaOS','ProdutividadeOS','EstoqueNaOS'],
 'pages/Orcamentos.tsx':['EditorOrcamento','FotosOrcamento','ConteudoProposta'],
 'pages/Clientes.tsx':['FichaCliente','ImportarCadastros'],
 'pages/Catalogo.tsx':['ImportarCadastros','TabelaPrecosServicos','FichaServico','DetalhesServicoEditor'],
 'pages/Estoque.tsx':['UnidadesProduto','ConsultaUnidades','PlanejarEstoque','DepositosEstoque','EscolherDeposito','LerProduto','ImprimirEtiquetasEstoque'],
 'pages/Compras.tsx':['ImportarNfe','PagamentoCompra','PagamentosIntegrados'],
 'pages/Relatorios.tsx':['RelatoriosGestao','RankingDevedores','RelatorioOficina'],
 'components/DetalhesAtendimento.tsx':['OcorrenciasAtendimento','FotosAtendimento','LucroServico','AprovacaoAtendimento','HistoricoPropostasAtendimento'],
};
const alteracoes=[];
for(const [nome,nomes] of Object.entries(alvos)){
 const file='src/'+nome;let source=await readFile(file,'utf8');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[],defs=[];
 for(const n of ast.statements){
  if(!ts.isImportDeclaration(n)||!n.importClause||n.importClause.isTypeOnly)continue;
  const bindings=n.importClause.namedBindings;
  if(!bindings||!ts.isNamedImports(bindings))continue;
  const escolhidos=bindings.elements.filter(e=>!e.isTypeOnly&&nomes.includes(e.name.text));
  if(!escolhidos.length)continue;
  const outros=bindings.elements.filter(e=>!escolhidos.includes(e));
  const modulo=n.moduleSpecifier.text;
  for(const e of escolhidos){defs.push(`const ${e.name.text} = componenteSobDemanda(() => import("${modulo}").then(m => ({ default: m.${e.propertyName?.text||e.name.text} })));`);alteracoes.push({arquivo:file,componente:e.name.text,modulo});}
  edits.push({start:n.getStart(ast),end:n.getEnd(),text:outros.length?`import { ${outros.map(e=>e.getText(ast)).join(', ')} } from "${modulo}";`:''});
 }
 if(!defs.length)continue;
 for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);
 const caminho=nome.startsWith('pages/')?'../lib/componenteSobDemanda':'../lib/componenteSobDemanda';
 // A definição fica no escopo do módulo para preservar identidade e estado.
 source=`import { componenteSobDemanda } from "${caminho}";\n${defs.join('\n')}\n`+source;
 await writeFile(file,source);
}
await writeFile('output/desempenho-20261111/imports-adiados.json',JSON.stringify(alteracoes,null,2));
console.log(`${alteracoes.length} componentes sob demanda em ${new Set(alteracoes.map(a=>a.arquivo)).size} arquivos.`);
