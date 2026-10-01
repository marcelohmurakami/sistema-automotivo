# Expansão do sistema automotivo — 01/10/2026

## Entregue no código e no Supabase

- `/notinhas`: emissão atômica, numeração por oficina, PDF, listagem e cancelamento preservando os valores. Disponível desde o Básico. Não movimenta estoque ou financeiro e não comprova pagamento.
- Orçamentos: até 20 fotos JPG/PNG/WebP de até 10 MB por versão. Upload reservado, confirmação, recuperação de envio incompleto e congelamento após emissão. A revisão copia os vínculos das fotos. A proposta pública obtém links de Storage válidos por 60 segundos, somente após validar o token do orçamento.
- OS: PDF do atendimento com cliente, veículo, itens, valores, garantia e assinatura de recebimento. Não expõe observações internas nem histórico interno.
- Configurações: logo PNG/JPG reduzido no navegador, cor e rodapé. Notinhas e orçamentos preservam a identidade da emissão; a OS usa a identidade atual ao gerar o documento.
- `/meu-site`: configuração do site, publicação de peças do catálogo, habilitação do portal, liberação/revogação do cliente e gestão de pedidos.
- `/oficina/:slug`: site público e área autenticada. O cliente cria/confirma a conta; o responsável libera o cadastro cujo e-mail corresponde ao usuário confirmado. Dados e históricos são filtrados por acesso e oficina no servidor. Pedidos não cobram nem reservam estoque.
- `/automacoes`: fila de avisos de andamento e lembretes, autorização individual de envio, sugestão de texto com IA e histórico das próprias sugestões. A IA não diagnostica nem altera uma OS automaticamente.

Migrations `20261001000100` a `20261001000500` aplicadas no projeto `hzihxtjirttetnfdujcx`. Funções `fotos-proposta`, `assistente-oficina` e `automacoes-oficina` publicadas. A autenticação fica no código: token da proposta, usuário Supabase + plano, e segredo do agendador, respectivamente. O verificador de JWT legado está desligado para aceitar esse modelo e as chaves publicáveis novas.

## Estado das integrações externas

Instância n8n encontrada e acesso confirmado: https://n8n.murakamitech.tech.
Workflow salvo, ainda não publicado: https://n8n.murakamitech.tech/workflow/dBajzPqLKMPAgsug.
Nome: **Automotivo - Lembretes e avisos aprovados**.
Remetente escolhido pelo usuário: instância Evolution **estudos-whatsapp** existente.
Nenhum workflow do salão foi alterado. Nenhuma mensagem foi enviada.

O painel de Secrets do projeto automotivo não contém segredos customizados. Portanto, a publicação do código não significa que IA ou WhatsApp estejam ativos.

### Configuração restante

No Supabase, em Edge Functions → Secrets, configurar:

- `OPENAI_API_KEY`: chave existente autorizada para o projeto; nunca colocar no Vite.
- `OPENAI_MODEL`: identificador do modelo habilitado nessa conta.
- `AUTOMOTIVO_AGENDADOR_SECRET`: segredo aleatório forte (pelo menos 32 bytes) compartilhado somente com o n8n.
- `AUTOMOTIVO_CANAIS_JSON`: array por oficina, no formato abaixo. A URL Evolution é a documentada no sistema de salões. Confirmar a conexão e liberar somente o telefone de teste escolhido, diferente do remetente.

```json
[{"oficina":"UUID_DA_OFICINA","url":"https://evolution.murakamitech.tech","instancia":"estudos-whatsapp","chave":"CHAVE_EXISTENTE_DA_EVOLUTION","destinatarios":["+55DDDNUMERO_DE_TESTE"],"habilitado":true}]
```

No serviço n8n, configurar o mesmo `AUTOMOTIVO_AGENDADOR_SECRET` no ambiente. O workflow usa `$env`; a instância deve permitir leitura de ambiente pelos nós, como já documentado no projeto de salões. Não reutilizar a variável `SUPABASE_URL` do salão: o endpoint do automotivo já está fixado no workflow.

Com uma oficina no Completo, testar primeiro o fluxo manual. Sem aviso aprovado, só gera lembretes para revisão. Para testar envio, confirmar o número de teste e autorizar um aviso na interface. Depois de conferir o WhatsApp e a fila, publicar o workflow. Resultado incerto exige conferência da conversa; não há reenvio automático. Mudanças de situação da OS, revisões de orçamento vencidas/canceladas e telefones alterados cancelam os lembretes antes do envio.

Para acesso externo ao site/portal, publicar o frontend com rewrite SPA para `index.html` e cadastrar a URL HTTPS nas URLs de redirecionamento do Supabase Auth. Localhost só serve à máquina local. SMTP/entrega de confirmação devem ser validados no endereço final. A cobrança foi acrescentada posteriormente em modo de simulação autorizado, sem gateway ou cobrança real; consultar [homologação](homologacao.md).

## Validação realizada

- 35 verificações novas em PGlite: notinhas, cálculo, idempotência, planos, isolamento de clientes, revogação, fotos, revisão, peças/pedidos, avisos e reserva da IA.
- Regressão: 25 verificações de orçamentos e 28 de OS.
- TypeScript, ESLint e build Vite.
- Emissão de notinha no navegador em demonstração; formulário e listagem conferidos a 390 px, tema escuro.
- PDFs gerados com cenários curtos e documento longo de 5 páginas; PDF da OS renderizado e conferido.
- Testes HTTP reais sem dados pessoais: fotos com token inválido → 404; agendador sem autorização → 401; IA sem configuração → 503 com mensagem explicativa.

Ainda não validados: fluxo completo do portal com login real, upload real de foto do orçamento até a proposta pública, chamada paga da IA e envio real pelo n8n/Evolution. Dependem das contas/configurações acima; não são apresentados como concluídos.

Referência da implementação da IA: https://developers.openai.com/api/docs/guides/text (Responses API, saída revisada, `store: false`).
