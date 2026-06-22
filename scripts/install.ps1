#!/usr/bin/env pwsh
# Install pie - AI coding assistant for Windows
# Usage: iwr -Uri https://github.com/Codevaani/Pi-Enhanced/releases/download/v1.0.0/install.ps1 -UseBasicParsing | iex

param(
    [string]$Version = "latest",
    [string]$InstallDir = ""
)

$Repo = "Codevaani/Pi-Enhanced"
$ErrorActionPreference = "Stop"

function Write-Info($msg) { Write-Host "==> $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "==> $msg" -ForegroundColor Blue }
function Write-Error($msg) { Write-Host "==> $msg" -ForegroundColor Red; exit 1 }

# Detect platform
function Get-Platform {
    $os = "windows"
    $processArch = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
    if (-not $processArch) {
        $processArch = $env:PROCESSOR_ARCHITECTURE
    }
    if ($processArch -eq "AMD64" -and $env:PROCESSOR_ARCHITEW6432) {
        $processArch = $env:PROCESSOR_ARCHITEW6432
    }
    $arch = switch ($processArch.ToUpperInvariant()) {
        "X64"   { "x64" }
        "AMD64" { "x64" }
        "ARM64" { "arm64" }
        default { Write-Error "Unsupported architecture: $processArch" }
    }
    return "pie-$os-$arch.zip"
}

# Resolve release tag and download URL
function Get-ReleaseTag {
    if ($Version -ne "latest") { return $Version }
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    return $release.tag_name
}

function Get-DownloadUrl($platform) {
    $tag = Get-ReleaseTag
    return "https://github.com/$Repo/releases/download/$tag/$platform"
}

# Detect install directory
function Get-InstallDir {
    if ($InstallDir) { return $InstallDir }
    # Prefer ~/bin, then LOCALAPPDATA\Programs\pi
    $userBin = Join-Path $HOME "bin"
    if (Test-Path $userBin) { return $userBin }
    $appDir = Join-Path $env:LOCALAPPDATA "Programs\pi"
    New-Item -ItemType Directory -Force -Path $appDir | Out-Null
    return $appDir
}

function Main {
    Write-Info "Detecting platform..."
    $platform = Get-Platform
    Write-Info "Platform: $platform"

    $url = Get-DownloadUrl $platform
    Write-Info "Downloading pie from: $url"

    $tmpDir = Join-Path $env:TEMP "pie-install-$([System.IO.Path]::GetRandomFileName())"
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

    try {
        $zipPath = Join-Path $tmpDir "pie.zip"
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

        $extractDir = Join-Path $tmpDir "pie-extracted"
        Expand-Archive -Path $zipPath -DestinationPath $extractDir

        # Find the binary
        $binary = Get-ChildItem -Path $extractDir -Recurse -Include "pie.exe", "pi.exe" | Select-Object -First 1
        if (-not $binary) {
            Write-Error "Binary not found in the archive"
        }

        # Rename to pie.exe if needed
        $targetName = "pie.exe"
        if ($binary.Name -ne $targetName) {
            Move-Item $binary.FullName (Join-Path $binary.Directory $targetName) -Force
        }

        $installDir = Get-InstallDir
        New-Item -ItemType Directory -Force -Path $installDir | Out-Null
        Copy-Item (Join-Path $binary.Directory $targetName) (Join-Path $installDir $targetName) -Force

        Write-Info "Installed to: $installDir\pie.exe"

        # Check PATH
        $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
        if ($userPath -notlike "*$installDir*") {
            Write-Warn "NOTE: $installDir is not in your PATH."
            Write-Warn "Add it by running (as Administrator):"
            Write-Warn "  [Environment]::SetEnvironmentVariable('PATH', [Environment]::GetEnvironmentVariable('PATH', 'User') + ';$installDir', 'User')"
        }

        Write-Info "Run 'pie --help' to get started"
    }
    finally {
        Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Main
