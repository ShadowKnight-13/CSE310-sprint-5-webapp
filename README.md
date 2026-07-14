# CSE310 Sprint 5 Dice App

This repo contains two implementations of the same dice roller project:

- A Rust desktop app (`dice_gui` + `dice_core`)
- A Python Flask web app (`python_webapp`)

Both versions support dice notation (for example `2d6+1`, `d20`, `4d8-2`), favorites, roll history, and a calculator.

## Features

- Dice notation parser with validation
- Roll modes: `normal`, `advantage`, `disadvantage`
- Favorites saved to `favorite_rolls.json`
- Session roll history with clear action
- Calculator endpoint/UI that supports arithmetic and `ans`

## Repository Layout

- `dice_core/`: Rust library for parsing and rolling dice
- `dice_gui/`: Rust `egui` desktop interface
- `python_webapp/`: Flask app (`templates/` + `static/`)
- `scripts/`: bootstrap and build scripts
- `favorite_rolls.json`: shared favorites file

## Quick Start: Python Web App

Run these commands from the repository root.

### Windows PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r python_webapp/requirements.txt
python python_webapp/app.py
```

Open: `http://127.0.0.1:5000`

### Linux/macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r python_webapp/requirements.txt
python python_webapp/app.py
```

Open: `http://127.0.0.1:5000`

## Build Windows Desktop EXE (Flask Packaged)

This packages the web app as a local desktop executable via PyInstaller.

From repo root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
.\scripts\build_desktop_windows.ps1
```

Output executable:

- `dist\DiceRollerApp.exe`

Notes:

- The desktop app serves locally at `http://127.0.0.1:5000`.
- If missing, `favorite_rolls.json` is created next to the executable.

## Run Rust Version

Install Rust first (recommended: `rustup`), then from repo root:

```bash
cargo run -p dice_gui
```

Optional CLI roll mode:

```bash
cargo run -p dice_gui -- 2d6+1
```

## Flask API Summary

Implemented in `python_webapp/app.py`.

- `GET /`: Render app UI
- `POST /api/roll`: Roll dice by notation and mode
- `GET /api/history`: Read in-memory session history
- `POST /api/history/clear`: Clear session history and session favorite stats
- `GET /api/favorites`: List favorites with session stats
- `POST /api/favorites`: Add one favorite
- `POST /api/favorites/save`: Overwrite/reorder full favorites list
- `DELETE /api/favorites/<index>`: Delete favorite by index
- `POST /api/calculate`: Evaluate safe calculator expression

## Toolchain

- Python 3.11+ recommended
- Flask 3.x (pinned in `python_webapp/requirements.txt`)
- Rust stable toolchain for Rust components

## Helpful Scripts

- `scripts/bootstrap_windows.ps1`: checks/installs Rust prerequisites on Windows
- `scripts/bootstrap_linux.sh`: checks/installs Rust prerequisites on Linux
- `scripts/build_desktop_windows.ps1`: builds desktop EXE with PyInstaller

## Notes for Development

- Root `requirements.txt` points to `python_webapp/requirements.txt`.
- `app.py` at the repository root is a small launcher that imports `python_webapp.app`.
- Flask history and favorite session statistics are in-memory and reset when the server restarts.