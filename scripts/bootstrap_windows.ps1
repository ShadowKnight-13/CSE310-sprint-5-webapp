Write-Host "Checking Rust prerequisites on Windows..."

$rustc = Get-Command rustc -ErrorAction SilentlyContinue
$cargo = Get-Command cargo -ErrorAction SilentlyContinue
$rustup = Get-Command rustup -ErrorAction SilentlyContinue

if (-not $rustc -or -not $cargo -or -not $rustup) {
    Write-Host "Rust toolchain not fully installed."
    Write-Host "Attempting install with winget (non-admin usually works):"
    Write-Host "  winget install --id Rustlang.Rustup -e"
    try {
        winget install --id Rustlang.Rustup -e
    } catch {
        Write-Host "Auto-install failed. Run manually: winget install --id Rustlang.Rustup -e"
        Write-Host "Or download installer: https://rustup.rs/"
        exit 1
    }
}

Write-Host "Ensuring stable toolchain is installed..."
rustup toolchain install stable
rustup default stable

Write-Host "Versions:"
rustc --version
cargo --version
rustup --version

Write-Host "Done. Build with: cargo run -p dice_gui"
