# Avaliação completa dos 26 subsistemas — segunda rodada, 19/10/2026

## Resultado e ambiente

Todos os 26 perfis foram exercitados novamente com empresas, clientes, equipamentos/locais, serviços e materiais fictícios. Foram concluídas 26 jornadas pela interface e 26 jornadas especializadas no banco. A passagem complementar cobriu 224 combinações de perfil e tela.

A aplicação React real foi ligada a uma API local de teste, executando as funções SQL e gatilhos em PostgreSQL/PGlite com as migrações até 20261019000500. Login e serviços externos foram simulados. A revisão usou empresas isoladas na bancada; não precisou criar mais usuários reais no Supabase.

Esta rodada não alterou o banco de produção nem publicou o aplicativo. As três migrações de limpeza autorizadas anteriormente já foram aplicadas e conferidas no Supabase conectado; suas evidências estão em [revisao-limpeza-2026-10-19.md](revisao-limpeza-2026-10-19.md).

## Correções e melhorias desta rodada

| Achado | Alteração | Verificação |
| --- | --- | --- |
| O PDF de orçamento podia incorporar execução, resultados de testes e aceite já preenchidos na ficha | Separação dos campos da proposta e dos campos do serviço realizado; os documentos de atendimento e ficha técnica continuam com seus dados próprios | Regressão de documentos nos 16 perfis não automotivos; 48 PDFs gerados pela jornada SQL |
| O comprovante de eletrodoméstico atendido em domicílio não identificava o endereço da visita | Modalidade e endereço histórico da visita incluídos; endereço do cadastro usado somente como alternativa | Teste impede substituir o endereço histórico por um cadastro alterado; PDF renderizado e inspecionado |
| A baixa financeira iniciava em Pix, mas selecionava dinheiro em caixa | Pix sugere banco; dinheiro sugere caixa; o usuário ainda pode escolher a conta manualmente | Teste do componente para receita/despesa e interação real no navegador, incluindo troca da forma e escolha manual |
| Campos frequentes das especialidades automotivas ficavam escondidos na ficha completa | Entrada rápida própria nos formulários de orçamento e OS, com campos opcionais e sem duplicação na ficha recolhida | Renderização dos 26 perfis, jornadas dos 10 automotivos, edição preservada e conferência em desktop/celular |

Entrada rápida: natureza/sistema na mecânica; identificação/aplicação na retífica; circuito/tensão na autoelétrica; pneus no autocenter; medida/posição/avaliação na borracharia; pacote/áreas na estética; pacote/vaga no lava-rápido; viscosidade/especificação/volume na troca de óleo; produto/fornecimento nos acessórios; sinistro/autorização/cor na funilaria. Não foram inventadas medições, tolerâncias ou receitas técnicas universais.

## Matriz por perfil

As descrições abaixo são cenários fictícios de uso do software. Não representam ensaios físicos realizados em veículos, aparelhos ou instalações.

| Família | Perfil | Particularidade simulada | Interface | Banco | Telas extras |
| --- | --- | --- | --- | --- | --- |
| Automotivo | Oficina mecânica | Ruído ao frear, peças autorizadas e teste de rodagem | Aprovada | Aprovada | 8 |
| Automotivo | Retífica | Cabeçote avulso, componentes do cliente e rastreabilidade de metrologia | Aprovada | Aprovada | 8 |
| Automotivo | Autoelétrica | Falha intermitente na carga e consumo em repouso | Aprovada | Aprovada | 8 |
| Automotivo | Centro automotivo / autocenter | Geometria antes/depois e rodízio com posições identificadas | Aprovada | Aprovada | 8 |
| Automotivo | Borracharia | Pneu avulso reparável, posição e válvula TPMS | Aprovada | Aprovada | 8 |
| Automotivo | Estética automotiva | Polimento com avarias anteriores e cuidados de cura | Aprovada | Aprovada | 8 |
| Automotivo | Lava-rápido | Lavagem rápida com pacote e pertences | Aprovada | Aprovada | 8 |
| Automotivo | Troca de óleo | Óleo em volume fracionado e retorno por data/quilometragem | Aprovada | Aprovada | 8 |
| Automotivo | Instalação de acessórios automotivos | Câmera trazida pelo cliente e instalações autorizadas | Aprovada | Aprovada | 8 |
| Automotivo | Funilaria e pintura | Sinistro, dano oculto e complemento de autorização | Aprovada | Aprovada | 8 |
| Assistência | Assistência técnica | Impressora, fonte recebida e devolução com acessórios | Aprovada | Aprovada | 9 |
| Assistência | Celulares e tablets | Troca de tela com dados não autorizados para exclusão | Aprovada | Aprovada | 9 |
| Assistência | Informática e notebooks | SSD com acesso criptografado indisponível e limites de teste | Aprovada | Aprovada | 9 |
| Assistência | Eletrodomésticos | Lavadora atendida no domicílio e aceite sem retirada de bancada | Aprovada | Aprovada | 9 |
| Assistência | Eletrônica e reparo de placas | Placa avulsa e ensaio limitado sem equipamento completo | Aprovada | Aprovada | 9 |
| Manutenção | Climatização e refrigeração | Preventiva de split com referência do plano e dreno | Aprovada | Aprovada | 9 |
| Manutenção | Elétrica predial e comercial | Circuito com desligamento combinado e área afetada | Aprovada | Aprovada | 9 |
| Manutenção | Hidráulica e bombeamento | Vazamento com recomposição fora do escopo | Aprovada | Aprovada | 9 |
| Manutenção | Máquinas e equipamentos | Bomba industrial com identificação, carga e responsável pela retomada | Aprovada | Aprovada | 9 |
| Limpeza | Limpeza residencial | Apartamento ocupado com restrição de produto e cômodo excluído | Aprovada | Aprovada | 9 |
| Limpeza | Limpeza comercial e condomínios | Visitas semanais, cobertura da equipe e supervisão | Aprovada | Aprovada | 9 |
| Limpeza | Limpeza pós-obra | Obra parcialmente liberada, resíduos e acabamento sensível | Aprovada | Aprovada | 9 |
| Limpeza | Higienização de estofados e tapetes | Sofá de três lugares, mancha remanescente e secagem estimada | Aprovada | Aprovada | 9 |
| Limpeza | Vidros e fachadas | Vidros com suspensão registrada e posterior liberação | Aprovada | Aprovada | 9 |
| Manutenção | Manutenção de campo | Reparo residencial com pendência de acabamento | Aprovada | Aprovada | 9 |
| Limpeza | Serviços de limpeza | Escopo por hora com fornecimento compartilhado | Aprovada | Aprovada | 9 |

## O que foi exercitado

- Automotivo: edição e aprovação do orçamento, conversão em OS, execução dos itens, origem da peça, conferência, serviço pronto, aviso opcional de WhatsApp, entrega e recebimento parcial. Acessório do cliente não foi tratado como retirada do estoque. Na retífica, a identificação do motor foi preenchida antes de salvar.
- Assistências: edição dos dados próprios, aprovação, início e conclusão do reparo; retirada do equipamento ou aceite no domicílio; cobrança e recebimento parcial. Celulares e informática preservaram restrições de dados e testes parciais. A placa eletrônica manteve referência, revisão e duração do ensaio.
- Manutenção e limpeza: edição da ficha, aprovação, início, conclusão, aceite com ressalvas, cobrança e recebimento parcial. Uma tentativa de aceite com ressalvas sem motivo foi bloqueada com mensagem compreensível.
- Todos os 26 perfis: recebimento fictício de R$ 50 e conferência do restante. Os atendimentos eram de R$ 150, exceto acessórios, com R$ 100 de serviço e material do cliente sem preço de venda.
- Banco: preservação dos campos técnicos, isolamento entre empresas, rejeição de pagamento maior que o saldo e repetição de operações sem duplicação. Nos 16 perfis não automotivos: equipe, horas, comissão, aceite/retirada, reabertura, reversão/reaplicação do estoque e retrabalho incluído nos relatórios. Vidros com condição de segurança suspensa não puderam ser concluídos.
- Telas extras: agenda, estoque, serviços, funcionários, compras, relatórios, garantias e site nos dez automotivos; nos outros dezesseis, também cadastro de equipamentos/locais. Foram inspecionados carregamento, títulos, textos e exemplos. Abrir essas telas não equivale a testar cada operação interna; as operações adicionais têm cobertura nas suítes de regressão e na revisão anterior.
- Responsividade: entrada rápida de funilaria e relatório de limpeza em viewport de 390 × 844, sem extravasamento horizontal. Seleção de valores no gráfico de limpeza conferida pela interface.

## Verificação final

- 131/131 suítes locais aprovadas no runner geral. O teste das 26 jornadas foi repetido depois do ajuste final dos dados fictícios de pagamento para banco/Pix.
- TypeScript, ESLint e Prettier aprovados; build de produção concluído.
- O build mantém avisos não bloqueantes de importações dinâmicas de módulos também importados estaticamente. Isso não foi apresentado como erro funcional nem como ganho de desempenho nesta rodada.
- Nenhum erro de console na captura final do navegador.
- PDFs de eletrodoméstico em domicílio e orçamento de climatização renderizados e conferidos visualmente; validações de conteúdo cobriram todos os 16 perfis não automotivos.

## Evidências e reprodução

Arquivos em **output/avaliacao-completa-2026-10-19/**:

- jornadas-interface.json, jornadas-banco.json e telas-complementares.json: resultados por perfil.
- regressao-final.log, resultado-regressao.json, jornadas-banco-final.log, typescript.log, lint.log, formatacao.log e build.log.
- Capturas textuais por perfil/tela; pdf/ com os 48 documentos; imagens desktop/mobile da entrada rápida e do relatório.

Suítes novas: supabase/tests/validate-cenarios-especialidades.mjs, scripts/testar-documentos-subsetores.mjs e scripts/testar-conta-recebimento-ui.mjs. Cenários: supabase/tests/cenarios-especialidades.mjs. A bancada local aceita **node --experimental-strip-types scripts/qa-site-local.mjs --subsistemas --realista**. Para repetir toda a regressão: **npm test**.

## Referências usadas na revisão das particularidades

- [Samsung — backup de dados](https://www.samsung.com/br/support/mobile-devices/como-fazer-backup-no-smartphone-samsung-galaxy/): registro de orientação/cópia sem prometer recuperação de todos os aplicativos.
- [Samsung — suporte](https://www.samsung.com/br/support/): preservação dos dados e recursos de atendimento; autorizações não devem ser presumidas pelo encerramento do reparo.
- [Michelin — calibragem](https://www.michelin.com.br/auto/conselhos/calibragem-do-pneu/calibrar-pneus): referências do veículo, em vez de uma pressão universal imposta pelo sistema.
- [Dell — limpeza e manutenção](https://www.dell.com/support/kbdoc/pt-br/000124077/como-limpar-e-manter-seu-computador-dell): cuidados com equipamento e dados. Referências específicas de manutenção e limpeza permanecem nos relatórios anteriores.

## Limites desta avaliação

Não houve envio de WhatsApp/e-mail, transação bancária, emissão fiscal real, ensaio físico de manutenção, teste de carga com muitos usuários simultâneos ou homologação de autenticação/entrega de mensagens no ambiente publicado. Não se trata de garantia de ausência de qualquer bug. A evidência comprova os cenários e verificações descritos; integrações externas e operação após deploy continuam exigindo homologação própria.
