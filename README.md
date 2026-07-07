# CSE310 Sprint 5 Dice App

This repository started as a Rust desktop app and now includes a Python webapp version.

## Current App Versions

1. Rust desktop version using egui: dice_gui and dice_core
2. Python webapp version using Flask: python_webapp

Both versions support:

1. Dice notation parsing such as 2d6+1, d20, and 4d8-2
2. Roll modes (normal, advantage, disadvantage)
3. Favorites saved in favorite_rolls.json
4. Session history and quick calculator support

## Run The Python Webapp

From the repository root:

1. Create and activate a virtual environment:
	Windows PowerShell:
	python -m venv .venv
	.\.venv\Scripts\Activate.ps1
2. Install dependencies:
	pip install -r python_webapp/requirements.txt
3. Start the server:
	python python_webapp/app.py
4. Open your browser to:
	http://127.0.0.1:5000

## Build A Desktop Local App (Windows)

This packages the Flask app into a local `.exe` you can launch from your desktop.

From the repository root:

1. Create and activate a virtual environment (if needed):
	python -m venv .venv
	.\.venv\Scripts\Activate.ps1
2. Run the build script:
	.\scripts\build_desktop_windows.ps1
3. After build finishes, open:
	`dist\DiceRollerApp.exe`

Notes:

1. The app opens locally at `http://127.0.0.1:5000` and is not public.
2. A `favorite_rolls.json` file is created next to the `.exe` if one does not already exist.

## Run The Existing Rust App

1. Install Rust using rustup.
2. From the repo root run:
	cargo run -p dice_gui
3. Optional CLI roll:
	cargo run -p dice_gui -- 2d6+1

## Project Structure

1. dice_core: Rust dice parsing and roll logic library
2. dice_gui: Rust egui desktop interface
3. python_webapp: Flask app with browser UI
4. favorite_rolls.json: shared favorites file used by both versions

## Development Environment

1. Python 3.11+ (recommended)
2. Flask 3.x
3. Rust stable toolchain (for the original version)

## Useful Resources

1. Flask docs: https://flask.palletsprojects.com/
2. Python ast module: https://docs.python.org/3/library/ast.html
3. Rust book: https://doc.rust-lang.org/book/

## Future Work

1. Add automated tests for the Flask API endpoints
2. Add persistent calculator log storage
3. Add export/import for favorites within the web UI