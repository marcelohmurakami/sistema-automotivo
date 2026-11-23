# Conferência visual operacional

`npm run test:visual` compila os componentes reais com os mesmos plugins e estilos do aplicativo e abre um navegador isolado. Execute `npx playwright install chromium` uma vez no ambiente de testes. É possível usar outro executável com `PLAYWRIGHT_BROWSER` ou uma instalação já disponível com `PLAYWRIGHT_MODULE`.

A fixture usa somente dados fictícios no cache em memória. As variáveis de conexão são removidas da compilação e o navegador bloqueia destinos fora do servidor local. Não há autenticação, pagamentos ou gravações em empresas reais.

São verificados financeiro, conciliação, contas bancárias, custos, preços, apuração, contratos, calendário e agendamento em 320, 390, 768 e 1440 pixels, nos temas claro e escuro. O teste inclui janelas abertas, navegação móvel, seleção de cobranças, formulários recolhidos, campos de marcação, dados longos, valores altos e estados vazio/erro. A cobrança compartilhada também é renderizada com os 26 perfis de empresa. Isso não substitui os testes funcionais completos de cada ramo.

Os resultados e as capturas ficam em `output/revisao-estilo-20261029`. A bancada é separada da suíte de unidade/banco porque requer um navegador instalado. Não publica o aplicativo.

## Agendamento único e recorrente

`node scripts/verificar-agendamento-separado.mjs` abre as páginas reais de agenda dos 26 perfis, com transporte fictício e arquivos servidos diretamente ao navegador. Confere os dois caminhos de salvamento, edição isolada, limpeza de estado entre janelas, feriados/exceções, falhas de prévia e gravação, permissões e layout em 320, 390, 768 e 1920 pixels nos dois temas. Em limpeza, cobre visitas independentes e várias datas do mesmo atendimento.

O teste não usa serviços externos nem grava empresas reais. `PLAYWRIGHT_BROWSER` permite selecionar um Chromium já instalado. As evidências ficam em `output/agendamento-separado-20261103`; `resultados.json` registra se a execução inteira terminou com sucesso. O modo `--reusar-build` é apenas para repetir a interação sem recompilar quando os arquivos da aplicação não mudaram.

Para conferir somente alterações de CSS, `--somente-layout` testa as quatro famílias em todas as larguras e temas e grava `resultados-layout.json`, preservando o resultado funcional completo anterior.
