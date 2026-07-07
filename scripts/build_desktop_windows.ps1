$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PythonExe = Join-Path $RepoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    throw "Python venv not found at $PythonExe. Create it first with: python -m venv .venv"
}

Push-Location $RepoRoot
try {
    & $PythonExe -m pip install -r python_webapp/requirements.txt
    & $PythonExe -m pip install pyinstaller

    & $PythonExe -m PyInstaller --noconfirm --clean --onefile --windowed `
        --name DiceRollerApp `
        --add-data "python_webapp/templates;python_webapp/templates" `
        --add-data "python_webapp/static;python_webapp/static" `
        python_webapp/desktop_launcher.py
}
finally {
    Pop-Location
}
