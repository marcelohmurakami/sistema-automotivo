import {readFile,writeFile,mkdir} from 'node:fs/promises';
const arq='src/components/EditorItensOS.tsx';let s=await readFile(arq,'utf8');
await mkdir('output/jornadas-completas-20261112/editor-anterior',{recursive:true});
await writeFile('output/jornadas-completas-20261112/editor-anterior/EditorItensOS.tsx',s);
const inicio=s.indexOf('      {!!itens.length && (\n        <div className="os-editor-adicionados">');
const fim=s.indexOf('      {!!removidos.length',inicio);
if(inicio<0||fim<0)throw Error('Estrutura do editor mudou');
let bloco=s.slice(inicio,fim).trim();
bloco=bloco.replace(/nomeItem/g,'nomeMaterial').replaceAll('!!rascunho','desabilitado');
bloco=bloco.replace(/alterar=\{\(quantidade\) =>[\s\S]*?\n                    \}/,'alterar={(quantidade) => alterarQuantidade(i.id, quantidade)}');
bloco=bloco.replace('onClick={() => abrirItem(i)}','onClick={() => editar(i)}');
bloco=bloco.replace(/onClick=\{\(\) => \{\n                        setRemovidos[\s\S]*?\n                      \}\}/,'onClick={() => remover(i)}');
const componente=`import {memo,type ReactNode} from 'react';
import {Pencil,Trash2} from 'lucide-react';
import {dinheiro} from '../lib/formatacao';
import {QuantidadeItem} from './QuantidadeItem';
import type {ItemEditorOS} from './EditorItensOS';
/** Digitar na busca ou no item em edição não refaz as linhas já adicionadas. */
export const ListaItensOS=memo(function ListaItensOS({itens,nomeMaterial,contexto,desabilitado,editar,remover,alterarQuantidade,detalhesItem}:{
 itens:ItemEditorOS[];nomeMaterial:string;contexto:string;desabilitado:boolean;
 editar:(item:ItemEditorOS)=>void;remover:(item:ItemEditorOS)=>void;
 alterarQuantidade:(id:string,quantidade:number)=>void;
 detalhesItem?:(item:ItemEditorOS,indice:number)=>ReactNode;
}){return (<>${bloco}</>);});
`;
await writeFile('src/components/ListaItensOS.tsx',componente);
s=s.slice(0,inicio)+`      <ListaItensOS itens={itens} nomeMaterial={nomeItem} contexto={contexto}
        desabilitado={!!rascunho} editar={editarAdicionado} remover={removerAdicionado}
        alterarQuantidade={alterarQuantidade} detalhesItem={detalhesItem}/>
`+s.slice(fim);
s=s.replace('useEffect, useId, useRef, useState, type ReactNode','useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode');
s=s.replace('Plus, Search, Star, Trash2, RotateCcw, Pencil, Check','Plus, Search, Star, RotateCcw, Check');
s=s.replace('import { QuantidadeItem } from "./QuantidadeItem";','import { ListaItensOS } from "./ListaItensOS";');
const pos=s.indexOf('  const tipoBloqueado =');
s=s.slice(0,pos)+`  const editarAdicionado = useCallback((item:ItemEditorOS) => {
    setRascunho({...item});setEditando(true);setErroItem("");aoEditarItem(true);
  },[aoEditarItem]);
  const removerAdicionado = useCallback((item:ItemEditorOS) => {
    setRemovidos(anteriores=>[...anteriores,item]);alterar(itens.filter(i=>i.id!==item.id));
  },[itens,alterar]);
  const alterarQuantidade = useCallback((id:string,quantidade:number) => {
    alterar(itens.map(item=>item.id===id?{...item,quantidade}:item));
  },[itens,alterar]);
`+s.slice(pos);
s=s.replace('  const subtotal = itens.reduce(','  const subtotal = useMemo(() => itens.reduce(').replace('    0,\n  );\n  const limite','    0,\n  ),[itens]);\n  const limite');
await writeFile(arq,s);
