#!/usr/bin/env bash
set -euo pipefail

echo "Checking Rust prerequisites on Linux..."

if ! command -v rustc >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1 || ! command -v rustup >/dev/null 2>&1; then
  echo "Rust toolchain not fully installed. Installing rustup + stable toolchain..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  export PATH="$HOME/.cargo/bin:$PATH"
fi

if ! command -v cc >/dev/null 2>&1; then
  echo "Missing C compiler toolchain for native crates."
  echo "Run one of these with sudo (not run automatically):"
  echo "  sudo apt update && sudo apt install -y build-essential pkg-config libx11-dev libxi-dev libgl1-mesa-dev"
  echo "  sudo dnf install -y gcc gcc-c++ make pkgconfig libX11-devel libXi-devel mesa-libGL-devel"
fi

rustup toolchain install stable
rustup default stable

rustc --version
cargo --version
rustup --version

echo "Done. Build with: cargo run -p dice_gui"
