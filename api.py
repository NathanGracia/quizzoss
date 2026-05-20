import json
import random
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import llm
from config import VAULT_ROOT

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
    return llm.evaluate_answer(req.question, req.expected, req.user_answer, req.source_file, req.heading_path)


class ChatRequest(BaseModel):
    source_file: str
    heading_path: str
    history: list[dict]
    message: str


@app.post("/api/chat")
def chat(req: ChatRequest):
    path = VAULT_ROOT / req.source_file
    full_note = path.read_text(encoding="utf-8") if path.exists() else ""
    return {"response": llm.chat(full_note, req.heading_path, req.history, req.message)}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
