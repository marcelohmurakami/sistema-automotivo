# Revisão da assistência técnica — 15/10/2026

## Escopo

Revisão da experiência de assistência técnica geral, celulares, informática,
eletrodomésticos e eletrônica. Foram examinados textos de apresentação no código
e as telas compartilhadas alcançáveis por esse ramo. Identificadores históricos
de banco/API como `oficina_id` permanecem iguais; não são textos de interface.

## Alterações

- Navegação no padrão visual do sistema base, separada em Dia a dia, Cadastros e
  compras, Gestão e qualidade e Minha assistência, com busca e permissões.
- Vocabulário e exemplos por especialidade, inclusive carregamento, catálogo,
  ordens de reparo, cadastro de equipamentos, alertas, configuração, planos e site.
- Entrada do reparo com defeito relatado visível, equipamento, identificação,
  acessórios e ficha técnica específica. Formulário mais largo no computador,
  campos em duas colunas e regras para uma coluna em telas pequenas.
- Busca de serviços do catálogo e peças do estoque no mesmo campo dos itens do
  reparo. Impressão identifica equipamento e série; o recibo do cliente não expõe
  diagnóstico interno nem custos.
- Conclusão do reparo marca disponibilidade para retirada. A retirada registra
  quem recebeu o equipamento, preserva a conclusão e não repete consumo de estoque.
- Ficha geral complementada com defeito relatado, retirada combinada, recebedor e
  etapa Entregue. Demais perfis preservados.

## Validação

- TypeScript estrito, ESLint, Prettier e build de produção aprovados.
- Bateria de 114 suítes: 113 passaram na execução geral. A restante,
  `testar-recuperacao-acesso.mjs`, comparava literalmente o texto antigo
  “Carregando sua oficina”. Foi atualizada para exigir o texto neutro e executada
  novamente com sucesso, preservando as verificações de proteção de sessão.
- Nove cenários unitários novos cobrem linguagem, menu, permissões, conclusão,
  retirada e conteúdo da impressão. A integração local em PostgreSQL/PGlite
  confere os 26 contratos de ficha e percorre conclusão/retirada nos cinco perfis
  de assistência: estoque baixa uma vez, valor e data permanecem, o histórico
  registra entrega e revisões antigas são recusadas.
- Navegação autenticada nas 17 rotas do menu, busca do menu, catálogo e formulário
  de reparo no navegador. Exemplos dos cinco subsetores conferidos na interface.
  Nenhum erro de console observado nessa sessão.
- Preview final conferido em `http://127.0.0.1:5174/atendimentos`.
- Migração `20261015000600_recepcao_retirada_assistencia.sql` aplicada ao projeto
  de teste existente pelo editor SQL. A consulta final confirmou a etapa Entregue
  no perfil geral. Nenhuma ordem real foi criada ou alterada na conferência visual.

## Evidências e limites

Resultados da bateria em `output/validacao-refatoracao-atual/resultado.json` e logs
individuais. Esse JSON preserva a primeira execução e sua falha de expectativa;
o sucesso da reexecução está documentado acima. Evidências visuais e rotas em
`output/assistencia-tecnica/`.

O navegador ignorou o tamanho de celular solicitado (390×844) e continuou em
1280×720, inclusive numa nova aba. O ajuste foi retirado. As regras responsivas
foram revisadas, mas a inspeção visual em dispositivo pequeno permanece pendente.
Dados vazios da empresa de teste limitam a inspeção visual de listas preenchidas;
os fluxos com registros foram exercitados nos testes locais de integração.

O build mantém avisos de imports estáticos/dinâmicos preexistentes que não impedem
a geração. A bateria geral não executa a migração de backup privado, conforme
seu próprio relatório. Essas verificações não representam garantia de ausência
de todos os defeitos ou homologação de infraestrutura de produção.
