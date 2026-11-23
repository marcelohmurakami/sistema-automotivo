# Serviços de limpeza — implementação e validação

Implementação dos seis perfis de limpeza, integrada aos módulos existentes de orçamento, agenda, equipe, horas, estoque, financeiro, qualidade, relatórios e área do cliente. O código foi validado localmente e as três migrações foram aplicadas, com autorização do usuário, ao Supabase `hzihxtjirttetnfdujcx` em 19/10/2026. Não foi realizado deploy da aplicação. A revisão anterior dos 26 subsistemas está em `revisao-subsistemas-2026-10-19.md`.

## Particularidades contempladas

| Perfil | Dados e fluxo próprios |
| --- | --- |
| Residencial | Ocupação do imóvel, cômodos, prioridades, superfícies, cuidados, restrições de produtos, organização e exclusões. |
| Comercial e condomínios | Contrato, turno, rotina, tarefas periódicas, áreas críticas, supervisor, cobertura da equipe, reposição e resíduos. |
| Pós-obra | Condição de liberação da obra, limpeza grossa/fina, frentes ainda em execução, resíduos, entulho, acabamentos sensíveis e teste de superfície. |
| Estofados e tapetes | Tipo de bem, lugares/unidades inteiros, tecido, manchas, método, coleta/devolução, marcas remanescentes e estimativa de secagem com suas condições. |
| Vidros e fachadas | Superfície, altura, acesso, películas/revestimentos, condições de execução, referência da análise de riscos, responsável pela liberação e suspensão. |
| Geral | Área, ambientes, superfícies, frequência, prioridades, fornecimento de produtos/equipamentos, horas, vistoria e aceite. |

Os campos frequentes aparecem diretamente no cadastro, com seleção própria por modalidade. Os demais permanecem em seções recolhidas. O escopo combinado fica visível no formulário principal. Pessoas e lugares usam incremento inteiro; área, duração e consumo fracionado permanecem possíveis.

## Operação e documentos

- Endereço do serviço preservado na ficha, evitando que uma alteração posterior no cadastro do local mude o endereço histórico do comprovante.
- Resumo em três cartões: local/contratação, vistoria e uso do local/bem. Secagem e restrições ficam visíveis quando informadas.
- Concluir não significa aceitar nem liberar o uso automaticamente. A conferência registra nome, data, resultado e ressalvas. Recusa ou aceite com ressalvas exige justificativa.
- Reabrir devolve o consumo anterior pelo mecanismo existente, mantém os registros no histórico e reinicia o aceite e a vistoria. O trabalho volta à etapa de execução própria do perfil.
- Vidros/fachadas com condição registrada como suspensa ou aguardando avaliação não podem ser concluídos enquanto essa condição persistir.
- Orçamento, comprovante e ficha técnica em PDF. O comprovante inclui escopo, local, bem, quantidade, vistoria, secagem e aceite; informações internas de acesso, danos e produtos permanecem na ficha técnica.
- A opção de WhatsApp continua exigindo que o operador abra e envie a mensagem. Nenhuma mensagem real foi enviada na validação.

## Visitas recorrentes

A agenda permite escolher entre várias etapas do mesmo atendimento e novos atendimentos independentes. A criação de visitas independentes é restrita à gerência, coerente com a permissão de copiar itens, custos e equipe.

Nas visitas independentes:

- O operador escolhe quantidade (até 52), intervalo, equipe e situação inicial: orçamento ou aprovado, quando o cliente já autorizou.
- Cada visita recebe atendimento, data, prazo, vencimento e reserva próprios. O atendimento usado como modelo não é alterado.
- Copiam-se somente o planejamento contratado, itens, desconto e composição da equipe. Custos de estoque são conferidos novamente pelo cadastro atual.
- Não se copiam execução, checklist realizado, danos encontrados, aceite, horas trabalhadas, reclamações, comissões já geradas ou cobranças. Custos extras da visita anterior também não são repetidos.
- A programação não consome estoque nem fatura automaticamente. Cada visita usa os fluxos existentes de conclusão e recebimento.
- Repetir a mesma solicitação não duplica os registros. Reutilizar a chave com outros dados é rejeitado.
- Um conflito em qualquer visita desfaz a programação inteira, inclusive visitas anteriores da mesma tentativa.
- Os intervalos disponíveis são 1, 7, 14 e 30 dias. A opção de 30 dias não é apresentada como mês-calendário.

## Indicadores

O relatório de operação acrescenta área dos atendimentos concluídos, produtividade em m² por hora de equipe, conferências pendentes/recusadas e aceites com ressalvas. Respeita os filtros existentes de período, cliente, funcionário e modalidade.

A produtividade usa apenas atendimentos que possuem simultaneamente área e horas apontadas. As horas somam o tempo de cada integrante; não misturam a área de atendimentos sem apontamento com as horas de outros. Na ausência dos dados necessários, apresenta “Sem registros”. Financeiro, custos, margem, inadimplência, comissão, qualidade e estoque continuam nos relatórios compartilhados.

## Validação executada

- **128/128 suítes locais aprovadas**, incluindo os 26 subsistemas. TypeScript estrito, ESLint, Prettier e build verificados.
- Nova suíte SQL com jornada dos seis perfis: orçamento, validação dos campos, aprovação, execução, horas, produtos fracionados, conclusão, aceite, ressalvas, reabertura, retrabalho, pagamento parcial e relatórios.
- Recorrência: visitas independentes, aprovação explícita, duplicação idempotente, revisão desatualizada, limite de quantidade e conflito apenas na segunda visita com reversão integral.
- Segurança: isolamento entre empresas, bloqueio de usuários externos, equipe sem gerência, anônimos e acesso direto à tabela de séries. A função não aceita empresas de assistência técnica.
- Testes de interface renderizada e demonstração: campos por perfil, resumo, números inteiros, privacidade dos três PDFs, fórmulas dos indicadores e reversão de conflito na demonstração.
- Navegador: seis formulários comparados; jornada de estofados desde edição/aprovação até conclusão/aceite; exigência de ressalva; três visitas criadas pela agenda; relatório de operação e impressão pelo botão real.
- Responsividade: formulário conferido em 390 × 844, sem transbordamento horizontal. O tamanho normal do navegador foi restaurado.
- PDF gerado pela interface salvo em `output/revisao-limpeza-2026-10-19/pdf/nota-gerada-interface.pdf`; exemplos dos seis perfis gerados em três modos. Comprovante de estofados também renderizado para conferência visual.

Evidências em `output/revisao-limpeza-2026-10-19/`. Os testes usam PostgreSQL via PGlite, contas e valores fictícios. A autenticação e serviços externos da bancada são simulados; esses resultados não equivalem a uma validação de SMTP ou serviços externos em produção.

## Migrações aplicadas

1. `20261019000300_limpeza_especializada.sql`: contratos aditivos das fichas e lista explícita dos dados de planejamento que podem ser reaproveitados.
2. `20261019000400_aceite_limpeza.sql`: conferência, histórico de aceite, reabertura e validações específicas de limpeza; preserva o comportamento de manutenção.
3. `20261019000500_visitas_limpeza.sql`: tabela de controle da programação e função transacional com validação de acesso, isolamento, idempotência e reutilização das operações existentes.

**Aplicadas ao Supabase conectado em uma única transação, na ordem acima, após autorização explícita.** Os hashes dos três arquivos foram conferidos antes da execução e coincidem com os arquivos testados. Não foram excluídos registros nem criados atendimentos de teste no banco conectado.

A conferência posterior, somente leitura, aprovou **11/11 verificações**: campos dos seis perfis; particularidades por modalidade; integridade dos contratos dos outros setores (hash anterior e posterior idênticos); aceite, reabertura e histórico; três gatilhos ativos; quantidades inteiras e suspensão; recorrência, limite e idempotência; permissões da função; RLS e bloqueio do acesso direto à tabela; lista de campos copiados; e ausência de programações de teste. O console da jornada local de limpeza terminou sem avisos ou erros capturados.

Aplicação pelo Editor SQL, seguindo o procedimento anterior do projeto. O histórico do Supabase CLI não foi alterado; antes de um futuro `db push`, conciliar as versões já aplicadas, sem reaplicá-las. Hashes, SQL executado, consulta somente leitura, resultados e captura da conferência estão em `output/revisao-limpeza-2026-10-19/` (`migracoes-hashes.json`, `migracoes-aplicacao.sql`, `conferencia-supabase.sql`, `supabase-conferencia.txt` e `supabase-conferencia.png`).

## Referências usadas para definir os campos

- Produtos, diluição e compatibilidade seguem o registro do rótulo e do responsável, sem receitas automáticas: [Anvisa — misturas de produtos de limpeza](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2026/misturar-produtos-de-limpeza-nao-e-uma-boa-ideia-e-pode-ser-perigoso) e [rotulagem de saneantes](https://www.gov.br/anvisa/pt-br/setorregulado/regularizacao/saneantes/rotulagem/).
- Tecido, método, condições de higienização e secagem: [Sebrae — lavagem de estofados](https://bibliotecas.sebrae.com.br/chronus/ARQUIVOS_CHRONUS/IDEIAS_DE_NEGOCIO/PDFS/ideia-de-negocio_lavagem-de-estofados.pdf).
- Escopo por área, periodicidade, equipe, materiais e equipamentos: [Sebrae — conservação e limpeza](https://bibliotecas.sebrae.com.br/chronus/ARQUIVOS_CHRONUS/bds/bds.nsf/1d46be7d1c39818f644a8240236bf0fe/%24File/31006.pdf) e [contratação de limpeza do Sebrae](https://www.scf3.sebrae.com.br/portalcf/Licitacoes/Detalhe?Id=14618).
- A medição de área/produtividade foi usada como referência gerencial, sem impor índices de contratos públicos a empresas privadas: [IN 5/2017 — Portal de Compras](https://www.gov.br/compras/pt-br/acesso-a-informacao/legislacao/instrucoes-normativas/instrucao-normativa-no-5-de-26-de-maio-de-2017-atualizada).
- Vidros/fachadas: campos para referência do planejamento e responsável, sem aprovação automática de segurança nem substituição da documentação aplicável: [Ministério do Trabalho — NR-35](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-35-nr-35).
