# Sistemas por ramo

Implementação de 08/10/2026. As migrations `20261008000100_multirramos.sql` e `20261008000200_servicos_encerramento.sql` foram aplicadas individualmente pelo SQL Editor ao projeto `hzihxtjirttetnfdujcx`. Não repetir a primeira migration nem executar todo o histórico com `db push` sem a reconciliação descrita em `supabase/README.md`.

## Cadastro e compatibilidade

- `oficinas.ramo` aceita `automotivo`, `assistencia_tecnica`, `manutencao_campo` e `limpeza`.
- As empresas existentes receberam `automotivo`. A conferência remota após a migração encontrou as mesmas 3 empresas e 85 OS automotivas anteriores.
- `configurar_nova_empresa` valida o ramo antes de chamar o cadastro existente; a chave de cadastro impede duplicação e não permite reutilização para trocar de ramo.
- `consultar_meu_acesso` retorna o ramo. `LayoutPorRamo` mantém o layout automotivo e seleciona o layout dos serviços para os demais ramos.
- Os módulos de atendimento/agenda exigem `work_orders`, cadastros exigem `customers`, cobrança exige `finance` e gerência. Nenhum plano pago é contratado automaticamente.
- O menu da conta permite selecionar outra empresa à qual o usuário já tem acesso. A seleção persiste na sessão do navegador.

## Fluxos entregues

| Ramo | Cadastro | Atendimento |
| --- | --- | --- |
| Assistência técnica | Equipamento, marca, modelo, série/IMEI, acessórios, condição de entrada | Defeito, diagnóstico, reparo, materiais, garantia |
| Manutenção de campo | Local/equipamento, endereço, identificação, contato e acesso | Solicitação, diagnóstico, execução, materiais e orientações |
| Limpeza | Local, endereço, área, ambientes, contato e acesso | Escopo, cuidados com superfícies, execução, produtos e orientações |

Os três usam orçamento, aprovação, execução, espera, conclusão e cancelamento; valor total, vencimento, checklist em texto e registro de conferência/aceite. Cadastros podem ser arquivados sem impedir a conclusão dos atendimentos existentes.

Clientes, catálogo, estoque, fornecedores, compras, financeiro, recorrências financeiras, equipe e configurações reutilizam os módulos existentes. A ficha de um cliente nos novos ramos direciona para seus equipamentos/locais, sem abrir a ficha automotiva. Dados técnicos vivem em tabelas próprias e não criam veículos fictícios.

## Agenda

Referência lida: `sistema-gestao-agendamentos/src/pages/agendamentos/components/AgendaCalendar.tsx` e seus tipos. Foi adaptado o padrão de dia por profissional, semana, mês e edição por cartão para a arquitetura deste projeto.

- Profissionais ou equipes podem ser cadastrados e desativados pela gerência.
- O dia usa uma linha do tempo com duração visual; semana/mês mostram cartões. Filtros de equipe e situação, navegação de período e criação a partir de um horário.
- Agendar, confirmar, remarcar, concluir, cancelar e registrar não comparecimento. O horário é de Brasília.
- Repetição diária, semanal, a cada 14 ou 30 dias, com até 52 ocorrências. Trinta dias é um intervalo fixo, não uma recorrência por dia do mês.
- A série é atômica: qualquer conflito desfaz todas as suas novas ocorrências. Repetir a requisição não duplica reservas.
- O banco serializa as reservas por empresa e verifica sobreposição por equipe. Uma equipe representa um conjunto que trabalha junto; não há atribuição automática de pessoas entre equipes.
- Concluir uma visita não conclui automaticamente o contrato/atendimento: um atendimento pode ter várias visitas.

Não foram portados os módulos específicos de salão, como lavatório, comanda, fila de encaixe, confirmação por mensagens, pagamentos de sinal, jornada/folgas ou reservas de recursos físicos. A agenda entregue segue o padrão visual e operacional básico, sem afirmar paridade integral com todo o produto de salões.

## Cobrança e alertas

“Gerar cobrança” cria uma única conta a receber por atendimento aprovado, com valor positivo. “Ver cobrança” abre o título existente. Pagamentos parciais, taxas, estornos, cancelamento e recorrências financeiras usam o financeiro atual.

O sininho reúne financeiro, prazo dos atendimentos e visitas agendadas, com leitura individual e link para abrir/editar o registro correto. Não expõe alertas financeiros a colaboradores.

O valor é o total do atendimento/contrato, não o preço de cada visita de uma série. A descrição de materiais e checklist é textual: não baixa estoque automaticamente nem calcula peças por item. Para custos de materiais/terceiros, registrar a despesa no financeiro; movimentações de estoque continuam disponíveis no módulo compartilhado. Comissão automática por OS continua exclusiva do automotivo.

## Demonstração e validação

- `/demonstracao-ramos` permite testar os quatro ramos. Nos três novos, os exemplos são locais: 6 cadastros, 6 atendimentos, 2 equipes e 18 reservas por ramo. Não cria empresas no Supabase.
- A bateria geral passou com a migration 001: 868 verificações `PASS`, incluindo 65 multirramos. A migration 002 passou na suíte ampliada de 71 verificações multirramos.
- TypeScript, ESLint nos arquivos alterados e build Vite passaram. Testes visuais: troca de ramo, agenda semanal/diária, edição persistida, conflito, abertura pelo sininho e geração de conta a receber em demonstração.
- Em 08/10/2026, após autorização explícita do usuário, foram criadas pelo cadastro real as três empresas `ZZ [TESTE MULTIRRAMOS]`: Assistência técnica, Manutenção de campo e Limpeza. Todas pertencem à conta autenticada que realizou o cadastro. O menu da conta → Empresa ativa permite alternar entre elas.
- `scripts/popular-multirramos-real.sql` popula somente os três IDs de teste, com conferência de nome, ramo e proprietário. Habilita o plano intermediário apenas nesses exemplos, sem checkout ou contratação externa. Usa RPCs da aplicação e identificadores estáveis para permitir reexecução sem duplicação.
- Cada empresa recebeu 12 clientes, 12 equipamentos/locais, 24 atendimentos em diferentes situações, 3 profissionais/equipes, 49 reservas, 32 títulos financeiros e 3 regras de contas recorrentes. A agenda cobre todos os 30 dias de 08/10 a 06/11/2026, além de visitas passadas pendentes. Há contas vencidas, futuras, quitadas e parcialmente pagas.
- `scripts/testar-populacao-multirramos.mjs` passou no PGlite: totais esperados, 30 datas futuras distintas, reexecução sem duplicação e nenhuma OS automotiva criada. O banco remoto preservou as 3 empresas automotivas e suas 85 OS.
- Validação na interface real: cadastro dos três ramos, troca entre empresas, cobrança da assistência vinculada ao financeiro, agenda da manutenção, edição persistida na limpeza e rejeição de sobreposição pelo banco. Uma baixa fictícia adicional de R$ 22,50 pelo sininho reduziu a despesa de R$ 122,50 para R$ 100,00; o alerta permaneceu para o saldo. Nenhum pagamento externo foi realizado.

Executar `node scripts/validar-banco.mjs` para todas as suítes locais. A nova suíte é `supabase/tests/validate-multirramos.mjs`, usando o mesmo runtime PGlite das demais. Evidências visuais em `docs/validacao-multirramos/`.

## Usuários de teste por empresa

Em 08/10/2026 foram criados seis usuários pelo painel oficial Supabase Authentication, com senhas individuais e e-mails fictícios confirmados, sem envio de mensagens. Cada empresa de teste recebeu um `manager` e um `staff`: `teste.{assistencia|manutencao|limpeza}.{gerente|colaborador}@example.com`. O proprietário existente foi preservado.

Os vínculos estão em `scripts/vincular-usuarios-multirramos-teste.sql`, restritos aos IDs, nomes e ramos das três empresas fictícias. Senhas ficam somente no arquivo local entregue ao usuário, fora do repositório.

Validação real pela API do aplicativo passou para os seis acessos: login por senha, exatamente uma empresa visível, perfil correto, consulta de serviços disponível, financeiro liberado ao gerente e negado ao colaborador, consulta de serviços de outra empresa negada com `42501`.

## Lote de teste por subsetor — 15/10/2026

Executado com `scripts/criar-contas-teste.mjs`: um proprietário e uma empresa independente para cada um dos 26 perfis do catálogo (10 automotivos, 5 de assistência, 5 de manutenção e 6 de limpeza), com Plano Completo de teste, sem cobrança externa. **Os 26 usuários e as 26 empresas foram criados e verificados no Supabase.**

A conferência inicial encontrou 7 empresas existentes, apenas 13 perfis no catálogo e ausência da função de operação completa dos novos ramos. Nenhum usuário `qa.20261015.*@example.com` existia. Foram aplicadas somente as sete migrações pendentes, de `20261014000100` até `20261015000500`, com hashes iguais ao manifesto da versão testada em 110 suítes. A transação conferiu as quantidades preexistentes de usuários, empresas, membros, clientes, OS e atendimentos. A verificação posterior confirmou as novas funções, os 26 perfis e RLS habilitado nas sete tabelas novas. As empresas anteriores foram preservadas.

O painel acrescentou uma ativação de RLS após a transação e mostrou erro ao tentar encontrar a tabela temporária de conferência, já removida pelo `COMMIT`. A atualização não foi reaplicada: a consulta posterior de estrutura confirmou que as sete migrações estavam efetivamente concluídas, e o provisionamento pela API passou. Evidências locais em `output/contas-teste/`.

`node scripts/criar-contas-teste.mjs --lote=20261015` lista o plano sem acessar serviços externos. Após atualizar o banco, disponibilizar a chave administrativa apenas em `SUPABASE_SERVICE_ROLE_KEY` no ambiente do processo ou em `output/contas-teste/admin.env.local`, e executar o mesmo comando com `--aplicar`. Não usar prefixo `VITE_` para essa chave.

O provisionador verifica pré-requisitos antes de criar usuários; usa a API administrativa oficial de Auth e o cadastro normal de empresas; confirma login, perfil, Plano Completo e isolamento por empresa. Senhas são aleatórias, individuais e persistidas antes da primeira chamada. O manifesto permite retomar falhas sem resetar senhas nem duplicar empresas. Colisões com usuários de outros lotes ou empresas vinculadas à cobrança externa interrompem a execução.

As credenciais conferidas estão em `output/contas-teste/20261015/acessos.html`, e o manifesto privado em `credenciais.local.json` na mesma pasta. `output/` está excluído do Git e bloqueado pelo servidor de desenvolvimento, inclusive via `/@fs`. Não publicar a pasta nem apagar o manifesto durante uma retomada. Endereços `@example.com` não recebem mensagens; fluxos reais de recuperação/SMTP exigem contas com e-mail acessível.

Validação: 26 logins reais aprovados, cada um vendo exatamente uma empresa com o perfil e plano esperados. Os 16 perfis não automotivos também passaram nas consultas de operação e relatórios, e todos tiveram a consulta de outra empresa rejeitada com `42501`. Conferência no navegador com a conta de celulares/tablets e build de produção aprovado. `node --test scripts/testar-contas-teste.mjs`: 7 testes locais aprovados; `node scripts/testar-segredos-dev.mjs`: bloqueio HTTP de arquivos privados confirmado.
