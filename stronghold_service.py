from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
GENERATOR_DIR = ROOT_DIR / "tools" / "stronghold_generator"
CLASSES_DIR = GENERATOR_DIR / "build" / "classes"
LIB_DIR = GENERATOR_DIR / "lib"
BUILD_SCRIPT = GENERATOR_DIR / "build.bat"
MAIN_CLASS = "stronghold.StrongholdViewerMain"


class StrongholdGeneratorError(RuntimeError):
    pass


def _classpath() -> str:
    lib_glob = str(LIB_DIR / "*")
    if os.name == "nt":
        return f"{CLASSES_DIR};{lib_glob}"
    return f"{CLASSES_DIR}:{lib_glob}"


def ensure_built(rebuild: bool = False) -> None:
    if not LIB_DIR.exists() or not any(LIB_DIR.glob("*.jar")):
        raise StrongholdGeneratorError(
            "Missing generator lib jars. Run tools/stronghold_generator/setup_libs.ps1 first."
        )

    if rebuild or not CLASSES_DIR.exists():
        if not BUILD_SCRIPT.exists():
            raise StrongholdGeneratorError(f"Missing build script: {BUILD_SCRIPT}")
        cmd = ["cmd", "/c", str(BUILD_SCRIPT)] if os.name == "nt" else ["bash", "-lc", f"cd {GENERATOR_DIR} && javac ..."]
        # On Windows use build.bat; on Unix we'd need a shell script - keep Windows-first for now
        if os.name != "nt":
            _build_unix()
        else:
            result = subprocess.run(cmd, cwd=str(GENERATOR_DIR), capture_output=True, text=True)
            if result.returncode != 0:
                detail = (result.stderr or result.stdout or "").strip()
                raise StrongholdGeneratorError(f"Java build failed: {detail}")

    if not CLASSES_DIR.exists():
        raise StrongholdGeneratorError("Generator classes were not built.")


def _build_unix() -> None:
    src = GENERATOR_DIR / "src" / "stronghold" / "StrongholdViewerMain.java"
    CLASSES_DIR.mkdir(parents=True, exist_ok=True)
    cmd = [
        "javac",
        "-encoding",
        "UTF-8",
        "-cp",
        f"{LIB_DIR}/*",
        "-d",
        str(CLASSES_DIR),
        str(src),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise StrongholdGeneratorError(f"Java build failed: {detail}")


def _run_java(*args: str) -> str:
    ensure_built()
    cmd = ["java", "-cp", _classpath(), MAIN_CLASS, *args]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise StrongholdGeneratorError(detail or "Java process failed")
    output = (result.stdout or "").strip()
    if not output:
        raise StrongholdGeneratorError("Java process returned no output")
    return output


def get_stronghold_locations(seed: str | int) -> dict:
    raw = _run_java("locations", str(seed))
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise StrongholdGeneratorError(f"Invalid locations JSON: {raw[:200]}") from exc
    if "strongholds" not in payload:
        raise StrongholdGeneratorError("Locations response missing strongholds array")
    return payload


def generate_stronghold(seed: str | int, chunk_x: int, chunk_z: int) -> dict:
    raw = _run_java("generate", str(seed), str(int(chunk_x)), str(int(chunk_z)))
    fixed = re.sub(r'("worldSeed"\s*:\s*)(-?\d+)', r'\1"\2"', raw)
    try:
        payload = json.loads(fixed)
    except json.JSONDecodeError as exc:
        raise StrongholdGeneratorError(f"Invalid generate JSON: {raw[:200]}") from exc
    payload["worldSeed"] = str(payload.get("worldSeed", seed))
    return payload
