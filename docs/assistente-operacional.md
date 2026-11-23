# Assistente operacional — 23/10/2026

## Situação da entrega

Implementação e validação local concluídas. Após autorização do usuário, a migração `20261022000100_assistente_operacional.sql` foi aplicada e a função `assistente-operacional` foi publicada no projeto `hzihxtjirttetnfdujcx` em 23/10/2026. A autenticação interna por JWT foi preservada; o verificador legado do gateway foi desligado conforme o arquivo de configuração.

**IA configurada e validada com o provedor real em 23/10/2026.** Após o usuário cadastrar os secrets e autorizar o uso de dados fictícios e créditos da API, texto e áudio sintético em português retornaram HTTP 200. Foram criados quatro orçamentos fictícios, um por ramo, nas empresas `ZZ [TESTE 20261019]`. Nenhuma empresa real foi usada nos testes; não houve envio de mensagens nem registro de pagamentos.

A validação pela interface revelou uma divergência entre a coluna Parados e a consulta do assistente. A correção `20261023000100_assistente_consultas_parados.sql`, validada localmente e aplicada ao projeto conectado, inclui orçamentos aguardando aprovação, lê o motivo da ficha técnica e aplica datas explicitamente solicitadas. Consultas sem filtro de data deixam de anunciar um período inexistente. A função foi atualizada para produzir respostas curtas, sem tabelas de texto; a interface também formata destaques em negrito sem interpretar HTML.

## Uso

- Na tela inicial, **Falar ou escrever** abre o assistente geral. O botão flutuante permite acessá-lo nas demais telas.
- Nas fichas de OS, atendimento e cliente automotivo, **Assistente** leva o registro selecionado como contexto. Agenda e relatórios compartilham a data/período em consulta.
- O usuário escreve ou grava até 90 segundos de áudio. Pode ouvir a gravação antes de enviar; a transcrição aparece na conversa.
- O assistente consulta dados da empresa, pergunta o que falta e apresenta um resumo com cliente, identificação, itens, quantidades, preços e total. **Confirmar e salvar** executa a ação; ditar “confirmo” não salva.
- Uma correção invalida o resumo anterior. Trocar de ficha inicia outra conversa para evitar aproveitar uma proposta de outro atendimento.
- Depois de salvar, **Ver registro** abre a tela normal do sistema para continuar trabalhando.

## Escopo implementado

| Pedido | Comportamento |
| --- | --- |
| Criar orçamento ou OS | Consulta cliente, veículo/aparelho/local e catálogo. Reutiliza as funções de cadastro de cada ramo. Novo orçamento automotivo é emitido para aprovação com validade de sete dias. Uma nova OS não representa aprovação do orçamento nem pagamento. |
| Corrigir pedido | Reprepara todos os dados e invalida a proposta anterior. |
| Serviço/peça avulsa | Exige preço informado; não inventa valores nem considera preço ausente como zero. |
| Acrescentar itens à OS | Preserva itens anteriores e exige a revisão atual do registro. |
| Anotação interna | Adiciona anotação ao atendimento selecionado, sem publicar mensagem ao cliente. |
| Agenda | Prepara agendamento com as regras do ramo; assistência/manutenção/limpeza suportam visita e deslocamento. Conflitos são verificados pelas funções existentes. |
| Recebimento | Exige título, valor, forma e conta; suporta pagamento parcial e vencimento do restante. Confere saldo e revisão novamente ao salvar. |
| Garantia/retrabalho | Prepara registro relacionado ao atendimento, com motivo, custo e tempo informados, respeitando permissão de gestão. |
| Consultas | Clientes, objetos, catálogo, OS/atendimentos, serviços parados, estoque, contas, devedores, financeiro, agenda e recursos. |
| Conta em PDF | Permite selecionar títulos de um cliente, atualiza saldos antes da exportação e reutiliza o documento de cobrança existente. Não envia o arquivo automaticamente. |

Exemplos: “Faça um orçamento de troca de tela do iPhone 13 para João”; “Acrescente duas unidades desse serviço”; “Mostre as contas em aberto da Maria”; “Quanto recebemos neste mês?”. Homônimos e dados insuficientes exigem esclarecimento.

O assistente não oferece uma ferramenta irrestrita para alterar qualquer cadastro. Ações fora do escopo são encaminhadas à tela apropriada. Clientes ainda não cadastrados precisam ser cadastrados pelo fluxo existente. Diagnósticos, compatibilidade de peças e especificações de óleo não são inferidos de modelo/ano.

## Segurança e consistência

- Plano com a funcionalidade `ai`; permissões por empresa e usuário são verificadas no servidor a cada consulta, preparação e confirmação.
- A função utiliza o JWT do usuário, sem chave administrativa do Supabase.
- Ferramentas fechadas, sem SQL livre, envio externo ou confirmação automática pelo modelo.
- Os preços do catálogo vêm do banco. Alteração de preço ou revisão entre preparo e confirmação exige novo resumo.
- Propostas expiram após 15 minutos. Confirmação repetida retorna o registro já criado, sem repetir itens, OS ou recebimento.
- Consultas retornam no máximo 30 registros e indicam possível continuação. Períodos financeiros limitados a um ano. Estoque mostra **saldo registrado**, sem deduzir reservas.
- Financeiro separa competência de receita/despesa e data do recebimento; estornos reduzem o valor recebido. Consultas financeiras exigem permissão financeira.
- Limite inicial de 120 pedidos por empresa em janela móvel de 24 horas. O código atual busca até 30 itens em lote, limita as consultas simultâneas a três, reaproveita buscas repetidas no mesmo pedido e mantém limites de 16 rodadas/32 chamadas de ferramentas para evitar ciclos. Áudio de até 10 MB.
- Áudio não é salvo no banco da aplicação. Texto, dados necessários das consultas e áudio enviado são processados pelo provedor configurado. `store: false` é usado na Responses API. Respostas e propostas ficam registradas no banco para controle de versão e repetição segura.

## Configuração e publicação

1. `OPENAI_API_KEY` e `OPENAI_MODEL` foram cadastrados pelo usuário no servidor. As chamadas reais confirmaram acesso ao provedor. O modelo indicado na configuração foi `gpt-6.1-sol`; `OPENAI_TRANSCRIBE_MODEL` é opcional e usa `gpt-transcribe` por padrão. As chaves não foram copiadas para o frontend nem para as evidências.
2. O servidor do assistente já está publicado. As chamadas consomem créditos da conta de API configurada; manter faturamento e limites dessa conta disponíveis.
3. **O frontend não foi publicado na Vercel nesta etapa.** A interface local foi verificada usando o Supabase e a IA reais. Após o deploy do frontend, conferir login e permissão do microfone nos aparelhos usados pela empresa.

As quatro migrações do assistente (`20261022000100`, `20261023000100`, `20261023000200` e `20261023000300`) e a função já estão publicadas; não reaplicar a migração inicial. O projeto conectado não possui `supabase_migrations.schema_migrations`: a execução pelo editor foi verificada diretamente pelas estruturas instaladas, permissões e consultas autenticadas.

Para publicação manual no painel, `npm run preparar:funcoes` gera `tmp/funcoes/assistente-operacional.ts` com o protocolo, a busca por nomes parecidos e a triagem automotiva incorporados. Pela CLI, publicar a pasta original com `index.ts`, `protocolo.mjs`, `catalogo-assistente.mjs` e `aplicacao-automotiva.mjs`. Os secrets não são incluídos no arquivo gerado. A captura do microfone no celular exige HTTPS e permissão do navegador.

## Evidências da validação local

| Camada | Resultado e limite |
| --- | --- |
| Banco com todas as migrações em PGlite | Fluxos nos 26 subsetores: consulta, orçamento, OS, inclusão de itens, anotação, garantia, agenda, conflito e confirmação única. Também saldo parcial, estorno, revisão/preço alterado, proposta vencida, permissões e isolamento entre empresas. Nenhum dado remoto alterado. |
| Protocolo | Oito testes: contratos, limites, erros, correções, ferramentas permitidas, rotas e seleção de contas. |
| Adaptador HTTP | Sete testes com provedor simulado: autenticação, configuração ausente, repetição, consulta com JWT, transcrição, limites de arquivo e falha do provedor. |
| Interface no Chrome | 1280, 390 e 320 px: texto, preparação sem gravação, confirmação única, microfone com dispositivo fictício, prévia do áudio, contexto da ficha e ausência de transbordamento horizontal/erros JavaScript. API interceptada, sem chamada paga. |
| Regressão geral | 140/141 suítes passaram na primeira execução. A única falha foi o bloqueio de localhost do ambiente no teste `testar-segredos-dev.mjs`; o mesmo teste passou ao executar com acesso ao servidor local. O adaptador HTTP foi validado separadamente. |
| Qualidade | ESLint dos arquivos alterados e build de produção TypeScript/Vite aprovados. Vite mantém avisos de imports dinâmicos que também são estáticos em módulos existentes. |
| Publicação no Supabase | Três tabelas com RLS e seis RPCs instaladas; confirmação negada ao papel anônimo. Consultas autenticadas aprovadas em quatro empresas fictícias: automotivo, assistência, manutenção e limpeza. A configuração ausente foi testada antes da ativação; após configurar, texto e áudio retornaram HTTP 200. |
| Fluxo com IA real | Nos quatro ramos: busca do catálogo, orçamento de uma unidade por R$ 100,00, correção para duas unidades/R$ 200,00, bloqueio da proposta antiga, confirmação e consulta do documento gravado. Repetir a confirmação retornou o mesmo registro. Foram criados exatamente quatro orçamentos neste roteiro. |
| Preço ausente | O pedido de serviço avulso sem preço fez o assistente perguntar o valor; nenhuma proposta foi preparada. |
| Áudio real de teste | WAV sintético com voz pt-BR: “Mostre os serviços parados, sem salvar nada.” A transcrição final foi correta e a consulta retornou o orçamento aguardando aprovação. Uma tentativa inicial com voz inadequada gerou pedido de esclarecimento, sem alteração. Microfone físico e ruído de oficina não foram avaliados nesta etapa. |
| Consulta e interface corrigidas | O orçamento nº 302 apareceu tanto no painel quanto no assistente, com motivo e valor corretos. Filtros e ausência de datas conferidos remotamente nos quatro ramos. Regressão do banco nos 26 subsetores, 8 testes de protocolo, 7 testes HTTP, ESLint e build aprovados após as correções. |

Comandos reproduzíveis:

```powershell
node scripts/testar-assistente.mjs
node scripts/testar-assistente-http.mjs
node scripts/testar-assistente-aplicacao.mjs
$env:DB_VALIDATION_RUNTIME = (Resolve-Path 'node_modules/@electric-sql/pglite/dist/index.js').Path
node supabase/tests/validate-assistente-operacional.mjs
npm run build
```

Evidências locais: `output/assistente-banco.log`, `output/assistente-build.log`, `output/assistente-regressao.log` e `output/assistente-qa/resultado-interface.json`. Capturas em `output/assistente-qa/proposta-1280.png`, `proposta-390.png` e `proposta-320.png`. Esses arquivos de evidência são ignorados pelo Git.

Os testes comprovam os cenários descritos; não garantem interpretação perfeita de qualquer fala. Os casos locais abrangem os 26 subsetores; a validação com o provedor real usou uma empresa de cada um dos quatro ramos. A confirmação humana continua obrigatória para salvar.

Evidências da publicação: `output/assistente-publicacao/banco-aplicado.png`, `funcao-publicada.png`, `banco-verificacao.txt`, `funcao-publicada.txt` e `verificacao-remota.json`. SHA-256 da migração aplicada: `8EF70865CFA706AF09965E74E6FC5CD5297B92166FB0ADF97DC542853DEC3FAD`. SHA-256 do código consolidado publicado: `AA7BC5784082E90DA72CD893F9ED43A11E460B2A6C05841DAB238CA06A956F50`.

Evidências da homologação real: `output/assistente-publicacao/homologacao-real.json`, `verificacao-final.json`, `assistente-real-validado.png` e `correcao-consultas.png`. Os registros contêm somente dados das empresas fictícias, sem credenciais. A migração corretiva tem SHA-256 `B558D34C6735692326C86586279A8D9D3E8FF2EA362F8089572656BD95E29C2E`; o código consolidado atualizado tem SHA-256 `99788F7563DDE932D50995AC592F441B2CD14068C45CA9A05F4F90691A77090E`. Os hashes anteriores identificam a publicação inicial.

## Seleção de serviços por aplicação — 23/10/2026

A ferramenta `sugerir_servicos_automotivos` consulta o catálogo real e classifica os serviços pela operação solicitada, marca, família de motor e, quando conhecidos, combustível e cilindros. Aplicações reconhecidamente incompatíveis são excluídas. A preparação também rejeita um serviço incompatível que o modelo tenha tentado selecionar. Preços continuam vindo do banco; preço menor não desempata aplicações.

- No caso **Prisma → retífica de cabeçote**, o serviço GM recebe preferência sobre o genérico e a aplicação diesel de três cilindros é excluída. O resumo separa **Veículo: GM Prisma** de **Motor (sugerido): GM Família 1**.
- Uma família informada explicitamente pelo usuário prevalece sobre a inferência do veículo. Palio ou Fiesta sem versão/motor não recebem automaticamente Fire, Fiasa ou Rocam. A atualização de aproximação descrita abaixo seleciona um serviço como padrão editável quando há empate, com aviso; isso não preenche a família de motor desconhecida.
- O usuário pode usar **Alterar veículo**, **Alterar motor** ou **Trocar item** no próprio resumo. O botão preenche e foca o campo da conversa. Uma escolha explícita de outro serviço compatível prevalece sobre a sugestão; enquanto houver correção escrita ou áudio pendente, a confirmação do resumo antigo fica desabilitada.
- A migração `20261023000200_assistente_aplicacao_automotiva.sql` preserva motor e modelo em campos separados ao preparar, confirmar, editar e converter um orçamento em OS. O motor entra no orçamento antes da publicação da versão; a ficha de um veículo já cadastrado não é alterada pelo assistente.
- A triagem é comercial e limitada às informações reconhecidas. Não é uma base universal de compatibilidade de peças, nem determina diagnóstico, óleo, cilindrada ou ano. A família inferida aparece como sugestão editável.

### Validação desta alteração

| Verificação | Resultado |
| --- | --- |
| Triagem e protocolo de aplicação | 7 testes aprovados: Prisma/GM versus diesel, Rocam versus Sigma, motores ambíguos, empates, incompatibilidades, catálogo vazio e bloqueio da ferramenta nos outros ramos. |
| Regressão do banco | Fluxos dos 26 subsetores aprovados; nos automotivos, conferidos motor/modelo separados e preservação na edição e conversão do orçamento em OS. |
| Protocolo e HTTP | 8 testes de protocolo e 7 do adaptador HTTP aprovados. |
| Qualidade | ESLint dos arquivos alterados e build TypeScript/Vite aprovados. Permanecem os avisos de imports dinâmicos já descritos. |
| IA real, empresa fictícia de retífica | Prisma selecionou o serviço GM por R$ 375,00. Ao corrigir veículo para Ford Fiesta e motor para Rocam, selecionou o serviço Rocam por R$ 410,00. |
| Interface e escolha manual | Alterar motor e Trocar item preencheram/focaram a conversa. Confirmar ficou desabilitado durante a edição. A troca explícita pelo serviço genérico cadastrado foi respeitada, atualizando para R$ 100,00 e preservando GM Prisma / GM Família 1. Sem erros de console. |

Foram acrescentados quatro serviços identificados com `QA IA 23/10` somente ao catálogo da empresa fictícia `ZZ [TESTE 20261019] Retífica`. Esta rodada preparou propostas, mas **não criou nenhum orçamento ou OS**, nem registrou pagamentos. A migração e a função atualizada foram aplicadas ao Supabase conectado. O frontend continua local, aguardando o deploy separado na Vercel.

Evidências em `output/assistente-publicacao/`: `aplicacao-real.json`, `aplicacao-interface.txt`, `aplicacao-campos-editaveis.png`, `aplicacao-trocar-item.png`, `aplicacao-banco-publicado.png`, `aplicacao-funcao-publicada.png`, e logs `aplicacao-banco.log`, `aplicacao-filtros.log`, `aplicacao-protocolo.log`, `aplicacao-http.log`, `aplicacao-lint.log`, `aplicacao-build.log`.

SHA-256 da migração aplicada: `855F753FF0FE928600EBCE31B3B6240A0DCF8013AF925014FE2EA40BD4431954`. SHA-256 do código consolidado publicado após o ajuste de escolha manual: `75A39A9E6A3B1B7FE050D7E05D4A82404AE6F8953EFB09AE696648141FC3F6F0`.

Referências consultadas para manter o filtro conservador: [manual Chevrolet Prisma 2016.5, dados técnicos](https://www.chevrolet.com.br/content/dam/chevrolet/south-america/brazil/portuguese/index/services/owner-manuals/05-pdf/prisma/my16.5-prisma-52126891-por-20160321-v0.2-baixa.pdf), [ficha técnica New Fiesta 2019](https://www.ford.com.br/content/dam/Ford/website-assets/latam/br/nameplate/2019/fiesta/pdf/ficha-tecnica-new-fiesta.pdf) e [ferramentas fechadas da API OpenAI](https://developers.openai.com/api/docs/guides/function-calling).

## Correção de pedidos com vários serviços e identificação livre — 23/10/2026

**Situação: publicada e validada com a IA real.** Após a autorização explícita do usuário, a migração `20261023000300_assistente_identificacao_livre.sql` foi executada no Supabase conectado, com resultado “Success. No rows returned”, e a função consolidada foi publicada. A revisão automática havia bloqueado a execução anterior; nenhuma tentativa de contornar o bloqueio foi feita.

O erro “Este pedido precisa ser dividido em etapas menores” vinha do teto de dez chamadas, com serviços pesquisados individualmente. A ferramenta `buscar_itens_catalogo` agora pesquisa todos os itens juntos. Ela continua consultando apenas o catálogo de serviços/peças e usando os preços reais, sem transformar o carro/equipamento em objeto de busca obrigatório.

Para novos documentos, a identificação é texto livre. Carro/aparelho/local não informado deixa o registro identificado explicitamente como não informado; um motor AP permanece no campo motor, sem inventar o carro e sem perguntar de novo quando o usuário manda seguir. Quantidade não dita usa uma unidade editável no resumo, sem inferir quantidade de bielas ou cilindros. Preço ausente e cliente ambíguo continuam exigindo esclarecimento.

Opcionais informados ficam separados: placa no automotivo; marca, modelo e série/IMEI na assistência; marca, modelo, série e endereço na manutenção; endereço na limpeza. Campos de outro ramo são rejeitados, não misturados. A seleção explícita de um objeto existente continua protegida pelo vínculo com o cliente e não altera seu cadastro compartilhado. Para criar com novos detalhes, usa-se identificação manual.

Validação local: cinco testes novos incluem sete e trinta serviços com motor AP sem pesquisar objetos, filtro de aplicação, busca em lote nos demais ramos e contratos fechados. Regressão do banco aprovada nos 26 subsetores, incluindo OS com sete itens sem identificação, orçamento com dados livres e gravação dos opcionais. Também aprovados 8 testes de protocolo, 7 de aplicação, 7 HTTP, ESLint e build. Evidências: `output/assistente-publicacao/pedido-completo-banco.log`, `pedido-completo-lint.log` e `pedido-completo-build.log`.

O roteiro `output/assistente-publicacao/testar-pedido-completo-real.mjs` passou com dados fictícios de retífica, celulares, climatização e limpeza. Todas as chamadas retornaram HTTP 200. Na retífica, os sete serviços para motor AP foram preparados em uma única OS (R$ 865,00), com veículo não informado e quantidade padrão de uma unidade por item. A correção posterior para VW Gol e placa ABC1D23 preservou os sete itens. Nos demais ramos, identificação livre e opcionais foram mantidos em campos separados. Nenhuma consulta ao cadastro de objetos foi necessária. Nenhum documento foi confirmado ou gravado; não houve pagamento ou envio de mensagens. Foram acrescentados somente sete serviços com prefixo `QA IA completo` ao catálogo da empresa fictícia de retífica para este teste.

A interface local, conectada ao servidor real, também preparou os mesmos sete serviços e mostrou motor AP separado de “Veículo não informado”, com confirmação disponível e sem erros de console. A alteração de frontend continua no código local para o deploy separado na Vercel.

Evidências da publicação e teste real em `output/assistente-publicacao/`: `pedido-completo-banco-publicado.png`, `pedido-completo-funcao-publicada.png`, `pedido-completo-real.json`, `pedido-completo-interface.txt`, `pedido-completo-sem-carro.png` e `pedido-completo-total.png`. Os arquivos não contêm credenciais.

SHA-256 da migração preparada: `761E78C58DE38DC46EB49FDDC0A3233296566CB8DD9BB0037CA4F8B3B98D5045`. Código consolidado: `CE362600357EAA58F687B4168AC8BCA8A4CB8CE3AD49CB046F75DD40F372A752`.

## Serviços com nome aproximado — 23/10/2026

**Situação: função publicada e validada com IA real; interface atualizada localmente.** Não houve nova migração nem alteração de permissões. O deploy do frontend na Vercel permanece separado.

Quando o nome de um serviço não corresponde exatamente ao catálogo, o assistente busca o nome mais parecido encontrado e o usa como padrão editável, com o preço real cadastrado. O resumo destaca **Sugestão por nome parecido**, preserva a expressão original em **Você pediu** e oferece **Trocar item**. O botão preenche e foca a conversa; a confirmação fica desabilitada enquanto houver uma correção pendente. Alterar somente a quantidade mantém o aviso. Escolher explicitamente outro serviço substitui a sugestão.

A busca compartilhada atende automotivo, assistência, manutenção e limpeza. Compara palavras normalizadas, tolera erros de digitação e amplia as consultas por palavras/prefixos quando necessário. As consultas continuam limitadas: não carregam o catálogo inteiro e indicam quando pode haver mais resultados. Portanto, a sugestão corresponde ao melhor candidato encontrado nessas buscas. Empates usam ordem estável, nunca preço menor. Sem candidato minimamente parecido, o assistente pede esclarecimento em vez de inventar um serviço ou valor.

O filtro automotivo continua excluindo aplicações reconhecidamente incompatíveis. A aproximação não resolve homônimos de clientes nem permite substituir serviços por peças. O aviso fica na conversa e na prévia, sem entrar nas observações do documento do cliente.

| Verificação | Resultado |
| --- | --- |
| Testes locais | 34 testes aprovados: protocolo, HTTP, aplicação automotiva, pedidos completos e 7 casos novos de aproximação. Incluem erros de escrita, empates, catálogo vazio, preços reais, exclusão de peças e aplicação diesel incompatível. |
| IA real, quatro empresas fictícias | “Embochar biela” → Embuchamento biela VW AP; “troca de tella” → Troca de tela; “manutenssao do split” → Manutenção do split; “limpesa conforme escopo” → Limpeza conforme escopo. Todos com aviso e preço do catálogo. |
| Correção pelo chat | Na retífica, duas unidades mantiveram o aviso. A escolha explícita de Polimento virabrequim VW AP removeu a aproximação e totalizou R$ 120,00. |
| Interface | Aviso, nome solicitado, preço e Trocar item conferidos visualmente. Botão focou a conversa e bloqueou confirmação durante a edição. Nenhum erro de console. |
| Qualidade | ESLint dos arquivos alterados e build TypeScript/Vite aprovados. Permanecem avisos existentes sobre imports dinâmicos também estáticos. |

Os testes reais usaram somente empresas fictícias `ZZ [TESTE 20261019]`. As propostas do roteiro foram canceladas; nenhum documento foi confirmado, nenhum pagamento foi registrado e nenhuma mensagem foi enviada a clientes. A verificação visual deixou uma prévia sem salvar na empresa fictícia de retífica.

Evidências em `output/assistente-publicacao/`: `aproximacao-testes.log`, `aproximacao-lint.log`, `aproximacao-build.log`, `aproximacao-real.json`, `aproximacao-interface.txt`, `aproximacao-edicao.txt`, `aproximacao-console.json`, `aproximacao-chat.png` e `aproximacao-funcao-publicada.png`. Roteiro reproduzível: `testar-aproximacao-real.mjs --dados-ficticios-autorizados` no mesmo diretório. Evidências e credenciais locais não são versionadas.

SHA-256 do código consolidado publicado: `031CEF656615B856AA9ED31906A8EB984DD84CD566340A3402070E6CE991B08C`.

## Tipo de documento e envio do chat — 23/10/2026

**Situação: correção do servidor publicada; interface atualizada localmente.** Sem nova migração. O deploy da interface na Vercel permanece separado.

O tipo do documento antes dependia exclusivamente do argumento escolhido pela IA. O protocolo agora reconhece pedidos explícitos de OS/orçamento nas mensagens do usuário, respeita correções e negações e valida o tipo antes de preparar no banco. A tela de Orçamentos e uma resposta anterior incorreta da IA não substituem o pedido. Quando a ferramenta tenta preparar o tipo errado, recebe a indicação para refazer; essa tentativa não chega ao banco. Alterar quantidade mantém o tipo, enquanto mudar explicitamente entre OS e orçamento é permitido. Incluir itens numa OS existente conserva seu fluxo próprio. Essa verificação cobre expressões reconhecidas; não representa garantia de interpretação de qualquer fala possível.

Foram corrigidos pontos que podiam deixar o chat ocupado: a espera por resposta tem prazo de 115 segundos, cancela a requisição e mantém o texto/áudio para reenviar; a atualização das listas após uma confirmação já bem-sucedida acontece em segundo plano; uma falha do gravador libera o campo para digitação. O teste isolado reproduziu uma lista que nunca termina de atualizar e um gravador que já estava inativo ao disparar erro, sem travar o envio com as correções.

A interface distingue **Confirmar e criar OS**, **Confirmar e criar orçamento**, **Enviar mensagem** e **Enviar correção**. O campo vazio tem uma explicação do próximo passo. O resumo permite **Mudar para OS/orçamento** sem repetir cliente ou itens. Correção pendente impede confirmar ou trocar o tipo antes de enviá-la. O atalho inicial também oferece criar uma ordem de serviço. Nenhuma mensagem ou áudio confirma automaticamente a gravação.

| Verificação | Resultado |
| --- | --- |
| Testes automatizados | 44 aprovados, incluindo 10 testes novos de tipo, precedência do pedido, rejeição da ferramenta incorreta nos quatro ramos, inclusão em OS existente, prazo, cancelamento e rótulos. |
| IA real nos quatro ramos | Orçamento inicial, correção explícita para OS com a tela de Orçamentos como contexto e edição para duas unidades: todos preservaram o tipo correto. |
| Áudio sintético pt-BR | “Eu quero uma ordem de serviço, com o mesmo cliente e os mesmos itens. Não faça orçamento. Ainda não salve.” Transcrito corretamente e retornou uma OS. A mudança posterior explícita para orçamento também funcionou. |
| Interface isolada | Erro de envio manteve o texto e permitiu reenviar. Confirmação simulada liberou o chat com a atualização da lista ainda pendente. Falha simulada de gravação permitiu digitar/enviar. |
| Interface com servidor real | Pedido explícito produziu OS; o botão Mudar para orçamento alterou a prévia preservando cliente e item. O caminho inverso foi validado no roteiro de IA real. Nenhum documento foi confirmado. |
| Qualidade | ESLint e build TypeScript/Vite aprovados. Permanecem avisos existentes de imports dinâmicos também estáticos. |

Os testes de IA real prepararam e cancelaram propostas somente das empresas fictícias `ZZ [TESTE 20261019]`, sem criar documentos ou registrar pagamentos. A única confirmação na interface ocorreu no cenário local com transporte simulado, sem banco. As prévias da conferência visual real não foram confirmadas.

Evidências em `output/assistente-publicacao/`: `tipo-envio-testes.log`, `tipo-envio-lint.log`, `tipo-envio-interface-lint.log`, `tipo-envio-build.log`, `tipo-envio-real.json`, `tipo-envio-erro-ui.txt`, `tipo-envio-apos-salvar-ui.txt`, `tipo-envio-gravador-ui.txt`, `tipo-envio-os-ui.txt`, `tipo-envio-os.png` e `tipo-envio-funcao-publicada.png`. Roteiro real: `testar-tipo-envio-real.mjs --dados-ficticios-autorizados`; cenário isolado: `tmp/assistente-envio-qa/index.html`. Não usam dados de empresas reais. Esses arquivos de evidência ficam fora do Git.

SHA-256 da função consolidada publicada: `E00984F5B497EA434224061CF6EA6C9CF6418C75631FF530FFF31CAEBCC235F1`. A validação junto da ferramenta segue a orientação de [function calling da OpenAI](https://developers.openai.com/api/docs/guides/function-calling).

## Revisão de produtividade — 26/10/2026

**Diretriz do produto:** reduzir o tempo total até o usuário concluir o atendimento, incluindo espera, digitação, cliques e retrabalho. Medir o caminho completo até salvar, preservando a conferência dos valores e o tipo de documento solicitado.

**Situação final:** otimizações publicadas no Supabase e conferidas com provedor e banco reais nos quatro ramos, após a liberação dos créditos. Interface testada localmente; deploy na Vercel permanece separado. Não houve nova migração de banco nesta revisão.

| Mudança | Ganho no uso diário | Limite preservado |
| --- | --- | --- |
| Consultas independentes de cliente e catálogo em paralelo | Evita esperar uma busca terminar para começar a outra; permite menos rodadas com o modelo. | Até três consultas de banco simultâneas por pedido, incluindo buscas internas do catálogo. Preparações permanecem sequenciais. |
| Reutilização de consultas iguais dentro do pedido | Evita repetir a mesma leitura, inclusive quando duas buscas pedem o mesmo catálogo simultaneamente. | Cache descartado ao terminar o pedido; não compartilha dados entre usuários/empresas nem conserva preços para a próxima mensagem. |
| Quantidade com menos/mais, digitação e remoção no próprio resumo | Dispensa escrever uma mensagem para cada ajuste simples. Vários ajustes são enviados juntos em uma única correção. | Quantidades inteiras de 1 a 10.000; o servidor recalcula e valida o resumo antes de permitir salvar. A correção ainda usa a IA. |
| Resumo em destaque e resultados consultados recolhidos | A ação de conferir e salvar fica mais fácil de encontrar. | Cliente, identificação, itens, valores e avisos de interpretação continuam visíveis no resumo. |
| Formulário de mensagem recolhido durante os ajustes | Mais espaço para editar no celular, com Atualizar resumo e Desfazer ajustes explícitos. | Ajustes pendentes bloqueiam a confirmação do resumo antigo. |
| Correção de largura, rolagem e controles no celular | Campo de quantidade compacto e controles na mesma linha, inclusive em 320 px. | A conferência visual usou viewports simulados; não substitui testes em aparelhos físicos. |
| Métricas numéricas por pedido | Permite localizar espera no modelo, transcrição, banco e preparação. | O log de desempenho não inclui textos, áudio, nomes, IDs ou chaves. A soma dos tempos de consultas simultâneas não representa o tempo de parede. |

### Evidências desta revisão

- **92 testes automatizados aprovados** de protocolo, catálogo, aplicação automotiva, HTTP, erros do provedor, documentos e produtividade. Incluem ordem de respostas das ferramentas, limite global de concorrência, reutilização de consultas, isolamento entre pedidos, cancelamento, preparação sequencial e ajustes em lote.
- **ESLint e build TypeScript/Vite aprovados.** O build mantém os três avisos preexistentes de importação dinâmica também estática.
- **Interface real com transporte simulado:** alterar duas quantidades e remover uma peça exigiu uma única correção; o total foi de R$ 525,00 para R$ 1.050,00. A confirmação aconteceu uma vez e liberou a interface mesmo com a atualização das listas ainda pendente. Não houve chamada ao provedor nem gravação no banco nesse cenário isolado.
- **Celular simulado em 320 px:** quantidade editada, resumo atualizado para R$ 900,00 e confirmação concluída. Controles revisados também em 390 px.
- **Comparação controlada, sem rede/API:** cinco amostras por versão, com 180 ms por rodada de modelo e 60 ms por consulta. Mediana de 809 ms antes e 503 ms depois (**38% menor**), com três rodadas de modelo antes e duas depois. Isso demonstra o efeito da organização das consultas nessa simulação; **não é uma medição da latência real da OpenAI**, nem uma promessa para todas as solicitações.

Evidências em `output/assistente-desempenho-20261026/`: `regressao.log`, `lint.log`, `build.log`, `medicao.json`, `resumo-atualizado.png`, `confirmacao-simulada.txt`, `ajustes-movel-320.png` e `resumo-movel-320.png`. Roteiros: `scripts/testar-assistente-desempenho.mjs`, `output/assistente-desempenho-20261026/medir.mjs` e `tmp/assistente-velocidade-qa/`.

As decisões seguem as orientações oficiais de [otimização de latência](https://developers.openai.com/api/docs/guides/latency-optimization) e [chamadas de ferramentas](https://developers.openai.com/api/docs/guides/function-calling): reduzir viagens ao modelo, executar leituras independentes em paralelo e validar ações na aplicação. O modelo configurado não foi trocado.

### Medição com o provedor real após a publicação

Foram refeitos cinco cenários completos: orçamento/texto em mecânica, celulares, climatização e limpeza, mais OS/áudio em celulares. Cada cenário incluiu pedido, correção, confirmação e abertura do registro salvo. Os quatro orçamentos usaram os controles rápidos de quantidade e remoção, enviados juntos em uma correção. Todos passaram na conferência estrita do banco.

| Solicitação | Amostras | Mediana no servidor | Faixa observada |
| --- | --- | --- | --- |
| Pedido inicial por texto | 4 | 8,7 s | 7,6–19,9 s |
| Ajustes pelo resumo | 4 | 6,2 s | 4,5–26,3 s |
| Pedido e correção por áudio | 2 | 11,2 s | 8,5–14,0 s |

A amostra é pequena e não constitui A/B real antes/depois. São tempos do servidor; não incluem toda a rede do navegador e a atualização visual. O percentual de 38% acima permanece exclusivo da simulação. Métricas individuais: output/assistente-desempenho-20261026/medicao-real.json. Versão publicada: publicacao.json na mesma pasta; a versão anterior foi preservada para recuperação manual.

### Situação da bancada real dos 26 subsetores

A bancada está concluída com **104/104 cenários aprovados nos 26 subsetores**, incluindo pedido, alteração, confirmação pela interface, leitura do banco e abertura da ficha. As 13 repetições que aguardavam créditos foram concluídas em 26/10. Cinco cenários foram refeitos novamente após publicar a otimização, sem regressão na matriz.

A migração da data `20261024000100` já havia sido aplicada com autorização e passado em **1.129 verificações locais** nos 26 subsetores. Registros antigos com data ausente foram preservados; os testes afetados foram refeitos. As correções de tratamento de falta de créditos/limites e a otimização de concorrência estão publicadas. Não houve pagamento nem envio de mensagem a cliente.

Relatório e matriz detalhada: `output/assistente-bancada-20261024/relatorio.html`; conferência: `conferencia.json` na mesma pasta. Não declarar a bancada integralmente concluída nem a velocidade real validada antes das repetições e medições pendentes. Nenhuma empresa real, pagamento ou mensagem ao cliente foi usado nesses testes.

## Bancada completa do assistente — 24 a 26/10/2026

**Situação: 104 cenários concluídos e conferidos nos 26 subsetores.** Foram usados somente usuários e empresas fictícias ZZ [TESTE 20261019]. Os 52 cenários de texto e 52 de áudio incluem pedido, edição, clique real na confirmação, consulta do registro persistido e abertura da ficha na interface. Há 2402 verificações dos registros e 131 documentos fictícios gravados, incluindo repetições. Resultados anteriores foram preservados no diretório de histórico.

Os quatro casos por subsetor cobrem orçamento/texto, OS/texto, orçamento/áudio e OS/áudio. Exercitam catálogo, identificação livre, serviço avulso com preço informado, quantidades, remoção e inclusão de itens, desconto, observações e data. Os dois turnos dos casos de áudio usam voz: pedido e correção. Os casos retomados em 26/10 mantiveram a data solicitada de 24/10. A confirmação não inicia nem entrega o serviço automaticamente.

Correções encontradas nesta bancada:

- **Data dos orçamentos automotivos:** a migração autorizada 20261024000100 acrescenta a data à versão, preserva-a na edição/revisão e conversão em OS e expõe o valor no documento e na consulta pública. Foi aplicada ao Supabase conectado, sem preencher nem excluir registros históricos. Os casos afetados foram refeitos.
- **Interpretação:** o protocolo interpreta linguagem informal e erros evidentes de escrita/fala, prepara um resumo editável e explica o entendimento. Nomes normalizados que não constavam literalmente na fala são apresentados como identificação interpretada. Não são inventados preço, diagnóstico, compatibilidade ou opcionais.
- **Voz:** foi acrescentado vocabulário curto por ramo à transcrição. Toyota Carala foi normalizado para Toyota Corolla com aviso. Houve um caso de GM Onix transcrito incorretamente; o atalho Alterar veículo corrigiu o nome sem perder os demais dados. Transcrição ainda pode errar.
- **Catálogo:** shampoo e xampu passam a ser reconhecidos como grafias equivalentes na busca de produtos. A equivalência não abre aproximação livre de peças.
- **OS versus orçamento:** ficha e listagem distinguem uma OS recebida de um orçamento. Pedir autorização no painel preserva o tipo OS. A ação Registrar autorização continua explícita, sem aprovar ou executar automaticamente.

Validação técnica: **92 testes automatizados aprovados**, **1.129 verificações de banco local nos 26 subsetores**, regressão do painel, TypeScript, ESLint e build de produção aprovados. O banco local cobre também confirmação idempotente, resumo substituído/expirado, alteração de preço, permissões, plano e isolamento entre empresas. O build mantém avisos existentes de importação dinâmica/estática e desempenho de plugins.

**Limite do teste de áudio:** a entrada do microfone foi substituída, somente na bancada, por WAVs sintéticos pt-BR. Os botões, envio, transcrição pelo provedor, interpretação, confirmação e gravação são reais. Microfone físico, ruído, sotaques e todos os dispositivos não foram homologados. Os testes não são garantia de ausência absoluta de bugs. Não houve pagamento nem envio de mensagem a cliente.

Função otimizada e migração publicadas no Supabase; cinco cenários refeitos após a otimização, cobrindo os quatro ramos e OS por áudio. Interface validada localmente, sem deploy na Vercel. Tempos reais em output/assistente-desempenho-20261026/medicao-real.json; não houve comparação A/B real. SHA-256 da função: 5D7129DF26FCA0249B49ACD8A444B01BC08B6E9145AAA5773A1CE6B7E78078C9. SHA-256 da migração: 8EC80C530D185A95B33B7E9BD65B874EBCDD80E0F8880CC527F1657BD119A29F.

Relatório e evidências locais: output/assistente-bancada-20261024/relatorio.html, resumo-final.json, conferencia.json, resultados/*-validado.json, resultados/*-registro.txt, capturas das fichas, WAVs e logs. Os arquivos de evidência não incluem credenciais; permanecem fora do Git. O roteiro de interface é roteiro-ui.mjs e deve ser executado pelo cua_repl, sem automação alternativa do navegador.
