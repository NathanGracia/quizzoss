import json
import re
import time
from pathlib import Path
from google.genai import errors as genai_errors
import llm

CHUNKS_FILE    = Path(__file__).parent / "chunks.json"
QUESTIONS_FILE = Path(__file__).parent / "questions.json"
RPM_DELAY = 0.5  # paid tier : 1000 req/min, petite pause pour éviter les bursts


def _retry_delay_from_error(e: Exception) -> float:
    """Extrait le délai retryDelay depuis le message d'erreur Gemini."""
    match = re.search(r"retryDelay.*?(\d+)s", str(e))
    return float(match.group(1)) + 2 if match else 60.0


def prebuild(force: bool = False) -> None:
    chunks = json.loads(CHUNKS_FILE.read_text(encoding="utf-8"))

    existing: dict[str, dict] = {}
    if QUESTIONS_FILE.exists() and not force:
        existing = {q["chunk_id"]: q for q in json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))}

    to_do = [c for c in chunks if c["id"] not in existing]
    print(f"{len(existing)} questions déjà générées, {len(to_do)} à générer.")

    if not to_do:
        print("Rien à faire.")
        return

    results = list(existing.values())

    for i, chunk in enumerate(to_do):
        label = f"[{i+1}/{len(to_do)}] {chunk['source_file']} | {chunk['heading_path'][:55]}"
        retries = 0
        while retries < 5:
            try:
                print(label)
                qa = llm.generate_question(chunk["source_file"], chunk["heading_path"], chunk["content"])
                results.append({
                    "chunk_id":       chunk["id"],
                    "source_file":    chunk["source_file"],
                    "heading_path":   chunk["heading_path"],
                    "parent_context": chunk["parent_context"],
                    "content":        chunk["content"],
                    "question":       qa["question"],
                    "expected":       qa["reponse_attendue"],
                })
                QUESTIONS_FILE.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
                break
            except genai_errors.ClientError as e:
                if "429" in str(e):
                    delay = _retry_delay_from_error(e)
                    print(f"  [429] Rate limit — attente {delay:.0f}s...")
                    time.sleep(delay)
                    retries += 1
                else:
                    print(f"  [ERREUR] {e}")
                    break
            except Exception as e:
                print(f"  [ERREUR] {e}")
                break

        # Respect du rate limit entre chaque requête réussie
        if i < len(to_do) - 1:
            time.sleep(RPM_DELAY)

    print(f"\nTerminé. {len(results)} questions dans questions.json")
