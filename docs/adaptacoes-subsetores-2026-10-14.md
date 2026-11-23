# Adaptações por especialidade — 14/10/2026

## Escopo implementado

Os 13 perfis já existentes passam a definir campos técnicos, conferências e modelos de etapas. Os campos são opcionais e ficam recolhidos no formulário. Não há preenchimento automático de medições, aprovação técnica, pressão, tolerância ou intervalo de manutenção.

| Especialidade | Registro específico | Processo sugerido |
| --- | --- | --- |
| Mecânica | Sintoma, sistema, testes de entrada/saída, reparo e próxima revisão | Diagnóstico, autorização, reparo e testes |
| Retífica | Identificação da peça, componentes, inspeção, medidas iniciais/finais, referência de tolerâncias e usinagem | Identificação, limpeza/inspeção, metrologia, usinagem e conferência |
| Autoelétrica | Circuito, sistema nominal, bateria, falhas, medições antes/depois, consumo e configuração | Diagnóstico, reparo elétrico e validação |
| Autocenter | Pneus, posição, desgaste, suspensão/freios, geometria antes/depois, pressão e rodízio | Inspeção, reparos, alinhamento/balanceamento e teste |
| Borracharia | Medida, marca/DOT, posição, avaria, reparabilidade, válvula/TPMS e estanqueidade | Inspeção, reparo/substituição, teste e montagem |
| Estética | Escopo, condição inicial, pintura, produtos/lotes, proteção, cura e cuidados | Preparação, correção, proteção e inspeção |
| Lava-rápido | Pacote, box/fila, avarias/pertences, extras, produtos e conferência | Preparação, lavagem, acabamento e saída |
| Troca de óleo | Viscosidade, especificação, produto/lote, volume, filtros, vazamentos e próxima troca | Aplicação, troca, conferência e registro do retorno |
| Acessórios | Produto/série, origem, compatibilidade, adaptações autorizadas, instalação e testes | Preparação, instalação, configuração e demonstração |
| Funilaria | Painéis, seguradora/sinistro, autorização, danos ocultos, cor, pintura/lote, cabine e cura | Desmontagem, reparação, preparação, pintura, montagem e inspeção |
| Assistência técnica | Identificação, acessórios, backup/modo de manutenção, diagnóstico, componentes, testes e garantia | Triagem, diagnóstico, autorização, reparo e devolução |
| Manutenção de campo | Ativo, acesso, tipo de manutenção, escopo, medições, materiais, deslocamento e aceite | Planejamento, visita, execução e aceite |
| Limpeza | Área, ambientes/exclusões, superfícies, frequência, acesso, produtos/diluições, equipamentos e aceite | Preparação, limpeza, acabamento e aceite |

## Integração e acesso rápido

- A configuração da empresa mostra o foco e as etapas da especialidade escolhida.
- Orçamentos, OS e atendimentos de outros ramos salvam uma ficha versionada. Revisar orçamento e convertê-lo em OS preserva a ficha.
- A ficha preenchida aparece no resumo interno da OS e na ficha complementar impressa. O orçamento público continua usando uma lista explícita de campos; a ficha técnica interna não é publicada nele.
- A mudança da especialidade da empresa não reclassifica as fichas antigas. Uma nova ficha deve pertencer à especialidade atual; documentos derivados preservam o perfil de origem.
- Em **Etapas e terceiros**, o botão de modelo cria as etapas do perfil com uma ação, dentro de uma transação. Repetir a ação não duplica etapas existentes. Continua possível editar responsáveis, prazos, terceiros e custos pelo fluxo já existente.
- Nos atendimentos de assistência, campo e limpeza, a etapa técnica pode ser atualizada diretamente no cartão. Há um filtro por etapa. A etapa técnica não altera automaticamente a situação comercial nem gera cobrança.
- Em **Relatórios → Oficina**, a cobertura das fichas considera as OS recebidas no período, os filtros existentes e exclui canceladas. Mostra o registro técnico específico e a conferência completa, com links para pendências.
- Os outros ramos mostram a mesma cobertura sobre a lista atualmente filtrada, identificada como posição atual. Não apresentam essa posição como histórico de um período.
- Indicadores representam registros efetuados pelo usuário. Uma medição preenchida não implica aprovação do reparo; ausência de dado não é considerada resultado satisfatório.

## Pesquisa e decisões

As referências abaixo embasaram a seleção de informações e a separação de processos. A transformação dessas práticas em campos, checklists e indicadores é uma decisão de produto. Não se trata de certificação técnica ou integração automática com equipamentos.

| Referência primária | Aplicação no sistema |
| --- | --- |
| [Bosch Car Service — serviços](https://am.boschcarservice.com/br/pt/nossos-servicos/) | Separar diagnóstico, reparação, inspeção e manutenção preventiva na mecânica |
| [Bosch — BAT 191](https://www.boschaftermarket.com/pt/pt/equipamentos-e-diagnostico/equipamentos-de-oficina/servi%C3%A7o-de-baterias-e-ferramentas-para-ve%C3%ADculos-eletricos/bat-191/) | Registrar aplicação da bateria, condições e resultados dos testes elétricos |
| [MAHLE — manual de motores](https://www.mahle-aftermarket.com/media/local-media-latin-america/catalogs/manuais-tecnicos/manual-curso-de-motores-2019.pdf) e [CONAREM — formação em metrologia](https://www.conarem.com.br/wp-content/uploads/2024/06/INFO-JUNHO-2024-1.pdf) | Identificação, medição inicial/final e referência técnica na retífica |
| [Michelin — calibragem](https://www.michelin.com.br/auto/conselhos/calibragem-do-pneu/calibrar-pneus) e [alinhamento/balanceamento](https://pro.michelin.com.br/blog/articles/como-alinhamento-e-balanceamento-de-pneus-afetam-a-direcao) | Posição e condição dos pneus, pressão registrada com unidade e referência do fabricante |
| [3M — processos de funilaria](https://www.3m.com.br/3M/pt_BR/funilaria-e-pintura/como-fazer/) e [fluxo da cabine de pintura](https://www.3m.com.br/3M/pt_BR/funilaria-e-pintura/recursos/artigos/otimize-o-processo-e-o-fluxo-de-trabalho-da-sua-cabine-de-pintura/) | Etapas distintas para preparação, pintura e acabamento; identificação da cabine |
| [3M — instalação de película de proteção](https://multimedia.3m.com/mws/media/2190517O/3m-paint-protection-film-installation-guide-pt.pdf) | Escopo da aplicação, produto, condições de cura e orientação na estética/acessórios |
| [Castrol — guia de proteção](https://www.castrol.com/content/dam/castrol/country-sites-new/pt_br/brazil/home/documents/products/guia-de-prote%C3%A7%C3%A3o-castrol-magnetec.pdf) | Especificação, viscosidade, filtros e referência para a próxima troca |
| [Kärcher — detergentes profissionais](https://www.karcher.com/pt/pt/professional/produtos/detergentes-c4945) | Registrar superfícies, produtos e diluições na limpeza e lavagem, sem fixar uma diluição universal |
| [Samsung — modo de manutenção](https://www.samsung.com/br/support/maintenance-mode/) | Registrar preparação do equipamento e backup; não solicitar senha pessoal na ficha |
| [Daikin — checklist de manutenção](https://www.daikin.com.br/blog/2023/12/22/checklist-da-manutencao-de-ar-condicionado-para-o-verao/) | Inspeção, execução e conferência na visita técnica |

## Banco e manutenção do código

Migration nova: `supabase/migrations/20261014000100_fichas_especialidades.sql`. Validada em banco local PGlite. **Não aplicada ao Supabase de produção nesta tarefa.** O servidor precisa receber a migration antes da publicação deste frontend.

O catálogo de interface está em `src/lib/perfisAtendimento.ts`. A migration contém o catálogo de validação correspondente, incluindo IDs, tipos, opções e etapas. Não renomear IDs persistidos nem reexecutar o gerador para alterar uma migration já aplicada: evoluções futuras precisam de uma nova migration compatível com fichas existentes.

O banco valida formato, tipos, campos permitidos, datas, medidas, limites e perfil da empresa. Escritas continuam usando as RPCs com revisão e autorização existentes. O frontend faz a validação antecipada para apresentar erros antes do envio.

## Verificação

- Teste de domínio dos 13 perfis: valores opcionais, medidas decimais, datas civis, opções inválidas e campos desconhecidos.
- Renderização dos 13 formulários: rótulos, conteúdo recolhido, checklist inicialmente desmarcado, resumo escapado e inclusão na ficha complementar.
- Indicadores: fichas ausentes, vazias, parciais e completas, com denominadores e pendências correspondentes.
- Banco dos 13 perfis: persistência, isolamento entre empresas, atualização parcial, revisão/conversão de orçamento, privacidade do orçamento público, compatibilidade do perfil e repetição do modelo de etapas.
- Inspeção no navegador com dados fictícios e teste responsivo de 390 px; evidências em `output`.

Resultado final: **100 suítes aprovadas**, sendo 70 de banco em memória e 30 de domínio, interface e demonstração. Quatro testes de renderização apresentaram falhas de carregamento ESM/CJS no ambiente restrito; todos passaram na reexecução fora dessa restrição, incluindo a rodada final completa das 30 suítes de frontend. Resultado consolidado em `output/validacao-subsetores-final.json`.

TypeScript, build de produção e ESLint dos arquivos TypeScript alterados concluídos sem erros.

No navegador foram conferidos os formulários de mecânica, retífica, autoelétrica, funilaria, assistência técnica, manutenção e limpeza. Uma OS fictícia de autoelétrica foi salva e reaberta, preservando medições e checklist; os indicadores distinguiram medições completas de checklist ainda parcial. Também foram conferidos a seleção direta de etapa dos atendimentos, o filtro correspondente e o formulário de retífica em 390 px, sem transbordamento horizontal. Os demais perfis têm cobertura automatizada de formulário e persistência.

Na inspeção, registros antigos da demonstração sem `historico` ou `paradas` impediam a abertura de relatórios. A leitura agora normaliza apenas as coleções ausentes para listas vazias, sem inventar datas ou eventos nem modificar o registro original. Essa compatibilidade tem teste de regressão.

Evidências visuais: `output/ficha-funilaria-desktop.png`, `output/ficha-retifica-mobile.png` e `output/indicadores-especialidade.png`. A inspeção usou somente dados fictícios no servidor local; nenhuma migration ou alteração de dados foi aplicada em produção.
