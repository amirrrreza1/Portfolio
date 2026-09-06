[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet('list', 'create', 'download')]
    [string] $Action,

    [Parameter(Position = 1)]
    [string] $ArchiveName,

    [Parameter(Position = 2)]
    [string] $Destination = (Join-Path $PSScriptRoot 'downloads')
)

$ErrorActionPreference = 'Stop'
$composeEnvironmentFile = if ($env:COMPOSE_ENV_FILE) {
    $env:COMPOSE_ENV_FILE
} else {
    Join-Path $PSScriptRoot '.env.compose'
}
$composeArguments = @(
    '--env-file', $composeEnvironmentFile,
    '-f', (Join-Path $PSScriptRoot 'compose.yaml'),
    '-f', (Join-Path $PSScriptRoot 'compose.production.yaml'),
    '--profile', 'full'
)

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]] $Arguments)

    & docker compose @composeArguments @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose failed with exit code $LASTEXITCODE"
    }
}

switch ($Action) {
    'list' {
        Invoke-Compose -Arguments @('exec', '-T', 'backup', '/opt/portfolio/bin/backup-list.sh')
    }
    'create' {
        Invoke-Compose -Arguments @('exec', '-T', 'backup', '/opt/portfolio/bin/backup-and-notify.sh')
    }
    'download' {
        if (-not $ArchiveName) {
            $backups = @(& docker compose @composeArguments exec -T backup /opt/portfolio/bin/backup-list.sh)
            if ($LASTEXITCODE -ne 0) {
                throw "Could not list backups (docker compose exit code $LASTEXITCODE)."
            }
            $ArchiveName = $backups | Select-Object -First 1
        }
        if ($ArchiveName -notmatch '^portfolio-\d{8}T\d{6}Z\.tar\.gz\.gpg$') {
            throw 'No backup found, or the archive name is invalid.'
        }

        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
        $archiveDestination = Join-Path $Destination $ArchiveName
        $checksumDestination = "$archiveDestination.sha256"
        if ((Test-Path -LiteralPath $archiveDestination) -or (Test-Path -LiteralPath $checksumDestination)) {
            throw 'Refusing to overwrite an existing downloaded backup.'
        }

        Invoke-Compose -Arguments @('cp', "backup:/backups/$ArchiveName", $archiveDestination)
        Invoke-Compose -Arguments @('cp', "backup:/backups/$ArchiveName.sha256", $checksumDestination)
        Write-Output "Downloaded $ArchiveName and its checksum to $Destination"
    }
}
