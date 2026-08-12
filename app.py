from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from stronghold_service import StrongholdGeneratorError, generate_stronghold, get_stronghold_locations

ROOT_DIR = Path(__file__).resolve().parent

app = Flask(__name__, static_folder=str(ROOT_DIR), static_url_path="")


@app.get("/")
def index() -> object:
    return send_from_directory(ROOT_DIR, "index.html")


@app.get("/api/strongholds")
def api_strongholds() -> object:
    seed = request.args.get("seed", "").strip()
    if not seed:
        return jsonify({"error": "Missing seed query parameter"}), 400
    try:
        return jsonify(get_stronghold_locations(seed))
    except StrongholdGeneratorError as exc:
        return jsonify({"error": str(exc)}), 500
    except ValueError as exc:
        return jsonify({"error": f"Invalid seed: {exc}"}), 400


@app.get("/api/stronghold")
def api_stronghold() -> object:
    seed = request.args.get("seed", "").strip()
    chunk_x = request.args.get("chunkX", "").strip()
    chunk_z = request.args.get("chunkZ", "").strip()
    if not seed:
        return jsonify({"error": "Missing seed query parameter"}), 400
    if chunk_x == "" or chunk_z == "":
        return jsonify({"error": "Missing chunkX or chunkZ query parameter"}), 400
    try:
        payload = generate_stronghold(seed, int(chunk_x), int(chunk_z))
        return jsonify(payload)
    except StrongholdGeneratorError as exc:
        return jsonify({"error": str(exc)}), 500
    except ValueError as exc:
        return jsonify({"error": f"Invalid parameters: {exc}"}), 400


@app.get("/<path:filename>")
def static_files(filename: str) -> object:
    path = ROOT_DIR / filename
    if path.is_file():
        return send_from_directory(ROOT_DIR, filename)
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
