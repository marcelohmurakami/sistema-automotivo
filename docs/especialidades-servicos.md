# Especialidades e identificação visual

O cadastro solicita ramo e especialidade antes de criar a empresa. As dez especialidades automotivas são mecânica, retífica, autoelétrica, autocenter, borracharia, estética, lava-rápido, troca de óleo, acessórios e funilaria/pintura. Assistência técnica, manutenção de campo e limpeza têm seus próprios tipos.

Em Configurações → Especialidade e tipos de serviço, proprietários e gerentes podem ajustar a especialidade dentro do ramo. Essa alteração não converte uma empresa para outro sistema nem apaga classificações antigas. A Retífica Estação foi identificada como retífica, com suas 966 OS preservadas.

A abertura e edição de OS e atendimentos pede um tipo principal com prévia do ícone. A classificação aparece no mapa (quadro e lista), na lista de OS e nos cards dos demais ramos. Cada símbolo tem nome acessível e tooltip; a cor não é a única indicação. Motor, cabeçote, pistão, virabrequim e bloco usam SVGs locais; os demais símbolos usam Lucide já instalado.

O campo de detalhes específicos orienta o registro de medições, diagnósticos, materiais ou escopo conforme a especialidade. Retíficas podem cadastrar motor/peça sem placa. Checklists não apagam itens antigos. Os campos próprios de equipamento, local, limpeza e agenda permanecem nos respectivos ramos.

Registros antigos e criações por integrações sem tipo mostram “Tipo não informado”. Não há classificação automática inferida do relato. Para definir um tipo numa OS ativa antiga, abra Editar OS e serviços. Históricos entregues mantêm suas restrições de edição.

Persistência: `oficinas.especialidade`, `ordens_servico.tipo_servico`, `ordens_servico.detalhes_especialidade` e `atendimentos_servicos.dados`. A migration `20261008000500` valida ramo/especialidade e tipos compatíveis no banco, preservando o tipo existente se a especialidade mudar. Cadastro novo usa a assinatura de seis parâmetros de `configurar_nova_empresa`; a versão de cinco parâmetros não é mais concedida a clientes autenticados.

Validação: `validate-especialidades.mjs` cobre as 13 especialidades, persistência em OS com itens e atendimentos, cadastro idempotente, combinações inválidas e isolamento entre empresas. TypeScript, lint e build passaram; 27 testes de alertas e recorrências passaram. A demonstração confirmou seleção de cabeçote, gravação e símbolo no mapa. Dados de demonstração não são gravados no Supabase.
