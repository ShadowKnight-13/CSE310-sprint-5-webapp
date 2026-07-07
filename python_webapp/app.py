from __future__ import annotations

import ast
import json
import random
import re
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)


def _resolve_root_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


ROOT_DIR = _resolve_root_dir()
FAVORITES_PATH = ROOT_DIR / "favorite_rolls.json"
MAX_HISTORY = 150
MAX_RECENT_TOTALS = 10

ROLL_HISTORY: deque[dict[str, Any]] = deque(maxlen=MAX_HISTORY)
FAVORITE_SESSION_STATS: dict[str, dict[str, Any]] = {}


@dataclass(frozen=True)
class DiceSpec:
    count: int
    sides: int
    modifier: int


class ParseError(ValueError):
    pass


def parse_notation(notation: str) -> DiceSpec:
    text = notation.strip().lower()
    match = re.fullmatch(r"(\d*)d(\d+)([+-]\d+)?", text)
    if not match:
        raise ParseError("invalid dice format")

    count_text, sides_text, modifier_text = match.groups()

    count = int(count_text) if count_text else 1
    sides = int(sides_text)
    modifier = int(modifier_text) if modifier_text else 0

    if count <= 0 or sides <= 0:
        raise ParseError("dice count and sides must be positive")

    if count > 100 or sides > 10_000:
        raise ParseError("notation is syntactically valid but unsupported")

    return DiceSpec(count=count, sides=sides, modifier=modifier)


def roll_dice(count: int, sides: int) -> list[int]:
    return [random.randint(1, sides) for _ in range(count)]


def roll_notation(notation: str, mode: str = "normal") -> dict[str, Any]:
    spec = parse_notation(notation)
    normalized_mode = mode.strip().lower()

    info = ""
    if normalized_mode in {"advantage", "disadvantage"} and spec.count == 1 and spec.sides == 20:
        first = random.randint(1, 20)
        second = random.randint(1, 20)
        chosen = max(first, second) if normalized_mode == "advantage" else min(first, second)
        total = chosen + spec.modifier
        info = (
            f"{normalized_mode}: rolled {first} and {second}, kept {chosen}"
        )
        results = [chosen]
    else:
        if normalized_mode in {"advantage", "disadvantage"} and not (
            spec.count == 1 and spec.sides == 20
        ):
            info = "Advantage/disadvantage only applies to single d20 rolls. Rolled normally."
        results = roll_dice(spec.count, spec.sides)
        total = sum(results) + spec.modifier

    return {
        "notation": notation,
        "results": results,
        "total": total,
        "modifier": spec.modifier,
        "mode": normalized_mode,
        "info": info,
    }


def load_favorites() -> list[dict[str, str]]:
    if not FAVORITES_PATH.exists():
        return []

    try:
        data = json.loads(FAVORITES_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []

    if not isinstance(data, list):
        return []

    favorites: list[dict[str, str]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        notation = str(item.get("notation", "")).strip()
        category = str(item.get("category", "General")).strip() or "General"
        subcategory = str(item.get("subcategory", "")).strip()
        notes = str(item.get("notes", "")).strip()
        note_pinned = bool(item.get("notePinned", False))
        if notation:
            favorites.append(
                {
                    "name": name or notation,
                    "notation": notation,
                    "category": category,
                    "subcategory": subcategory,
                    "notes": notes,
                    "notePinned": note_pinned,
                }
            )
    return favorites


def save_favorites(favorites: list[dict[str, str]]) -> None:
    FAVORITES_PATH.write_text(json.dumps(favorites, indent=2), encoding="utf-8")


def stats_key(favorite: dict[str, str]) -> str:
    return f"{favorite['name']}|{favorite['notation']}|{favorite['category']}|{favorite.get('subcategory', '')}"


def record_favorite_total(favorite: dict[str, str], total: int) -> None:
    key = stats_key(favorite)
    entry = FAVORITE_SESSION_STATS.setdefault(
        key, {"uses": 0, "total_sum": 0, "recent_totals": []}
    )
    entry["uses"] += 1
    entry["total_sum"] += total
    entry["recent_totals"].append(total)
    if len(entry["recent_totals"]) > MAX_RECENT_TOTALS:
        entry["recent_totals"].pop(0)


def favorite_stats(favorite: dict[str, str]) -> dict[str, Any]:
    key = stats_key(favorite)
    entry = FAVORITE_SESSION_STATS.get(key)
    if not entry:
        return {"uses": 0, "session_avg": None, "recent_totals": []}

    uses = int(entry["uses"])
    avg = (entry["total_sum"] / uses) if uses > 0 else None
    return {
        "uses": uses,
        "session_avg": avg,
        "recent_totals": list(entry["recent_totals"]),
    }


def safe_calculate(expression: str, ans: float | None) -> float:
    allowed_nodes = {
        ast.Expression,
        ast.BinOp,
        ast.UnaryOp,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.Mod,
        ast.Pow,
        ast.USub,
        ast.UAdd,
        ast.Constant,
        ast.Name,
        ast.Load,
        ast.FloorDiv,
    }

    tree = ast.parse(expression, mode="eval")
    for node in ast.walk(tree):
        if type(node) not in allowed_nodes:
            raise ValueError("unsupported expression")
        if isinstance(node, ast.Name) and node.id != "ans":
            raise ValueError("only ans variable is allowed")

    def eval_node(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return eval_node(node.body)
        if isinstance(node, ast.Constant):
            if not isinstance(node.value, (int, float)):
                raise ValueError("only numeric constants are allowed")
            return float(node.value)
        if isinstance(node, ast.Name):
            if ans is None:
                raise ValueError("ans is not available yet")
            return float(ans)
        if isinstance(node, ast.UnaryOp):
            value = eval_node(node.operand)
            if isinstance(node.op, ast.UAdd):
                return value
            if isinstance(node.op, ast.USub):
                return -value
            raise ValueError("unsupported unary operation")
        if isinstance(node, ast.BinOp):
            left = eval_node(node.left)
            right = eval_node(node.right)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
            if isinstance(node.op, ast.FloorDiv):
                return left // right
            if isinstance(node.op, ast.Mod):
                return left % right
            if isinstance(node.op, ast.Pow):
                return left**right
            raise ValueError("unsupported binary operation")

        raise ValueError("unsupported expression")

    return eval_node(tree)


@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.get("/api/favorites")
def get_favorites() -> Any:
    favorites = load_favorites()
    payload = []
    for favorite in favorites:
        item = dict(favorite)
        item["stats"] = favorite_stats(favorite)
        payload.append(item)
    return jsonify(payload)


@app.post("/api/favorites")
def add_favorite() -> Any:
    data = request.get_json(silent=True) or {}
    notation = str(data.get("notation", "")).strip()
    if not notation:
        return jsonify({"error": "notation cannot be empty"}), 400

    name = str(data.get("name", notation)).strip() or notation
    category = str(data.get("category", "General")).strip() or "General"
    subcategory = str(data.get("subcategory", "")).strip()
    notes = str(data.get("notes", "")).strip()
    note_pinned = bool(data.get("notePinned", False))

    favorites = load_favorites()
    if any(
        f["notation"].lower() == notation.lower()
        and f["category"].lower() == category.lower()
        and f.get("subcategory", "").lower() == subcategory.lower()
        for f in favorites
    ):
        return jsonify({"error": "favorite already exists"}), 400

    favorite = {
        "name": name,
        "notation": notation,
        "category": category,
        "subcategory": subcategory,
        "notes": notes,
        "notePinned": note_pinned,
    }
    favorites.append(favorite)
    save_favorites(favorites)

    return jsonify({"favorite": favorite})


@app.post("/api/favorites/save")
def overwrite_favorites() -> Any:
    data = request.get_json(silent=True) or {}
    favorites = data.get("favorites", [])
    if not isinstance(favorites, list):
        return jsonify({"error": "favorites must be a list"}), 400

    normalized: list[dict[str, str]] = []
    for item in favorites:
        if not isinstance(item, dict):
            continue
        notation = str(item.get("notation", "")).strip()
        if not notation:
            continue
        name = str(item.get("name", notation)).strip() or notation
        category = str(item.get("category", "General")).strip() or "General"
        subcategory = str(item.get("subcategory", "")).strip()
        notes = str(item.get("notes", "")).strip()
        note_pinned = bool(item.get("notePinned", False))
        normalized.append(
            {
                "name": name,
                "notation": notation,
                "category": category,
                "subcategory": subcategory,
                "notes": notes,
                "notePinned": note_pinned,
            }
        )

    save_favorites(normalized)
    return jsonify({"favorites": normalized})


@app.delete("/api/favorites/<int:index>")
def delete_favorite(index: int) -> Any:
    favorites = load_favorites()
    if index < 0 or index >= len(favorites):
        return jsonify({"error": "favorite index out of range"}), 404

    deleted = favorites.pop(index)
    save_favorites(favorites)
    return jsonify({"deleted": deleted})


@app.post("/api/roll")
def roll() -> Any:
    data = request.get_json(silent=True) or {}
    notation = str(data.get("notation", "")).strip()
    mode = str(data.get("mode", "normal"))

    if not notation:
        return jsonify({"error": "notation cannot be empty"}), 400

    try:
        result = roll_notation(notation, mode)
    except ParseError as exc:
        return jsonify({"error": str(exc)}), 400

    favorite = data.get("favorite")
    if isinstance(favorite, dict):
        normalized_favorite = {
            "name": str(favorite.get("name", notation)).strip() or notation,
            "notation": str(favorite.get("notation", notation)).strip() or notation,
            "category": str(favorite.get("category", "General")).strip() or "General",
            "subcategory": str(favorite.get("subcategory", "")).strip(),
            "notes": str(favorite.get("notes", "")).strip(),
            "notePinned": bool(favorite.get("notePinned", False)),
        }
        record_favorite_total(normalized_favorite, result["total"])

    ROLL_HISTORY.appendleft(result)
    return jsonify(result)


@app.get("/api/history")
def get_history() -> Any:
    return jsonify(list(ROLL_HISTORY))


@app.post("/api/history/clear")
def clear_history() -> Any:
    ROLL_HISTORY.clear()
    return jsonify({"ok": True})


@app.post("/api/calculate")
def calculate() -> Any:
    data = request.get_json(silent=True) or {}
    expression = str(data.get("expression", "")).strip()
    ans_value = data.get("ans")

    if not expression:
        return jsonify({"error": "enter an expression to calculate"}), 400

    try:
        ans = float(ans_value) if ans_value is not None else None
    except (TypeError, ValueError):
        return jsonify({"error": "ans must be numeric"}), 400

    try:
        value = safe_calculate(expression, ans)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"calculator error: {exc}"}), 400

    return jsonify({"value": value})


if __name__ == "__main__":
    app.run(debug=True)
