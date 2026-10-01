param([string]$Oficina)
$ErrorActionPreference = 'Stop'
if (-not $Oficina) { $Oficina = Read-Host 'ID da oficina de VALIDACAO preparada no Supabase' }
$contasTeste = @()
try {
    foreach ($letra in @('a','b')) {
        $emailPadrao = "qa.automotivo.$letra.20260930@example.com"
        $emailConta = Read-Host "Email da conta $letra (Enter para $emailPadrao)"
        if (-not $emailConta) { $emailConta = $emailPadrao }
        $senhaSegura = Read-Host "Senha da conta $letra (nao aparece na tela)" -AsSecureString
        $ponteiroSenha = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaSegura)
        try { $senhaConta = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroSenha) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroSenha) }
        $contasTeste += @{ email = $emailConta; senha = $senhaConta }
        $senhaConta = $null
        $senhaSegura.Dispose()
    }
    $configuracaoTeste = @{ oficina_id = $Oficina; contas = $contasTeste } | ConvertTo-Json -Depth 4 -Compress
    $configuracaoTeste | node (Join-Path $PSScriptRoot 'validar-atendimento-real.mjs') -
    if ($LASTEXITCODE -ne 0) { throw 'Validacao interrompida. Consulte o relatorio, sem reenviar dados automaticamente.' }
}
finally { $configuracaoTeste = $null; $contasTeste = $null; $senhaConta = $null }
