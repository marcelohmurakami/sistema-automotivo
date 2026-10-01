# Mapa da oficina

O mapa consulta `ordens_servico` e a relação `paradas_ordem_servico` no Supabase, filtrando a oficina autenticada. Reutiliza RLS e recursos contratados; não exige nova migração.

- Exibe OS recebidas, em execução, em conferência e prontas. Entregues e canceladas permanecem na tela de serviços e no histórico.
- Paradas abertas têm prioridade no agrupamento e mostram motivo e detalhes; a situação operacional original permanece no cartão.
- Mostra número da OS, cliente, veículo, placa, responsável, relato e entrega prometida. Campos ausentes são explícitos.
- O total de veículos presentes conta veículos distintos com entrada registrada; OS sem entrada continuam visíveis e sinalizadas.
- Filtros: entrega hoje, atrasadas, paradas, sem previsão, etapa e responsável. Busca por número, placa, veículo, cliente, responsável e motivo, ignorando acentos e pontuação.
- Prazos são exibidos no fuso de São Paulo. Atualiza a cada 30 segundos, ao voltar à janela, por botão e após alterações de OS.
- Clicar no cartão abre a OS correspondente. O botão de nova OS abre diretamente o cadastro.
- Dados carregados em páginas de 200 por cursor; não limita o mapa à primeira página da listagem de serviços.
- Demonstração usa somente as OS cadastradas no navegador. Não injeta os veículos fictícios do protótipo anterior.

## Verificação

`npm run build`, `npm run lint`, `node --experimental-strip-types supabase/tests/validate-mapa-ui.mjs`.

`validate-mapa-banco.mjs`, com `DB_VALIDATION_RUNTIME` apontando para PGlite, valida leitura dos campos, paradas, isolamento entre oficinas e bloqueio do plano Básico. Auth é simulada neste teste; a consulta via PostgREST com uma sessão real não foi exercitada.

No navegador em demonstração: criação de OS pelo mapa, responsável e prazo, registro de parada e exibição do cartão correspondente. O banco existente não foi modificado por esta entrega.

Conferência visual: tema escuro em 1280 px e 390 px, sem rolagem horizontal da página; busca sem acentos por responsável, filtro por etapa e abertura da OS pelo cartão. Captura: mapa-oficina-mobile.png.
