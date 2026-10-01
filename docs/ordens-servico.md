# Ordens de serviço

Implementação integrada ao Supabase em 29/09/2026. Acesso nos planos Intermediário e Completo.

## Fluxo de uso

1. Abra **Ordens de serviço → Nova OS** e escolha cliente e veículo já cadastrados. Informe o relato, responsável e previsão. Também é possível converter um orçamento aprovado e usar **Abrir ordem de serviço** no detalhe do orçamento.
2. Na aba **Atendimento**, edite diagnóstico, entrada/saída, combustível, pertences, observações internas, resumo para o cliente, garantia, prioridade e checklist. O responsável é um nome livre; não é uma atribuição de permissão de usuário.
3. Em **Execução**, acompanhe cada peça/serviço como pendente, em execução ou concluído. OS aberta diretamente permite adicionar e corrigir descrição, quantidade e preço. A correção preserva os valores anteriores no histórico. Itens provenientes de orçamento aprovado mantêm seus valores: serviços adicionais exigem outro orçamento.
4. Registre motivos de parada e resolva-os quando o trabalho puder continuar.
5. Em **Fotos**, envie JPG, PNG ou WebP, selecionando Antes, Durante ou Depois e uma legenda. O seletor do celular permite escolher imagens ou usar a câmera conforme o aparelho. O formulário aceita até 10 MB por arquivo; a demonstração aceita até 1,5 MB e depende da capacidade do armazenamento local.
6. Em **Histórico**, consulte a linha do tempo, expanda as alterações e acrescente anotações. Registros anteriores não podem ser sobrescritos pela interface.
7. Avance por Recebida → Em execução → Conferência → Pronta → Entregue. Conferência e Pronta permitem retornar à execução. Pendências de itens e paradas impedem liberar o carro. Cancelamento exige motivo. Entrega/cancelamento bloqueiam edição e novas fotos, mantendo consulta e anotações.

## Fotos e acesso

O bucket `workshop-files` permanece privado. Uma RPC reserva um caminho específico por oficina, OS, arquivo e autor. A política de upload aceita somente a reserva pendente, por até uma hora, para OS aberta e plano habilitado. A confirmação verifica que o objeto existe; somente então a foto aparece na galeria. Não há sobrescrita ou exclusão de arquivos pela interface. URLs de leitura assinadas duram cinco minutos e são renovadas na galeria. Quem já recebeu uma URL assinada pode acessá-la até expirar.

Fotos são internas da oficina; compartilhar fotos com cliente pelo portal ainda não foi implementado. Upload de HEIC/HEIF não é oferecido nesta tela. Reservas interrompidas e arquivos órfãos precisam de futura rotina de limpeza; não são publicados automaticamente nem apagados nesta implementação. O bucket compartilhado conserva o limite global de 15 MB existente; a reserva e a interface limitam fotos da OS a 10 MB.

## Banco

Migração 8: `20260928000800_modulo_ordens_servico.sql`.
Migração 9: `20260929000100_correcao_itens_os.sql`.
Ambas aplicadas pelo SQL Editor com sucesso. Não reaplicar; conciliar histórico do CLI antes de `db push`.

As RPCs novas são `listar_ordens_servico`, `consultar_ordem_servico`, `salvar_ordem_servico`, `salvar_item_os`, `corrigir_item_os`, `registrar_anotacao_os`, `reservar_foto_os` e `confirmar_foto_os`. O módulo reutiliza as RPCs existentes para converter orçamento, mudar andamento, registrar e resolver paradas.

Cada mutação nova mantém histórico e evento na outbox para futura automação. Criação usa chave idempotente; edições e itens usam revisão otimista. Totais são recalculados no banco. Cliente/veículo são validados na abertura e preservados na edição. Só pode haver uma OS com entrada registrada para o mesmo veículo enquanto o atendimento estiver aberto.

## Validação

- `npm run build` e `npm run lint`.
- `node supabase/tests/validate-ordens-servico.mjs` com `DB_VALIDATION_RUNTIME` apontando para PGlite: 28 verificações. Inclui RLS de Storage, isolamento por oficina, acesso por plano, revisão concorrente, total, correção, foto, histórico e entrega.
- Auth e Storage são simulados na suíte SQL. As migrações foram aplicadas no Supabase real. O upload pela Storage API com sessão real de usuário ainda não foi exercitado neste teste.
- Navegador em modo demonstração: criação e persistência de OS, inclusão e correção de item, linha do tempo, foto com legenda e agrupamento por etapa; layout móvel sem rolagem horizontal.

A tela Mapa da oficina consulta as OS abertas e suas paradas reais; consulte `mapa-oficina.md`. O estoque passou a ser integrado à entrega da OS; consulte `estoque.md`. Pagamentos estão integrados ao financeiro. Impressão/PDF da OS e portal do cliente ainda não estão implementados. O checklist é operacional e não representa assinatura ou aprovação do cliente.
