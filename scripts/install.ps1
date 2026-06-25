#!/usr/bin/env pwsh
# Install pie - AI coding assistant for Windows
# Usage: iwr -Uri https://github.com/Codevaani/Pi-Enhanced/releases/latest/download/install.ps1 -UseBasicParsing | iex

param(
    [string]$Version = "latest",
    [string]$InstallDir = ""
)

$Repo = "Codevaani/Pi-Enhanced"
$ErrorActionPreference = "Stop"

function Write-Info($msg) { Write-Host "==> $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "==> $msg" -ForegroundColor Blue }
function Exit-WithError($msg) { Write-Host "==> $msg" -ForegroundColor Red; exit 1 }

# Detect architecture using $env:PROCESSOR_ARCHITECTURE which is always set
# and works reliably in both Windows PowerShell 5.1 and PowerShell 7+.
# Values: AMD64 (x64), ARM64 (arm64), x86 (unsupported)
function Get-Platform {
    $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
        "AMD64" { "x64" }
        "ARM64" { "arm64" }
        "x86"   {
            # On a 64-bit OS running a 32-bit shell PROCESSOR_ARCHITECTURE reports x86.
            # PROCESSOR_ARCHITEW6432 holds the real OS arch in that case.
            if ($env:PROCESSOR_ARCHITEW6432 -eq "AMD64") {
                "x64"
            } elseif ($env:PROCESSOR_ARCHITEW6432 -eq "ARM64") {
                "arm64"
            } else {
                Exit-WithError "Unsupported architecture: x86 (32-bit). pie requires a 64-bit system."
            }
        }
        default { Exit-WithError "Unsupported architecture: $($env:PROCESSOR_ARCHITECTURE). pie supports x64 and arm64." }
    }
    return "pie-windows-$arch.zip"
}

# Resolve download URL
function Get-DownloadUrl($platform) {
    if ($Version -eq "latest") {
        return "https://github.com/$Repo/releases/latest/download/$platform"
    }
    return "https://github.com/$Repo/releases/download/$Version/$platform"
}

# The lib dir is where the binary AND all assets (theme\, export-html\, assets\,
# package.json) are stored together. The binary uses dirname(process.execPath) to
# locate these assets at runtime, so they must live in the same directory.
function Get-LibDir {
    if ($InstallDir) { return $InstallDir }
    return Join-Path $env:LOCALAPPDATA "Programs\pie"
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

        # The zip archive contains files at the root level (pie.exe, theme\, etc.)
        $libDir = Get-LibDir

        # Remove previous installation and replace with new one
        if (Test-Path $libDir) {
            Remove-Item -Path $libDir -Recurse -Force
        }
        New-Item -ItemType Directory -Force -Path $libDir | Out-Null

        # Copy the full archive contents so assets stay next to the binary
        Copy-Item -Path "$extractDir\*" -Destination $libDir -Recurse -Force

        # Rename pi.exe to pie.exe for consistency if needed
        $piExe  = Join-Path $libDir "pi.exe"
        $pieExe = Join-Path $libDir "pie.exe"
        if ((Test-Path $piExe) -and -not (Test-Path $pieExe)) {
            Rename-Item -Path $piExe -NewName "pie.exe"
        }

        if (-not (Test-Path $pieExe)) {
            Exit-WithError "Binary not found in the extracted archive"
        }

        Write-Info "Installed to: $pieExe"

        # Add libDir to the user PATH if not already present
        $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
        if ($userPath -notlike "*$libDir*") {
            $newPath = if ($userPath) { "$userPath;$libDir" } else { $libDir }
            [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
            Write-Info "Added $libDir to your user PATH"
            Write-Warn "Restart your terminal for the PATH change to take effect"
        }

        Write-Info "Run 'pie --help' to get started"
    }
    finally {
        Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Main
