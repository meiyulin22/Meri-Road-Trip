param(
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$composeArguments = @('compose', '--file', (Join-Path $repositoryRoot 'docker-compose.yml'))
$localDatabaseUrl = 'postgresql://meri:meri@localhost:5433/meri'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker was not found. Install Docker Desktop and start its engine, then run npm run db:local again.'
}

Push-Location -LiteralPath $repositoryRoot
try {
    & docker compose version > $null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Compose is unavailable. Enable Docker Compose in Docker Desktop.'
    }

    if ($Stop) {
        & docker @composeArguments stop postgres
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not stop local PostgreSQL. Check that the Docker engine is running.'
        }
        Write-Host 'Local PostgreSQL stopped. The meri-pgdata volume is retained.'
        return
    }

    if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) {
        throw 'npx.cmd was not found. Install Node.js and run npm install first.'
    }

    & docker @composeArguments up -d postgres
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not start local PostgreSQL. Check the Docker engine and port 5433.'
    }

    Write-Host 'Waiting for PostgreSQL to accept connections...'
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & docker @composeArguments exec -T postgres pg_isready -h 127.0.0.1 -U meri -d meri *> $null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        throw 'PostgreSQL did not become ready within 60 attempts. Check docker compose logs postgres.'
    }

    $previousDatabaseUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')
    try {
        # Drizzle config loads .env.local; the process variable takes precedence so
        # this command always migrates the local database, even with a Neon URL saved.
        $env:DATABASE_URL = $localDatabaseUrl
        & npx.cmd drizzle-kit migrate
        if ($LASTEXITCODE -ne 0) {
            throw 'Local database migration failed. Review the Drizzle output above.'
        }
    }
    finally {
        [Environment]::SetEnvironmentVariable('DATABASE_URL', $previousDatabaseUrl, 'Process')
    }

    Write-Host 'Local PostgreSQL is ready. Paste this line into .env.local:'
    Write-Output "DATABASE_URL=$localDatabaseUrl"
}
finally {
    Pop-Location
}
