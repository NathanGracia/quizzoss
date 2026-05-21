import json
import random
from pathlib import Path
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import llm
from config import VAULT_ROOT, NOTES_DIR, EDIT_PASSWORD

app = FastAPI()
QUESTIONS_FILE = Path(__file__).parent / "questions.json"


def _load_questions(topic: str = "") -> list[dict]:
    if not QUESTIONS_FILE.exists():
        raise HTTPException(500, "Lance d'abord : python main.py prebuild")
    questions = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))
    if topic:
        questions = [q for q in questions if topic.lower() in q["source_file"].lower()]
    return questions


@app.get("/api/topics")
def get_topics():
    questions = _load_questions()
    files = sorted(set(q["source_file"] for q in questions))
    return {"topics": files}


def _fmt_question(q: dict) -> dict:
    return {
        "chunk": {
            "id": q["chunk_id"],
            "source_file": q["source_file"],
            "heading_path": q["heading_path"],
            "parent_context": q["parent_context"],
            "content": q["content"],
        },
        "question": q["question"],
        "expected": q["expected"],
    }


@app.get("/api/question")
def get_question(topic: str = ""):
    questions = _load_questions(topic)
    if not questions:
        raise HTTPException(404, "Aucun chunk pour ce sujet")
    return _fmt_question(random.choice(questions))


@app.get("/api/session")
def get_session(topic: str = "", count: int = 10):
    questions = _load_questions(topic)
    if not questions:
        raise HTTPException(404, "Aucun chunk pour ce sujet")
    sample = random.sample(questions, min(count, len(questions)))
    return {"questions": [_fmt_question(q) for q in sample]}


class EvaluateRequest(BaseModel):
    question: str
    expected: str
    user_answer: str
    source_file: str
    heading_path: str


@app.post("/api/evaluate")
def evaluate(req: EvaluateRequest):
    try:
        return llm.evaluate_answer(req.question, req.expected, req.user_answer, req.source_file, req.heading_path)
    except Exception as e:
        print(f"[evaluate] erreur : {e}")
        raise HTTPException(503, "LLM indisponible, réessaie.")


class ChatRequest(BaseModel):
    source_file: str
    heading_path: str
    question: str | None = None
    user_answer: str | None = None
    eval_result: dict | None = None
    history: list[dict]
    message: str


@app.post("/api/chat")
def chat(req: ChatRequest):
    path = VAULT_ROOT / req.source_file
    full_note = path.read_text(encoding="utf-8") if path.exists() else ""
    return {"response": llm.chat(
        full_note, req.heading_path, req.history, req.message,
        question=req.question, user_answer=req.user_answer, eval_result=req.eval_result,
    )}


@app.get("/api/library")
def get_library():
    files = []
    for path in sorted(NOTES_DIR.rglob("*.md")):
        rel = path.relative_to(VAULT_ROOT)
        files.append(str(rel).replace("\\", "/"))
    return {"files": files}


@app.get("/api/asset")
def get_asset(file: str):
    path = (VAULT_ROOT / file).resolve()
    if path.is_relative_to(VAULT_ROOT.resolve()) and path.exists():
        return FileResponse(path)
    name = Path(file).name
    for found in sorted(VAULT_ROOT.rglob(name)):
        if found.is_file():
            return FileResponse(found)
    raise HTTPException(404, "Asset introuvable")


@app.get("/api/note")
def get_note(file: str):
    path = (VAULT_ROOT / file).resolve()
    if not path.is_relative_to(VAULT_ROOT.resolve()):
        raise HTTPException(403, "Accès refusé")
    if not path.exists():
        raise HTTPException(404, "Note introuvable")
    return {"content": path.read_text(encoding="utf-8"), "file": file}


class NoteUpdateRequest(BaseModel):
    file: str
    content: str


@app.put("/api/note")
def update_note(req: NoteUpdateRequest, x_edit_password: str | None = Header(default=None)):
    if EDIT_PASSWORD and x_edit_password != EDIT_PASSWORD:
        raise HTTPException(401, "Mot de passe incorrect")
    path = (VAULT_ROOT / req.file).resolve()
    if not path.is_relative_to(VAULT_ROOT.resolve()):
        raise HTTPException(403, "Accès refusé")
    if not path.exists():
        raise HTTPException(404, "Note introuvable")
    path.write_text(req.content, encoding="utf-8")
    return {"ok": True}


_rebuild_status: dict = {"running": False, "result": None, "error": None}


def _do_rebuild():
    try:
        from prebuild import rebuild
        result = rebuild()
        _rebuild_status.update({"running": False, "result": result, "error": None})
    except Exception as e:
        _rebuild_status.update({"running": False, "result": None, "error": str(e)})


@app.post("/api/rebuild")
def start_rebuild(background_tasks: BackgroundTasks, x_edit_password: str | None = Header(default=None)):
    if EDIT_PASSWORD and x_edit_password != EDIT_PASSWORD:
        raise HTTPException(401, "Mot de passe incorrect")
    if _rebuild_status["running"]:
        raise HTTPException(409, "Reconstruction déjà en cours")
    _rebuild_status.update({"running": True, "result": None, "error": None})
    background_tasks.add_task(_do_rebuild)
    return {"ok": True}


@app.get("/api/rebuild/status")
def get_rebuild_status():
    return _rebuild_status


app.mount("/", StaticFiles(directory="static", html=True), name="static")
