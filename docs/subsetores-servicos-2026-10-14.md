# Assistência técnica, manutenção e limpeza — 14/10/2026

## Subsistemas implementados

Treze especialidades novas se somam aos três perfis gerais desses ramos e aos dez automotivos. O ramo delimita o sistema; a especialidade da empresa define o padrão; cada atendimento pode escolher um subsetor do mesmo ramo. A ficha salva mantém seu perfil original, mesmo quando o padrão da empresa muda.

| Ramo | Subsetor | Particularidades registradas |
| --- | --- | --- |
| Assistência | Celulares e tablets | Série/IMEI, acessórios, condição e funções na entrada, líquido/oxidação, backup, modo de reparo, autorização sobre dados, diagnóstico, componentes, testes, garantia e retirada |
| Assistência | Informática e notebooks | Configuração de hardware/sistema, erros, armazenamento/memória, autorização para dados, software autorizado, comportamento térmico e teste de estabilidade |
| Assistência | Eletrodomésticos | Bancada ou domicílio, endereço, alimentação, instalação, código de erro, medições e ciclo de funcionamento |
| Assistência | Eletrônica e placas | Placa/revisão, alimentação, esquema de referência, pontos medidos, componentes e ensaio de bancada |
| Manutenção | Climatização e refrigeração | Ativo, modelo, capacidade, fluido, referência do plano/PMOC, responsável técnico, filtros, serpentinas, drenos e medições |
| Manutenção | Elétrica predial/comercial | Quadro/circuito, alimentação, falha, condições de liberação, proteções, intervenção e medições finais |
| Manutenção | Hidráulica e bombeamento | Rede, trecho, isolamento, tubulação, vazamento/obstrução, materiais e teste de estanqueidade/escoamento |
| Manutenção | Máquinas e equipamentos | Ativo, potência, horímetro, impacto da indisponibilidade, falha, vibração/temperatura, intervenção, horas parado e próxima manutenção por data/horímetro |
| Limpeza | Residencial | Cômodos, prioridades, extras, objetos frágeis, animais, acesso e referência de devolução de chaves |
| Limpeza | Comercial e condomínios | Contrato/unidade/posto, turno, rotina por ambiente, reposição de insumos, resíduos e ocorrências |
| Limpeza | Pós-obra | Liberação da obra, resíduos, acabamentos, danos prévios, teste de compatibilidade, descarte e áreas que exigem retorno |
| Limpeza | Estofados e tapetes | Peças/lugares, tecido/etiqueta, manchas, limites combinados, teste de cor, método, secagem e liberação de uso |
| Limpeza | Vidros e fachadas | Superfície, altura/acesso, referência da liberação, clima/restrições, teste do produto, isolamento e acabamento |

Cada perfil fornece seus próprios campos, checklist inicialmente desmarcado, etapas técnicas e indicador de preenchimento. Medições, tolerâncias, diluições, autorização, prazo de garantia e aceite dependem de registro humano: não são presumidos nem certificados automaticamente.

## Fluxos e reaproveitamento

- Cadastro da empresa e Configurações oferecem os novos perfis. A demonstração permite entrar diretamente em qualquer um deles.
- O formulário permite escolher o subsetor antes de salvar. Alternar temporariamente entre perfis conserva as anotações em memória até fechar o formulário; após salvar, o perfil fica protegido para manter o histórico.
- O editor de fichas é compartilhado com o automotivo. Nos serviços, os grupos ficam recolhidos e podem ser abertos individualmente. O layout automotivo mantém sua apresentação anterior.
- Clientes, equipamentos/locais, agenda, equipes, catálogo, compras, estoque e financeiro continuam nos módulos compartilhados. Não são criados veículos ou OS automotivas para representar serviços desses ramos.
- O painel tem filtros por subsetor, situação e etapa; busca também por equipamento/local, série/IMEI e ativo. Os cartões destacam até três informações técnicas pertinentes.
- Atalhos filtram pendências, serviços atrasados e, conforme o ramo, equipamentos prontos para retirada ou retornos a agendar. Os números representam a posição atual, não faturamento nem produtividade histórica.
- A próxima visita pode ser agendada pelo cartão com atendimento e data já selecionados. Mantém a seleção de equipe, recorrência e prevenção de sobreposição da agenda existente. Uma reserva válida para a data prevista ou posterior retira o atendimento da fila de retorno; cancelamento/falta não cumpre essa pendência.
- O prazo técnico (`ficha_especialidade.campos.prazo_servico`) é independente do vencimento financeiro. Painel e sininho usam o prazo técnico quando há ficha. Registros legados sem ficha conservam a data combinada que já possuíam.
- A etapa técnica não encerra automaticamente o contrato e não cria cobrança. Aprovação, conclusão e geração de cobrança continuam explícitas; faturar repetidamente o mesmo atendimento não duplica o título financeiro.
- A conferência detalhada das fichas fica recolhida. Seus indicadores medem dados registrados, não aprovação automática da qualidade do serviço.

## Pesquisa e decisões de produto

Fontes primárias consultadas em 14/10/2026. A tradução das práticas em campos e fluxos é uma decisão de produto. O sistema registra a execução; não substitui o responsável técnico nem emite certificação ou PMOC completo automaticamente.

| Referência | Decisão aplicada |
| --- | --- |
| [Apple — preparar equipamento para serviço](https://support.apple.com/pt-br/109519) | Preparação e proteção dos dados em celulares; nenhuma solicitação de senha pessoal na ficha |
| [Dell — diagnóstico e reparo](https://www.dell.com/support/kbdoc/pt-br/000132374/como-agendar-um-reparo-fora-da-garantia-em-seu-computador-dell) | Separação entre diagnóstico de hardware, software e validação em informática |
| [Samsung — assistência domiciliar e em loja](https://news.samsung.com/br/saiba-como-solicitar-os-servicos-de-assistencia-domiciliar-e-em-loja-da-samsung) e [suporte a eletrodomésticos](https://www.samsung.com/br/support/category/home-appliances/) | Modalidade de atendimento, modelo, código de erro e ciclo funcional |
| [Fluke — ferramentas de teste elétrico](https://www.fluke.com/pt-br/produtos/teste-eletrico) | Campos para pontos medidos, resultados e ensaio; sem inventar limites de referência |
| [Daikin — checklist de manutenção](https://www.daikin.com.br/blog/2023/12/22/checklist-da-manutencao-de-ar-condicionado-para-o-verao/) e [plano de manutenção](https://www.daikin.com.br/blog/2019/06/19/aprenda-a-fazer-uma-manutencao-preventiva-de-ar-condicionado-dentro-dos-padroes-da-pmoc/) | Ativo, referência do plano, inspeção, manutenção, medições e retorno |
| [Schneider Electric — manutenção preventiva](https://blog.se.com/br/servicos/2017/08/28/manutencao-preventiva-maior-vida-para-seu-equipamento-de-distribuicao-eletrica-por-um-custo-otimo/) | Circuitos, inspeções e teste final na manutenção elétrica |
| [Tigre — catálogos técnicos](https://www.tigre.com.br/catalogos-tecnicos/) | Identificação da rede, aplicação, materiais e referências para hidráulica |
| [WEG — manutenção de motores](https://static.weg.net/medias/downloadcenter/h1e/h10/WEG-plano-de-manutencao-motores-e-geradores-de-grande-porte-aplicacao-naval-50049454-catalogo-portugues-br.pdf) | Ativo, horas de operação, inspeções e medições; os intervalos do documento não são aplicados como regra universal |
| [Kärcher — limpeza de estofados](https://www.karcher.com.br/br/dicas-karcher/qual-e-a-melhor-solucao-para-a-limpeza-profissional-de-estofados-carpetes-e-outros-tecidos.html) | Tecido, método, equipamentos e orientação após higienização |
| [Kärcher — áreas de recepção](https://www.karcher.com/pt/pt/professional/solucoes-profissionais/limpeza-da-area-de-rececao-c3946) | Organização por ambiente e superfície nos contratos residenciais/comerciais |
| [Kärcher — construção civil](https://www.karcher.com.br/br/profissional/solucoes-industriais/construcao.html) e [fachadas](https://www.karcher.com/pt/pt/professional/solucoes-profissionais/limpeza-de-fachadas-c2454) | Resíduos de obra, material da superfície, teste de compatibilidade e acabamento |

## Arquitetura e banco

- `especialidades.ts`: catálogo de perfis e tipos permitidos.
- `camposTecnicos.ts`: construtores compartilhados de campos.
- `perfisServicos.ts`: composição das fichas dos 13 subsetores, reaproveitando planejamento, recepção, visita e aceite.
- `operacaoServicos.ts`: regras puras de pendência, prazo, retirada e retorno.
- `FichaEspecialidade.tsx`: editor e apresentação comuns a todos os ramos.
- `Servicos.tsx`: fluxo único, adaptado por perfil, sem cópias de páginas por subsetor.

Migration nova: `20261014000200_subsetores_servicos.sql`. Depende da `20261014000100_fichas_especialidades.sql`. A nova migration amplia os catálogos, permite fichas do mesmo ramo por atendimento, protege o perfil salvo e separa o prazo técnico nos alertas. Não reclassifica empresas nem fichas e não reescreve migrations anteriores.

**Não aplicada ao Supabase remoto nesta tarefa.** Aplicar as migrations pendentes, na ordem, antes de publicar o frontend. A validação usa PostgreSQL em memória (PGlite) e a demonstração usa somente dados fictícios locais.

## Verificação

- Todos os 26 perfis: formato, campos, datas, medidas, opções, checklist, apresentação, resumo e indicadores.
- Os 13 novos subsetores: persistência via RPC em empresas gerais do mesmo ramo, tipos compatíveis, rejeição de troca do perfil salvo e de ramo incompatível, revisão concorrente, repetição sem duplicação e cobrança única.
- Prazo técnico independente da cobrança no painel e nos alertas; compatibilidade dos registros antigos.
- Retornos: reserva existente, cancelada, falta, concluída, outro atendimento e mudança de dia em São Paulo.
- Regressão dos fluxos multirramos, alertas, documentos e resumo automotivo.
- Navegador: seleção dos três ramos, atendimento de informática dentro da empresa configurada para celulares, gravação/reabertura, retirada, climatização, próxima visita e preenchimento automático do atendimento na agenda; ficha e filtros de estofados.
- Responsividade: painel e formulário conferidos em viewport de 390 px, sem transbordamento horizontal; capturas em `output/subsetores-estofados-desktop.png` e `output/subsetores-estofados-mobile.png`.
- Resultado: sete suítes de banco e cinco suítes de interface/regras/documentos aprovadas, além de TypeScript, ESLint dos arquivos alterados e build de produção. Após o ajuste final de compatibilidade dos registros antigos, as regras operacionais, a suíte dos subsetores, TypeScript, ESLint e build foram executados novamente com sucesso.

Os resultados dos comandos ficam em `output/subsetores-*`. Não foram realizados pagamentos, mensagens a clientes ou alterações de produção.
