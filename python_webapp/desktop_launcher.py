from __future__ import annotations

import socket
import threading
import time
import webbrowser

from python_webapp.app import app

HOST = "127.0.0.1"
PORT = 5000


def _wait_for_server(host: str, port: int, timeout_seconds: float = 20.0) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def _open_browser_when_ready() -> None:
    if _wait_for_server(HOST, PORT):
        webbrowser.open(f"http://{HOST}:{PORT}")


def main() -> None:
    threading.Thread(target=_open_browser_when_ready, daemon=True).start()
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
