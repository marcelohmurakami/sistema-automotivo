# Revisão de celulares/tablets e informática/notebooks — 16/10/2026

Revisão dos dois perfis de assistência, com mudanças no código, percursos preenchidos
pela interface, regressão local e aplicação autorizada de três migrações no Supabase.
Os registros de teste foram criados somente na bancada local.

## O que foi corrigido e detalhado

- **Recepção rápida:** tipo de aparelho, funcionamento na entrada, situação do
  backup e autorização para restaurar/apagar dados aparecem no formulário principal.
  Os demais campos permanecem organizados em seções recolhíveis.
- **Celulares/tablets:** segundo IMEI, guarda de chip/cartão de memória, bateria e
  carga, comparação das funções de entrada e saída, resultado e limitações dos testes.
- **Informática/notebooks:** condição de funcionamento, escopo dos dados a preservar,
  estado da criptografia, periféricos e duração/estabilidade do teste. Os campos de
  hardware, memória, armazenamento, software e temperatura foram preservados.
- **Autorização sobre dados:** permanece independente da aprovação comercial do
  orçamento. A ficha orienta a não registrar senhas, chaves de recuperação ou arquivos
  pessoais. A aplicação registra o combinado; não executa nem certifica um backup.
- **Resumo:** mostra entrada, backup/autorização e validação. Um teste parcial ou
  reprovado não se torna aprovado ao concluir o reparo.
- **Nota:** a identificação preenchida na ficha passou a aparecer no comprovante,
  mesmo sem série no cadastro do equipamento. Celular admite segundo IMEI; informática
  usa série/etiqueta de serviço. Diagnóstico e escopo interno do backup não entram na
  nota do cliente.
- **Erro reproduzido:** o seletor permitia salvar “Entregue” com situação “Em execução”.
  As etapas de encerramento saíram dos seletores de atendimentos abertos; a edição de
  etapa de um reparo concluído ficou bloqueada. A validação na aplicação e um gatilho
  SQL exigem conclusão antes de pronto/entregue e recebedor antes da entrega/aceite.
  Reabrir continua voltando à etapa de reparo e recompondo o estoque.
- **Acessibilidade:** o nome dos campos técnicos passou a ser associado ao rótulo,
  separadamente do texto de ajuda, que permanece como descrição acessível.

Os identificadores, opções antigas, etapas e checklists persistidos foram mantidos.
Há testes comparando os novos perfis com o contrato anterior para evitar perda de
fichas já cadastradas.

## Percursos executados pela interface

| Fluxo | Celulares | Informática |
| --- | --- | --- |
| Novo orçamento | Celular com tela sem toque, IMEIs, chip retirado e backup pendente | Notebook com inicialização intermitente, série, hardware e disco criptografado |
| Serviços e estoque | Serviço de troca de tela + tela vinculada ao estoque | Instalação + SSD vinculado ao estoque |
| Aprovação e execução | Aprovar orçamento → iniciar reparo | Aprovar orçamento → iniciar reparo |
| Equipe e horas | Técnico vinculado e 45 minutos registrados | Técnico, 60 minutos, R$ 30/h e comissão de 10% |
| Validação | Teste parcial: chamadas sem SIM não conferidas | Teste parcial: sistema/arquivos inacessíveis pela criptografia |
| Conclusão e retirada | Aviso de WhatsApp exibido; entrega com recebedor | Aviso exibido; entrega do notebook e disco original com recebedor |
| Financeiro | Cobertura transacional automatizada | Cobrança de R$ 275; recebimento local de R$ 100; saldo de R$ 175 |
| Garantia | Ocorrência com motivo, técnico, R$ 35 e 30 min; refletida no relatório | Cobertura transacional automatizada |
| Reabertura | Cobertura transacional automatizada | Reabertura após entrega e pagamento parcial; retorno a “Reparo de hardware” |
| Portal | Cliente aprovou o orçamento compartilhado | Cliente aprovou o orçamento compartilhado |

No notebook, a margem conferida na interface foi R$ 177: R$ 275 de receita, menos
R$ 50 de peça, R$ 30 de mão de obra e R$ 18 de comissão. No estoque, conclusão baixou
uma unidade (8 → 7); a retirada não gerou outra baixa.

Foram visitadas **14 rotas compartilhadas por perfil**: agenda, clientes, equipamentos,
estoque, catálogo, funcionários, fornecedores, compras, relatórios, garantias, site,
equipe, planos e configurações. Os estados observados estão em `visitas.json`.
Essa passagem verifica carregamento, linguagem, dados e controles visíveis;
não representa execução de todas as ações de cada modal dessas páginas.

O técnico com perfil de funcionário visualizou os dados técnicos sem custos,
reabertura, financeiro ou ações de qualidade gerenciais. Acesso direto a
`/financeiro` exibiu o bloqueio por perfil. O portal mostrou somente o atendimento
compartilhado, seus itens/preços e resumo público em cada empresa.

Na largura de **390 px**, foi aberto e editado o atendimento de informática, salva
uma orientação e executada a reabertura. A página manteve largura de 390 px, sem
transbordamento horizontal; as abas têm rolagem própria. O viewport foi restaurado.

## Código e contratos verificados

| Área | Referências principais |
| --- | --- |
| Perfis e campos | `perfilDispositivosDigitais.ts`, `perfisServicos.ts`, `perfisAtendimento.ts`, `interfaceRamo.ts` |
| Formulário e resumo | `Servicos.tsx`, `RecepcaoEspecializada.tsx`, `CamposFichaTecnica.tsx`, `FichaEspecialidade.tsx`, `ResumoTecnicoReparo.tsx` |
| Operação e entrega | `assistenciaTecnica.ts`, `operacaoServicos.ts`, `servicos.ts`, `DetalhesAtendimento.tsx` |
| Documentos | `pdfAtendimento.ts` e quatro PDFs renderizados |
| Persistência | Contrato dos 26 perfis, RPCs reais e gatilhos no PostgreSQL/PGlite |

## Testes automatizados

`node scripts/verificar-projeto.mjs` terminou com:

- TypeScript estrito, ESLint, formatação e build aprovados.
- **122/122 suítes locais aprovadas**, com migrações até `20261016000300`.
- Novas suítes `scripts/testar-dispositivos-digitais.mjs` e
  `supabase/tests/validate-dispositivos-digitais.mjs`.

As novas verificações cobrem compatibilidade de campos antigos, contrato SQL dos
26 perfis, recepção/resumo renderizados, identificação no PDF, separação de dados
internos, aprovação no portal, autorização de dados preservada, revisão desatualizada,
saldo insuficiente com rollback, conclusão, edição de concluído sem mudar a data,
retirada sem consumo duplicado, reabertura/reconclusão, faturamento idempotente,
pagamento parcial sem duplicidade, rejeição de valor excedente, garantia e isolamento
entre cliente/empresa. Também rejeitam etapas finais antes de concluir e entrega sem
recebedor.

Os quatro PDFs (nota e ficha técnica de cada perfil) foram gerados pelo código do
produto, renderizados e inspecionados visualmente. Textos, seções, identificação e
limitações de teste ficaram legíveis, sem cortes observados.

## Banco conectado

Aplicadas no projeto `hzihxtjirttetnfdujcx`, após autorização explícita nesta revisão:

1. `20261016000100_celulares_especializado.sql`
2. `20261016000200_informatica_especializada.sql`
3. `20261016000300_validar_etapas_encerramento_reparos.sql`

Antes da aplicação, a consulta retornou **zero** atendimentos nas combinações que a
nova validação bloquearia. Cada migração retornou `Success. No rows returned`.
A conferência final confirmou os campos novos dos dois perfis, um gatilho de validação
ativo, o gatilho de reabertura preservado e nenhuma permissão de execução direta da
nova função privada para `authenticated`. Nenhum atendimento real foi alterado pela
migração. Não reaplicar a terceira migração nem executar `db push` antes de conciliar
o histórico remoto, conforme a orientação já existente em `supabase/README.md`.

## Referências de particularidades

As melhorias de recepção e cuidados com dados foram orientadas por documentação dos
fabricantes: [preparação para serviço da Apple](https://support.apple.com/pt-br/109519),
[backup em Galaxy da Samsung](https://www.samsung.com/br/support/mobile-devices/como-fazer-backup-no-smartphone-samsung-galaxy/),
[backup de computador da Microsoft](https://support.microsoft.com/pt-br/surface/setup/back-up-your-surface-photos-documents-and-more)
e [recuperação de sistema da Dell](https://www.dell.com/support/kbdoc/pt-br/000177401/reparar-e-restaurar-o-computador-usando-o-supportassist-os-recovery).
Essas referências orientam o registro do atendimento; não substituem procedimentos
técnicos específicos de cada modelo.

## Evidências e limites

- `output/revisao-celulares-informatica/`: capturas, 28 visitas, portal, acesso do
  funcionário, PDFs e consultas/resultados da migração remota.
- `output/verificacao-digitais.log`: verificação integral.
- `output/validacao-refatoracao-atual/resultado.json`: resultados das 122 suítes.

Os percursos usam a interface real com API local e RPCs reais em banco descartável;
a autenticação da bancada é simulada. Auth de produção, envio de mensagens/e-mails,
armazenamento externo e cobrança de assinatura não foram homologados nesta rodada.
A indisponibilidade do provedor de cobrança foi apresentada com mensagem, sem quebrar
a página. Nenhuma mensagem de WhatsApp foi enviada. Não houve deploy do frontend.
Esta revisão não implica garantia de ausência de bugs em todas as combinações possíveis.
