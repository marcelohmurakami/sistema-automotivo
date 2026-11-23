# Eletrodomésticos e eletrônica — 15/10/2026

Esta é a revisão inicial da implementação. A [revisão detalhada posterior](revisao-minuciosa-reparos-2026-10-16.md)
registra os fluxos adicionais executados, as correções encontradas e os limites
da verificação manual.

## Trabalho por subsetor

Eletrodomésticos foi implementado e teve testes unitários e de persistência
executados antes da implementação de eletrônica. Depois ambos passaram pela
regressão geral e pela inspeção no preview, com suas respectivas contas de teste.

### Eletrodomésticos

- Recepção rápida com tipo de aparelho e modalidade: bancada ou domicílio.
- Endereço e contato aparecem para visitas; valores históricos permanecem
  acessíveis se a modalidade mudar. A disponibilidade anotada não reserva horário:
  o agendamento continua na Agenda.
- Identificação por série e código completo/PNC, alimentação da etiqueta,
  acessórios, origem do atendimento e referência de nota/protocolo.
- Diagnóstico, código de erro, condições da instalação e documentação consultada.
- Conferências condicionais para lavagem, secagem, refrigeração, aquecimento e
  portáteis. Temperaturas são registros com unidades, permitindo valores negativos
  sem alterar a regra geral de campos numéricos não negativos.
- Registro do resultado e das limitações do teste, separado da situação comercial.
- Conclusão no domicílio segue para aceite no local. Bancada segue para entrega.
  O painel tem filtro de aceites pendentes; o aceite preserva data, valor e histórico.

### Eletrônica e reparo de placas

- Recepção distingue equipamento completo, placa avulsa e módulo/fonte.
- Código, revisão, equipamento de origem e identificação de bancada, sem IMEI.
- Inspeção, falha intermitente ou permanente, reparos anteriores, documentação,
  pontos medidos, valores e instrumentos de referência.
- Rastreabilidade das substituições por posição/código/origem/lote, intervenções em
  trilhas/pads, firmware autorizado e inspeção após reparo.
- Condição disponível para teste, medições finais, duração, carga/condições do
  ensaio, resultado e limitações. A conclusão administrativa não transforma
  automaticamente um teste parcial em aprovado.
- Registro de proteção ESD/acondicionamento, orientações e devolução.
- Resumo visual identifica placa/revisão, alcance do ensaio e validação declarada.
  O comprovante identifica placa e revisão; medições e diagnóstico interno ficam
  na ficha técnica.

## Reaproveitamento e compatibilidade

Campos comuns usam `CamposFichaTecnica`. A definição do subsetor contém grupos,
campos, recepção rápida e regras condicionais. Nenhum campo preenchido é apagado
ou escondido pela troca de uma categoria. Os campos, opções e checklists antigos
continuam aceitos; os novos campos não são obrigatórios retroativamente.

As migrações `20261015000700_eletrodomesticos_especializado.sql` e
`20261015000800_eletronica_bancada.sql` atualizam apenas o contrato de cada perfil
em `private.perfis_atendimento`. Foram aplicadas separadamente no Supabase
conectado e conferidas por SELECT no editor SQL. Não alteram permissões ou ordens
existentes. As verificações locais comparam os contratos dos 26 perfis.

## Validação

- `node scripts/verificar-projeto.mjs`: TypeScript, ESLint, formatação, build e
  **118/118 suítes aprovadas**.
- Novos testes: `testar-eletrodomesticos`, `testar-eletronica`,
  `testar-fichas-reparos-ui` e `validate-assistencia-especializada`.
- Componentes reais renderizados: campos condicionais, retenção de anotações,
  formulários diferentes e indicação de teste parcial.
- PostgreSQL/PGlite: gravação/leitura, opções e valores inválidos, concorrência,
  conclusão, aceite/entrega e preservação de valor/data/histórico. A regressão
  também cobre estoque sem consumo duplicado e isolamento de empresas.
- Navegador: login de eletrodomésticos, seleção lavadora/domicílio, troca para
  geladeira/bancada, login de eletrônica, placa avulsa e ensaio parcial. Conferência
  em 1280×720, sem erros de console observados. As fichas usadas na inspeção visual
  foram fechadas sem gravar ordens fictícias no ambiente conectado.
- Evidências em `output/reparos-especializados/`, relatório da regressão em
  `output/validacao-refatoracao-atual/resultado.json` e log completo em
  `output/verificacao-eletrodomesticos-placas.log`.

## Referências consultadas

- [Electrolux — identificação e categorias de produtos](https://cuida.electrolux.com.br/produtos/categoria-produtos-electrolux): referência para a identificação do modelo/código e distinção dos aparelhos.
- [Electrolux — condições de funcionamento e instalação](https://cuida.electrolux.com.br/conteudo/duvida/verifique-estas-possiveis-solucoes-para-seus-produtos-electrolux): referência para registrar condições de instalação e funções testadas.
- [Brastemp — atendimento e documentação do modelo](https://www.brastemp.com.br/atendimento): referência para vincular atendimento ao código e manual do produto.
- [IPC — padrões de inspeção e reparo eletrônico](https://www.ipc.org/meet-your-standards): referência para separar inspeção, intervenção e validação de placas.
- [ESD Association — controle e acondicionamento](https://www.esda.org/esd-overview/esd-fundamentals/part-3-basic-esd-control-procedures-and-materials/): referência para registrar cuidados no manuseio e na devolução.

Os campos são uma escolha de produto a partir dessas referências; não certificam
conformidade técnica nem substituem procedimentos e limites específicos do fabricante.
