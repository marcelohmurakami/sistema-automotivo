# n8n do automotivo

Workflow `workflows/01-avisos-automotivo.json`, importado como `dBajzPqLKMPAgsug` em https://n8n.murakamitech.tech.

A cada 5 minutos chama a função `automacoes-oficina` no Supabase automotivo com `x-automotivo-secret`. A função gera lembretes idempotentes e processa um aviso aprovado por oficina configurada. O n8n não recebe credenciais de administrador do banco ou dados dos clientes na resposta.

Mantido como rascunho até configurar o segredo, validar o canal `estudos-whatsapp`, o plano Completo e o destinatário de teste. Consulte `docs/expansao-documentos-site-automacoes.md` para os passos restantes. Não publique o workflow com variáveis ausentes.
