import json
import time
from pathlib import Path
from parser import parse_file
from models import Chunk

_STATE_FILE = Path(__file__).parent / ".scanner_state.json"


def _load_state() -> dict[str, float]:
    if _STATE_FILE.exists():
        return json.loads(_STATE_FILE.read_text(encoding="utf-8"))
    return {}


def _save_state(state: dict[str, float]) -> None:
    _STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def scan(notes_dir: Path, vault_root: Path) -> list[Chunk]:
    """Retourne les chunks des fichiers .md modifiés depuis le dernier scan."""
    state = _load_state()
    new_chunks: list[Chunk] = []

    for md_file in notes_dir.rglob("*.md"):
        key = md_file.as_posix()
        mtime = md_file.stat().st_mtime
        if state.get(key) == mtime:
            continue  # non modifié
        try:
            chunks = parse_file(md_file, vault_root)
            new_chunks.extend(chunks)
            state[key] = mtime
        except Exception as e:
            print(f"[WARN] Erreur sur {md_file}: {e}")

    _save_state(state)
    return new_chunks


def watch(notes_dir: Path, vault_root: Path, interval: int = 10) -> None:
    """Boucle de surveillance continue (Ctrl+C pour stopper)."""
    print(f"Surveillance de {notes_dir} (intervalle {interval}s) — Ctrl+C pour arrêter")
    while True:
        chunks = scan(notes_dir, vault_root)
        if chunks:
            print(f"[{time.strftime('%H:%M:%S')}] {len(chunks)} chunk(s) mis à jour")
            for c in chunks:
                print(f"  • {c.source_file} | {c.heading_path}")
        time.sleep(interval)
