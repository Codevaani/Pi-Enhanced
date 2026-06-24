#!/usr/bin/env bash
#
# Install pie - AI coding assistant
# Usage: curl -fsSL https://github.com/Codevaani/Pi-Enhanced/releases/latest/download/install.sh | bash
#
# Supported platforms:
#   Linux (x64, arm64), macOS (x64, arm64), Windows (x64, arm64) via WSL/Cygwin/MSYS2

set -euo pipefail

REPO="Codevaani/Pi-Enhanced"
VERSION="${VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}==>${NC} $*"; }
warn()  { echo -e "${BLUE}==>${NC} $*"; }
error() { echo -e "${RED}==>${NC} $*"; exit 1; }

# Detect platform
detect_platform() {
    local os arch suffix

    case "$(uname -s)" in
        Linux)  os="linux"  ;;
        Darwin) os="darwin" ;;
        CYGWIN*|MINGW*|MSYS*) os="windows" ;;
        *)      error "Unsupported OS: $(uname -s). pie supports Linux, macOS, and Windows." ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64) arch="x64"  ;;
        aarch64|arm64) arch="arm64" ;;
        *) error "Unsupported architecture: $(uname -m). pie supports x64 and arm64." ;;
    esac

    if [ "$os" = "windows" ]; then
        suffix=".zip"
    else
        suffix=".tar.gz"
    fi

    echo "pie-$os-$arch$suffix"
}

# Resolve the download URL
resolve_url() {
    local platform="$1"

    if [ "$VERSION" = "latest" ]; then
        echo "https://github.com/$REPO/releases/latest/download/$platform"
    else
        echo "https://github.com/$REPO/releases/download/$VERSION/$platform"
    fi
}

# Detect install directory
detect_install_dir() {
    if [ -n "$INSTALL_DIR" ]; then
        echo "$INSTALL_DIR"
        return
    fi

    # Prefer ~/.local/bin (XDG), then /usr/local/bin
    if [ -d "$HOME/.local/bin" ]; then
        echo "$HOME/.local/bin"
    elif [ -d "/usr/local/bin" ]; then
        echo "/usr/local/bin"
    else
        mkdir -p "$HOME/.local/bin"
        echo "$HOME/.local/bin"
    fi
}

# Main install
main() {
    info "Detecting platform..."
    local platform
    platform=$(detect_platform)
    info "Platform: $platform"

    local url
    url=$(resolve_url "$platform")
    info "Downloading pie from: $url"

    local tmpdir
    tmpdir=$(mktemp -d)
    cd "$tmpdir"

    if echo "$platform" | grep -q "\.zip$"; then
        curl -fsSL "$url" -o pie.zip
        unzip -q pie.zip -d pie-extracted
        # Find the binary (could be pi.exe or pie.exe in the extracted dir)
        local binary
        binary=$(find pie-extracted -name "pie.exe" -o -name "pi.exe" 2>/dev/null | head -1)
        if [ -z "$binary" ]; then
            error "Binary not found in the archive"
        fi
        mv "$binary" pie.exe
    else
        curl -fsSL "$url" | tar -xz
        # After extraction, the binary is inside pie/ directory
        if [ -f "pie/pie" ]; then
            mv pie/pie ./pie_tmp
            rm -rf pie
            mv pie_tmp pie
        elif [ -f "pie/pi" ]; then
            mv pie/pi ./pi_tmp
            rm -rf pie
            mv pi_tmp pi
        else
            error "Binary not found in the archive"
        fi
    fi

    local install_dir
    install_dir=$(detect_install_dir)

    # Determine binary name
    local binary_name="pie"
    if echo "$platform" | grep -q "windows"; then
        if [ -f "pie.exe" ]; then
            binary_name="pie.exe"
        else
            binary_name="pi.exe"
        fi
    else
        if [ -f "pie" ]; then
            binary_name="pie"
        else
            binary_name="pi"
        fi
    fi

    # Rename to pie
    if [ "$binary_name" != "pie" ] && [ "$binary_name" != "pie.exe" ]; then
        mv "$binary_name" "pie${binary_name##*pi}"
    fi

    chmod +x pie*
    mkdir -p "$install_dir"
    mv pie* "$install_dir/"

    cd /
    rm -rf "$tmpdir"

    info "Installed to: $install_dir/pie"
    info "Run 'pie --help' to get started"

    if ! echo "$PATH" | tr ':' '\n' | grep -q "$install_dir"; then
        warn "NOTE: $install_dir is not in your PATH."
        warn "Add it by running:"
        warn "  export PATH=\"\$PATH:$install_dir\""
    fi
}

main "$@"
