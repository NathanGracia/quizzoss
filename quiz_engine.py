import random
import json
from pathlib import Path
from config import NOTES_DIR
import llm

CHUNKS_FILE = Path(__file__).parent / "chunks.json"


def _load_chunks(filter_file: str = "") -> list[dict]:
    if not CHUNKS_FILE.exists():
        raise FileNotFoundError("Lance d'abord : python main.py scan")
    chunks = json.loads(CHUNKS_FILE.read_text(encoding="utf-8"))
    if filter_file:
        chunks = [c for c in chunks if filter_file.lower() in c["source_file"].lower()]
    return chunks


def _load_full_note(source_file: str) -> str:
    path = NOTES_DIR.parent / source_file
    return path.read_text(encoding="utf-8") if path.exists() else ""


def run_quiz(filter_file: str = "") -> None:
    chunks = _load_chunks(filter_file)
    if not chunks:
        print("Aucun chunk trouvé.")
        return

    chunk = random.choice(chunks)
    print(f"\nSource : {chunk['source_file']} | {chunk['heading_path']}\n")
    print("Génération de la question...\n")

    qa = llm.generate_question(chunk["source_file"], chunk["heading_path"], chunk["content"])
    question = qa["question"]
    expected = qa["reponse_attendue"]

    print(f"Question : {question}")
    print("\n[Tape ta réponse, ou 'chat' pour ouvrir le mode tuteur, ou 'skip' pour passer]\n")

    user_answer = input("> ").strip()

    if user_answer.lower() == "skip":
        print(f"\nRéponse attendue : {expected}")
        return

    if user_answer.lower() == "chat":
        _run_chat(chunk, question)
        return

    print("\nÉvaluation en cours...\n")
    result = llm.evaluate_answer(question, expected, user_answer, chunk["source_file"], chunk["heading_path"])

    status = result.get("statut", "?")
    explication = result.get("explication", "")
    icon = "✓" if "réussi" in status.lower() else "✗"

    print(f"{icon} {status}")
    if explication:
        print(f"   {explication}")
    print(f"\n→ Source : {chunk['source_file']}")


def _run_chat(chunk: dict, question: str) -> None:
    full_note = _load_full_note(chunk["source_file"])
    history = []
    print(f"\n[Mode tuteur — section : {chunk['heading_path']}]")
    print("Pose tes questions. Tape 'quitter' pour sortir.\n")

    while True:
        user_input = input("Toi : ").strip()
        if user_input.lower() in ("quitter", "exit", "q"):
            break
        response = llm.chat(full_note, chunk["heading_path"], history, user_input)
        print(f"\nTuteur : {response}\n")
        history.append({"role": "user", "text": user_input})
        history.append({"role": "model", "text": response})
