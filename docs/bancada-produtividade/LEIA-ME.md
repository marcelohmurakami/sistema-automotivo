# Produtividade e bancada de testes

Última execução completa em 04/10/2026: **465 verificações aprovadas**, sendo 422 de banco e integrações, 13 de rascunhos, 21 de webhooks e 9 de backup. TypeScript, lint e build também aprovados. Dentro dos testes de banco, 67 cenários são específicos da produtividade.

## Recursos entregues

| Recurso | Onde usar | Regra principal |
|---|---|---|
| Pacotes de peças e serviços | Agenda e produtividade → Pacotes; editor do orçamento; OS → Produtividade | Preços atuais do catálogo, até 50 itens por pacote e 100 por documento; vínculo com estoque preservado. |
| Serviço adicional | OS → Produtividade → Preparar orçamento adicional | Proposta separada, aprovação da versão e inclusão única na OS original. Valores aprovados ficam protegidos. |
| Agendamento | Agenda e produtividade → Agenda | Horários por box/responsável, bloqueio de sobreposição e do mesmo veículo; conversão única em OS. |
| Próxima manutenção | OS → Produtividade; lista de manutenções; portal do cliente | Data e/ou quilometragem, acompanhamento de conclusão e isolamento por cliente. |
| Vistoria visual | OS → Produtividade | Avarias por região, combustível, pertences e confirmação por link de sete dias; registro confirmado preservado. Fotos continuam na aba Fotos da OS. |
| Retorno / garantia | OS entregue → Produtividade | Nova OS vinculada à original, com motivo e valor inicial zero. Cobertura e itens são avaliados pela oficina. |
| Tempo de trabalho | OS → Produtividade | Um cronômetro por pessoa, várias pessoas por OS, previsão e custo por hora; entrega/cancelamento encerram períodos abertos. |
| Rascunho protegido | Editor do orçamento | Recuperação local por usuário/oficina/documento, por até sete dias; exclusão local após salvar no servidor. |

Agenda e recursos da OS ficam nos planos com ordens de serviço. Exibição das próximas manutenções no portal exige o plano Completo e acesso do cliente concedido pela oficina. Funcionários usam os recursos operacionais; gestão de pacotes e definição de custo/hora exigem perfil de gestão.

O custo do cronômetro é uma estimativa operacional separada do resultado financeiro. Ele não gera outra despesa automaticamente, evitando duplicar salários já lançados. O rascunho local protege o preenchimento; emissão, aprovação, sincronização e operações financeiras continuam exigindo internet. Não há instalação offline completa do aplicativo.

## Executar novamente

Na raiz do projeto, com Node.js 22.18 ou superior e dependências instaladas:

```sh
node scripts/bancada.mjs
```

Também existe `npm run test:bancada`. O comando usa bancos PostgreSQL isolados em memória com PGlite, sem modificar o Supabase real. Ele verifica TypeScript, lint, rascunhos, todas as migrações e módulos, webhooks, backup e build. Saídas e contagens ficam em `resultado.json` e nos arquivos `.log` desta pasta. Falha em qualquer etapa interrompe a execução com código diferente de zero.

O runtime é buscado em `node_modules/@electric-sql/pglite`; `DB_VALIDATION_RUNTIME` permite apontar outra instalação. Há compatibilidade com a instalação de testes anteriormente preparada na pasta temporária deste computador.

## Cenários cobertos

- Cadastro válido, dados vazios, quantidades negativas e precisão excessiva.
- Planos Básico, Intermediário, Completo, suspensão, perfis e isolamento entre oficinas/clientes.
- Edição com revisão antiga, clique repetido e chamadas repetidas sem duplicar valores.
- Agenda com sobreposição, mesmo carro em recursos diferentes, horários invertidos/adjacentes e conversão repetida.
- Pacotes integrados ao estoque, baixa na entrega e título financeiro correto.
- Adicionais sem aprovação, aprovação válida, desconto, aplicação repetida e preservação dos itens aprovados.
- Vistoria inválida, token desconhecido/expirado, confirmação repetida e bloqueio de alteração após confirmar.
- Duas pessoas com períodos independentes, pausa individual e encerramento na entrega.
- Retorno antes/depois da entrega, vínculo e ausência de cobrança automática.
- Recuperação, expiração, corrupção e indisponibilidade do armazenamento local.
- Regressão dos módulos anteriores: clientes, orçamento, fotos, OS, estoque, compras, financeiro, equipe, relatórios, portal e cobrança em teste.

## Validação no Supabase e navegador

A migração `20261003000100_produtividade.sql` foi aplicada no projeto automotivo `hzihxtjirttetnfdujcx`, com RLS e acesso pelas funções que validam oficina, perfil e plano. As correções feitas durante a bancada estão consolidadas nesse arquivo.

Nas duas contas já existentes de QA, foram criados registros identificados por `[BANCADA 03/10]`: pacote Revisão rápida, veículo QAQ3A10, agendamento convertido na OS #5, orçamento adicional #6 e OS de retorno #6. Os testes reais comprovaram conflito de edição entre contas, cronômetros simultâneos, vistoria confirmada, manutenção programada, recuperação do preenchimento após recarregar, aprovação do adicional, incorporação de R$ 45 à OS de R$ 319,80, entrega por R$ 364,80 e retorno iniciado em R$ 0.

Medições pontuais entre envio e confirmação visível: edição de pacote em 262 ms e cadastro de agendamento em 226 ms. São duas amostras deste ambiente, não um teste de carga nem garantia de latência em produção. A atualização automática de outra sessão ocorre em até 30 segundos; na OS, os apontamentos são consultados a cada 15 segundos.

Conferência visual nas larguras efetivas de 412 px (tema escuro) e 1280 px (tema claro), sem largura de conteúdo maior que a janela. Evidências em `mobile.png`, `desktop.png` e `supabase.png`. A consulta final no Supabase confirmou sete tabelas com RLS, conflitos HTTP 409, vistoria integrada e vínculo do adicional com a OS.

Os testes locais alternam identidades e verificam os conflitos de revisão; os testes no navegador usaram duas sessões reais. Não representam carga simultânea de centenas de oficinas. Links de localhost funcionam apenas neste computador até publicar o frontend em uma URL acessível.

Nenhum WhatsApp foi enviado e a automação de atendimento permaneceu desativada.
