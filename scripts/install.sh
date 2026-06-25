#!/usr/bin/env bash
#
# Install pie - AI coding assistant
# Usage: curl -fsSL https://github.com/Codevaani/Pi-Enhanced/releases/latest/download/install.sh | bash
#
# Supported platforms:
#   Linux (x64, arm64), macOS (x64, arm64), Windows (x64, arm64) via WSL/Cygwin/MSYS2
#
# The binary and all required assets (themes, export-html templates, assets) are
# installed to a lib directory (~/.local/share/pie/) and the binary is symlinked
# into the PATH directory (~/.local/bin/). This ensures the binary can locate its
# adjacent asset directories at runtime via process.execPath.

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

# Detect bin directory (where the symlink / exe goes into PATH)
detect_bin_dir() {
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

# Detect lib directory (where binary + assets are stored so they stay together)
detect_lib_dir() {
    echo "$HOME/.local/share/pie"
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
    trap 'rm -rf "$tmpdir"' EXIT
    cd "$tmpdir"

    if echo "$platform" | grep -q "\.zip$"; then
        # Windows
        curl -fsSL "$url" -o pie.zip
        unzip -q pie.zip -d pie-extracted

        local bin_dir
        bin_dir=$(detect_bin_dir)
        mkdir -p "$bin_dir"

        # Find the binary
        local binary
        binary=$(find pie-extracted -name "pie.exe" -o -name "pi.exe" 2>/dev/null | head -1)
        if [ -z "$binary" ]; then
            error "Binary not found in the archive"
        fi
        cp "$binary" "$bin_dir/pie.exe"
        chmod +x "$bin_dir/pie.exe"

        info "Installed to: $bin_dir/pie.exe"
        info "Run 'pie --help' to get started"
    else
        # Unix (Linux / macOS)
        curl -fsSL "$url" | tar -xz
        # After extraction the archive contains a pie/ directory with the binary and assets

        local lib_dir bin_dir
        lib_dir=$(detect_lib_dir)
        bin_dir=$(detect_bin_dir)

        # Remove old installation and replace with new one
        rm -rf "$lib_dir"
        mkdir -p "$lib_dir"

        # Copy the full archive contents to lib_dir so assets stay next to the binary
        cp -r pie/. "$lib_dir/"

        # Determine binary name
        local binary_path=""
        if [ -f "$lib_dir/pie" ]; then
            binary_path="$lib_dir/pie"
        elif [ -f "$lib_dir/pi" ]; then
            # Rename to pie for consistency
            mv "$lib_dir/pi" "$lib_dir/pie"
            binary_path="$lib_dir/pie"
        else
            error "Binary not found in the extracted archive"
        fi

        chmod +x "$binary_path"

        # Symlink from bin_dir into lib_dir
        # On Linux/macOS, process.execPath resolves symlinks via /proc/self/exe or dyld,
        # so the binary sees lib_dir as its home and finds theme/, export-html/, assets/ there.
        mkdir -p "$bin_dir"
        ln -sf "$binary_path" "$bin_dir/pie"

        info "Installed to: $bin_dir/pie"
        info "Run 'pie --help' to get started"
    fi

    local bin_dir
    bin_dir=$(detect_bin_dir)
    if ! echo "$PATH" | tr ':' '\n' | grep -qx "$bin_dir"; then
        warn "NOTE: $bin_dir is not in your PATH."
        warn "Add it by running:"
        warn "  export PATH=\"\$PATH:$bin_dir\""
    fi
}

main "$@"
