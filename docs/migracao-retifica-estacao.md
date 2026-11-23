# Migração da Retífica Estação — 08/10/2026

Origem: projeto Supabase `mmimlaxiujbkvxosrirt`, empresa `3238def8-2d4a-4c99-8259-d1bdc7c86fea`.
Destino: `hzihxtjirttetnfdujcx`, empresa `e898f8dc-5e29-50d5-a746-7929f8cef4ab`.
Conta existente de Marcelo vinculada como `manager`; senha não alterada.

## Resultado

- 92 clientes originais e um cadastro explícito para OS sem cliente informado.
- 952 OS antigas importadas como entregues, conforme confirmação do responsável.
- 15 orçamentos: um em análise, dois em produção e 12 prontos; os 14 últimos também geraram OS ativas.
- 160 serviços e 69 produtos de estoque; saldos iniciais preservados.
- Nove contas e seis pagamentos avulsos importados. Saldo a receber: R$ 2.820,00; a pagar: R$ 2.000,00.
- 6.824 registros originais preservados, incluindo anotações, auditoria, metadados e três imagens.
- Total das OS históricas: R$ 653.735,00. Próxima OS: 8037.

## Critérios de conversão

O sistema anterior não identifica unicamente cada veículo por placa. Cada atendimento mantém seu veículo original, sem juntar veículos apenas pelo modelo. A data de serviço foi usada como referência de encerramento das OS entregues; não representa uma data de entrega comprovada. As observações de cada OS explicam isso.

Vinte OS não tinham cliente. Itens complementares identificados explicitamente conservam os totais de serviços cujo detalhamento estava ausente ou incompleto. Os originais continuam disponíveis para conferência.

Valores anteriormente quitados sem data e forma de pagamento ficam em `private.saldos_importados`, preservando o saldo sem inventar fluxo de caixa. As seis baixas avulsas mantêm as datas e os meios conhecidos. OS históricas não geram novas contas a receber automaticamente.

Dados de usuários antigos ficam apenas no arquivo histórico, sem copiar credenciais nem conceder acesso. A consulta do histórico exige gerência da empresa. Imagens foram copiadas para o arquivo, sem depender dos links do projeto antigo.

## Execução e validação

Backup e arquivos com dados reais estão em `backups/retifica-estacao-20261008/`, ignorados pelo Git. `origem.sha256` registra a integridade do backup. O banco antigo não foi modificado.

`scripts/preparar-migracao-retifica.mjs` gera a conversão determinística. `scripts/preparar-lotes-retifica.mjs` divide o SQL em 42 lotes recebidos em tabela privada com RLS e sem permissões de cliente. A montagem confere MD5 e quantidade antes da transação única. O script recusa empresa preexistente para evitar duplicação.

Validações locais: contagens, totais por OS, saldos, permissão do gerente, bloqueio de colaborador no arquivo, baixa parcial e recusa de pagamento excedente e de reimportação. Testes financeiros e de alertas, TypeScript, lint dos componentes alterados e build passaram.

O Supabase confirmou a transação com 966 OS e os saldos esperados. A consulta autenticada de acesso confirmou o perfil de gerente. A sessão do navegador do aplicativo pertence à conta de testes; o uso visual com a conta pessoal deve ser feito entrando com o e-mail existente de Marcelo e escolhendo Retífica Estação.

Essa importação é um retrato da exportação de 08/10/2026. Alterações posteriores no sistema antigo não são sincronizadas automaticamente.
