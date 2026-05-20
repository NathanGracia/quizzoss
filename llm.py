import json
import re
import time
from google import genai
from google.genai import errors as genai_errors
from config import GEMINI_API_KEY, GEMINI_MODEL

_client = genai.Client(api_key=GEMINI_API_KEY)


def _call(fn, *args, **kwargs):
    """Appel Gemini avec retry exponentiel sur 503."""
    delays = [2, 5, 10]
    for i, delay in enumerate(delays):
        try:
            return fn(*args, **kwargs)
        except genai_errors.ServerError as e:
            if i == len(delays) - 1:
                raise
            print(f"[llm] 503 — retry dans {delay}s...")
            time.sleep(delay)


def _extract_json(text: str) -> dict:
    clean = re.sub(r"```(?:json)?\s*|\s*```", "", text).strip()
    return json.loads(clean)


def generate_question(source_file: str, heading_path: str, content: str) -> dict:
    prompt = f"""[Fichier : {source_file}]
[Section : {heading_path}]
[Texte : {content}]

Génère une question de quiz basée EXCLUSIVEMENT sur le texte ci-dessus.
Règles :
- Porte sur un concept, mécanisme ou fait central du texte — pas sur un exemple illustratif, un nom de fichier, une image ou une anecdote secondaire
- Si le texte parle d'un événement historique, inclus la date ou la période dans la question (ex: "En 1948, que s'est-il passé avec...")
- Si le texte mentionne des chiffres ou des noms propres importants, ancre la question dessus
- La question doit être précise et contextualisée, pas vague
- La réponse attendue doit être courte (1-2 phrases max)
Réponds au format JSON uniquement : {{"question": "...", "reponse_attendue": "..."}}"""

    response = _call(
        _client.models.generate_content, model=GEMINI_MODEL, contents=prompt
    )
    return _extract_json(response.text)


def evaluate_answer(question: str, expected: str, user_answer: str, source_file: str, heading_path: str) -> dict:
    prompt = f"""Question posée : {question}
Réponse attendue : {expected}
Réponse de l'utilisateur : {user_answer}
Source : {source_file} — {heading_path}

Évalue la réponse de l'utilisateur. Réponds au format JSON uniquement :
{{"statut": "Réussi" ou "Échoué", "explication": "courte explication de l'écart si nécessaire, sinon encouragement"}}"""

    response = _call(
        _client.models.generate_content, model=GEMINI_MODEL, contents=prompt
    )
    return _extract_json(response.text)


def chat(full_note: str, heading_path: str, history: list[dict], user_message: str) -> str:
    system = f"""Tu es un tuteur privé. Tu connais parfaitement la note suivante :

{full_note}

L'utilisateur a bloqué sur la section : {heading_path}.
Réponds à ses questions en t'appuyant sur la note. Cite toujours la section source."""

    contents = []
    for msg in history:
        contents.append({"role": msg["role"], "parts": [{"text": msg["text"]}]})
    contents.append({"role": "user", "parts": [{"text": user_message}]})

    response = _call(
        _client.models.generate_content,
        model=GEMINI_MODEL,
        contents=contents,
        config={"system_instruction": system},
    )
    return response.text
