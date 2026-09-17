$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$envFile = Join-Path $root '.env'
$logDir = Join-Path $root '.logs'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$outLog = Join-Path $logDir 'server.out.log'
$errLog = Join-Path $logDir 'server.err.log'

function Read-EnvValue {
    param(
        [string]$Name,
        [string]$Fallback = ''
    )

    if (-not (Test-Path -LiteralPath $envFile)) {
        return $Fallback
    }

    $lines = @()
    try {
        $lines = Get-Content -LiteralPath $envFile -Encoding UTF8
    }
    catch {
        $lines = Get-Content -LiteralPath $envFile
    }

    foreach ($line in $lines) {
        if ($line -match ('^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*?)\s*$')) {
            $value = $matches[1].Trim()
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                if ($value.Length -ge 2) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
            }
            if ($value) { return $value }
        }
    }

    return $Fallback
}

function Get-ParentVault {
    param([string]$StartDir)

    $current = $StartDir

    for ($i = 0; $i -lt 12; $i++) {
        if (Test-Path -LiteralPath (Join-Path $current '.obsidian')) {
            return (Resolve-Path -LiteralPath $current).Path
        }

        $parent = Split-Path -Parent $current
        if (-not $parent -or $parent -eq $current) { break }
        $current = $parent
    }

    return ''
}

function U([int[]]$codes) {
    return -join ($codes | ForEach-Object { [char]$_ })
}

$documents = U @(0x0414,0x043E,0x043A,0x0443,0x043C,0x0435,0x043D,0x0442,0x044B)
$vaultFolder = U @(0x004F,0x0062,0x0073,0x0069,0x0064,0x0069,0x0061,0x006E,0x0020,0x0056,0x0061,0x0075,0x006C,0x0074)
$booksFolder = U @(0x041A,0x043D,0x0438,0x0433,0x0438)

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

if ($null -eq $node) {
    Write-Host 'ERROR: Node.js is not available in PATH.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}

if ($null -eq $npm) {
    Write-Host 'ERROR: npm is not available in PATH.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}

Set-Location -LiteralPath $root

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
    Write-Host 'ERROR: package.json was not found.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}

$configuredVault = Read-EnvValue 'OBSIDIAN_VAULT' ''
$vaultCandidates = @()

if ($configuredVault) {
    $vaultCandidates += $configuredVault
}

$vaultCandidates += @(
    (Join-Path $HOME (Join-Path 'OneDrive' (Join-Path $documents $vaultFolder))),
    (Join-Path $HOME (Join-Path 'OneDrive' (Join-Path 'Documents' $vaultFolder))),
    (Join-Path $HOME (Join-Path 'Documents' $vaultFolder)),
    (Join-Path $HOME $vaultFolder)
)

$vaultPath = ''

foreach ($candidate in ($vaultCandidates | Select-Object -Unique)) {
    if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate '.obsidian'))) {
        $vaultPath = (Resolve-Path -LiteralPath $candidate).Path
        break
    }
}

if (-not $vaultPath) {
    $vaultPath = Get-ParentVault -StartDir $root
}

if (-not $vaultPath) {
    Write-Host 'ERROR: Obsidian Vault was not found.' -ForegroundColor Red
    Write-Host 'Set OBSIDIAN_VAULT in .env or place the project inside the Vault.' -ForegroundColor Yellow
    Read-Host 'Press Enter to exit'
    exit 1
}

$booksCandidates = @($booksFolder, 'Books', 'Book')
$chosenBooks = ''

foreach ($name in $booksCandidates) {
    if (Test-Path -LiteralPath (Join-Path $vaultPath $name) -PathType Container) {
        $chosenBooks = $name
        break
    }
}

if (-not $chosenBooks) {
    $configuredBooks = Read-EnvValue 'BOOKS_DIR' ''
    if ($configuredBooks) {
        $chosenBooks = $configuredBooks
    }
}

if (-not $chosenBooks) {
    $chosenBooks = $booksFolder
}

$env:OBSIDIAN_VAULT = $vaultPath
$env:BOOKS_DIR = $chosenBooks

$port = 3050
$portText = Read-EnvValue 'PORT' '3050'
$parsedPort = 0
if ([int]::TryParse($portText, [ref]$parsedPort)) {
    if ($parsedPort -ge 1 -and $parsedPort -le 65535) {
        $port = $parsedPort
    }
}
$env:PORT = [string]$port

$nodeModules = Join-Path $root 'node_modules'

if (-not (Test-Path -LiteralPath $nodeModules -PathType Container)) {
    Write-Host 'Installing dependencies...' -ForegroundColor Cyan
    & $npm.Source install --no-audit --no-fund

    if ($LASTEXITCODE -ne 0) {
        Write-Host 'ERROR: npm install failed.' -ForegroundColor Red
        Read-Host 'Press Enter to exit'
        exit 1
    }
}

Remove-Item -LiteralPath $outLog, $errLog -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '=============================================' -ForegroundColor DarkGray
Write-Host ' Bookroom' -ForegroundColor Cyan
Write-Host '=============================================' -ForegroundColor DarkGray
Write-Host ''
Write-Host ("Project: {0}" -f $root) -ForegroundColor Gray
Write-Host ("Vault:   {0}" -f $vaultPath) -ForegroundColor Gray
Write-Host ("Books:   {0}" -f (Join-Path $vaultPath $chosenBooks)) -ForegroundColor Gray
Write-Host ("Port:    {0}" -f $port) -ForegroundColor Gray
Write-Host ''
Write-Host 'Starting server...' -ForegroundColor Cyan

$proc = Start-Process `
    -FilePath $node.Source `
    -ArgumentList @('server.js') `
    -WorkingDirectory $root `
    -WindowStyle Minimized `
    -PassThru `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog

$ready = $false

for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 300

    if ($proc.HasExited) { break }

    try {
        $response = Invoke-WebRequest `
            -Uri ("http://127.0.0.1:{0}/api/config" -f $port) `
            -UseBasicParsing `
            -TimeoutSec 1 `
            -ErrorAction Stop

        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    }
    catch {
        # Server is still starting.
    }
}

if (-not $ready) {
    Write-Host ''
    Write-Host '=============================================' -ForegroundColor Red
    Write-Host ' Bookroom failed to start' -ForegroundColor Red
    Write-Host '=============================================' -ForegroundColor Red
    Write-Host ''

    if ($proc.HasExited) {
        Write-Host ("Node process exited with code: {0}" -f $proc.ExitCode) -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host '--- server.err.log ---' -ForegroundColor Yellow
    if (Test-Path -LiteralPath $errLog) {
        Get-Content -LiteralPath $errLog -Tail 120
    }

    Write-Host ''
    Write-Host '--- server.out.log ---' -ForegroundColor Yellow
    if (Test-Path -LiteralPath $outLog) {
        Get-Content -LiteralPath $outLog -Tail 120
    }

    Write-Host ''
    Write-Host ("Logs: {0}" -f $logDir) -ForegroundColor Gray
    Read-Host 'Press Enter to exit'
    exit 1
}

Write-Host ''
Write-Host '=============================================' -ForegroundColor Green
Write-Host ' Bookroom started successfully' -ForegroundColor Green
Write-Host '=============================================' -ForegroundColor Green
Write-Host ''
Write-Host ("URL: http://localhost:{0}" -f $port) -ForegroundColor Cyan
Write-Host ''

Start-Process ("http://localhost:{0}" -f $port)

Read-Host 'Press Enter to close this launcher window'
