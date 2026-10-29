param()
$ErrorActionPreference = 'Stop'
$variablePath = 'f/sales_tracker/kapso_api_key'
$localPath = Join-Path $env:LOCALAPPDATA 'Beforest/Secrets/kapso-api-key.clixml'
$remotePath = Join-Path $env:APPDATA 'windmill/remotes.ndjson'
$pointer = [IntPtr]::Zero
try {
    $remote = Get-Content -LiteralPath $remotePath | ForEach-Object { $_ | ConvertFrom-Json } |
        Where-Object { $_.name -eq 'beforest-automations' } | Select-Object -First 1
    if (-not $remote) { throw 'Windmill workspace is not configured.' }
    $base = $remote.remote.TrimEnd('/') + '/api/w/' + $remote.workspaceId
    if (-not $base.StartsWith('https://flows.ops.beforest.co/api/w/')) { throw 'Unexpected Windmill destination.' }
    $headers = @{ Authorization = 'Bearer ' + $remote.token }
    $variables = Invoke-RestMethod -Uri ($base + '/variables/list') -Headers $headers
    if ($variables.path -contains $variablePath) { throw 'Kapso variable already exists. Ask Codex to check it before replacing it.' }
    if (Test-Path -LiteralPath $localPath) { throw 'Local encrypted Kapso key already exists. Ask Codex to check it before replacing it.' }
    $secureKey = Read-Host 'Paste Kapso API key (hidden)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
    if ([string]::IsNullOrWhiteSpace($plainKey) -or $plainKey -match '\s') { throw 'Key must be nonempty and contain no whitespace.' }
    $body = @{ path = $variablePath; value = $plainKey; is_secret = $true;
        description = 'Beforest Kapso API key; user-provided. No sends enabled.' } | ConvertTo-Json
    $null = Invoke-RestMethod -Uri ($base + '/variables/create') -Headers $headers -Method Post -ContentType 'application/json' -Body $body
    $saved = Invoke-RestMethod -Uri ($base + '/variables/get_value/' + $variablePath) -Headers $headers
    $metadata = Invoke-RestMethod -Uri ($base + '/variables/list') -Headers $headers
    $entry = $metadata | Where-Object { $_.path -eq $variablePath } | Select-Object -First 1
    if ($saved -cne $plainKey -or -not $entry.is_secret) { throw 'Windmill secret verification failed.' }
    $null = New-Item -ItemType Directory -Path (Split-Path $localPath) -Force
    $plainKey | ConvertTo-SecureString -AsPlainText -Force | Export-Clixml -LiteralPath $localPath
    Write-Host "Saved and verified Windmill secret: $variablePath"
    Write-Host "Windows-encrypted local copy: $localPath"
    Write-Host 'No messages sent. Kapso account access has not yet been tested.'
} catch {
    # Avoid displaying HTTP exception bodies that could include credentials.
    Write-Host 'Setup did not finish. No key was displayed. Ask Codex to check the saved state before retrying.'
    exit 1
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $plainKey = $null; $saved = $null; $body = $null; $secureKey = $null
}
