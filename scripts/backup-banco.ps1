param(
  [string]$DbHost = 'db.hzihxtjirttetnfdujcx.supabase.co',
  [string]$DbUser = 'postgres',
  [ValidateRange(1,65535)][int]$DbPort = 5432,
  [Parameter(Mandatory=$true)][string]$Destino,
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin'
)
$ErrorActionPreference = 'Stop'
$refProjeto = 'hzihxtjirttetnfdujcx'
if (!(($DbHost -eq "db.$refProjeto.supabase.co" -and $DbUser -eq 'postgres') -or
    ($DbHost -match '^[a-z0-9.-]+\.pooler\.supabase\.com$' -and $DbUser -eq "postgres.$refProjeto"))) {
  throw 'A conexão precisa pertencer ao projeto automotivo.'
}
$dumpExe = Join-Path $PgBin 'pg_dump.exe'
$restoreExe = Join-Path $PgBin 'pg_restore.exe'
if (!(Test-Path -LiteralPath $dumpExe) -or !(Test-Path -LiteralPath $restoreExe)) { throw 'Instale os utilitários oficiais do PostgreSQL ou informe PgBin.' }
$arquivo = [IO.Path]::GetFullPath($Destino)
if ([IO.Path]::GetExtension($arquivo) -ne '.dump') { throw 'Use um arquivo com extensão .dump.' }
$parcial = "$arquivo.partial"
if ((Test-Path -LiteralPath $arquivo) -or (Test-Path -LiteralPath $parcial)) { throw 'O destino já existe. Escolha outro nome; nenhum backup será sobrescrito.' }
if (!(Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($arquivo)))) { throw 'Crie a pasta de destino antes de exportar.' }
$senha = Read-Host 'Senha atual do banco automotivo (oculta)' -AsSecureString
$credencial = [PSCredential]::new($DbUser,$senha)
$senhaAnterior = $env:PGPASSWORD
$sslAnterior = $env:PGSSLMODE
try {
  $env:PGPASSWORD = $credencial.GetNetworkCredential().Password
  $env:PGSSLMODE = 'require'
  & $dumpExe --host=$DbHost --port=$DbPort --username=$DbUser --dbname=postgres --no-password --format=custom --file=$parcial
  if ($LASTEXITCODE -ne 0) { throw 'Exportação falhou. O arquivo parcial não é um backup válido.' }
  & $restoreExe --list $parcial | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'O arquivo não passou na leitura de integridade.' }
  Move-Item -LiteralPath $parcial -Destination $arquivo
  $hash = (Get-FileHash -LiteralPath $arquivo -Algorithm SHA256).Hash
  [IO.File]::WriteAllText("$arquivo.sha256", "$hash  $([IO.Path]::GetFileName($arquivo))`n")
  Write-Output "Backup exportado: $arquivo"
  Write-Output 'A leitura do arquivo foi validada; a restauração ainda precisa ser testada em ambiente isolado. Os arquivos do Storage exigem cópia separada.'
} finally {
  $env:PGPASSWORD = $senhaAnterior
  $env:PGSSLMODE = $sslAnterior
  $credencial = $null
  $senha.Dispose()
}
