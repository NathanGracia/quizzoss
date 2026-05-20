import sys
import json
import dataclasses
from pathlib import Path
from scanner import scan, watch
from config import NOTES_DIR, VAULT_ROOT, SCAN_INTERVAL

CHUNKS_FILE = Path(__file__).parent / "chunks.json"


def _load_chunks() -> list[dict]:
    if CHUNKS_FILE.exists():
        return json.loads(CHUNKS_FILE.read_text(encoding="utf-8"))
    return []


def _save_chunks(chunks) -> None:
    data = [dataclasses.asdict(c) for c in chunks]
    CHUNKS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Chunks sauvegardés dans {CHUNKS_FILE}")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "scan"

    if mode == "scan":
        chunks = scan(NOTES_DIR, VAULT_ROOT)
        print(f"{len(chunks)} chunk(s) extraits")
        _save_chunks(chunks)

    elif mode == "list":
        chunks = _load_chunks()
        if not chunks:
            print("Aucun chunk. Lance d'abord : python main.py scan")
            return
        query = sys.argv[2].lower() if len(sys.argv) > 2 else ""
        filtered = [c for c in chunks if query in c["source_file"].lower() or query in c["heading_path"].lower()] if query else chunks
        print(f"{len(filtered)} chunk(s){f' pour « {query} »' if query else ''}\n")
        for i, c in enumerate(filtered):
            print(f"[{i+1}] {c['source_file']} | {c['heading_path']}")
            print(f"    ID: {c['id']}")
            print(f"    {c['content'][:150].replace(chr(10), ' ')}{'...' if len(c['content']) > 150 else ''}")
            print()

    elif mode == "show":
        idx = int(sys.argv[2]) - 1 if len(sys.argv) > 2 else 0
        chunks = _load_chunks()
        if not chunks or idx >= len(chunks):
            print("Index invalide.")
            return
        c = chunks[idx]
        print(f"Source     : {c['source_file']}")
        print(f"Section    : {c['heading_path']}")
        print(f"ID         : {c['id']}")
        print(f"\n--- Contexte parent ---\n{c['parent_context']}")
        print(f"\n--- Contenu ---\n{c['content']}")

    elif mode == "prebuild":
        from prebuild import prebuild
        force = "--force" in sys.argv
        prebuild(force=force)

    elif mode == "quiz":
        from quiz_engine import run_quiz
        filter_file = sys.argv[2] if len(sys.argv) > 2 else ""
        while True:
            run_quiz(filter_file)
            again = input("\nAutre question ? (o/n) : ").strip().lower()
            if again != "o":
                break

    elif mode == "serve":
        import uvicorn
        print("Interface dispo sur http://localhost:8000")
        uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=False)

    elif mode == "watch":
        watch(NOTES_DIR, VAULT_ROOT, interval=SCAN_INTERVAL)

    else:
        print("Usage: python main.py [scan|list [filtre]|show <n>|quiz [filtre]|serve|watch]")


if __name__ == "__main__":
    main()
