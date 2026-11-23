param([string]$Marcador = '../output/cadastros-compras-velocidade-20261118/manter-ativo')
$marcadorAuditoria = Join-Path $PSScriptRoot $Marcador
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class EnergiaAuditoria { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint state); }'
try {
  $resultadoAuditoria = [EnergiaAuditoria]::SetThreadExecutionState([uint32]2147483649)
  if ($resultadoAuditoria -eq 0) { throw 'Não foi possível manter a execução ativa.' }
  Write-Output 'Impedimento temporário de suspensão automática ativo durante os testes.'
  while (Test-Path -LiteralPath $marcadorAuditoria) { Start-Sleep -Seconds 30 }
} finally {
  [void][EnergiaAuditoria]::SetThreadExecutionState([uint32]2147483648)
  Write-Output 'Configuração temporária liberada.'
}
