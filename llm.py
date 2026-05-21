import json
import re
import time
from google import genai
from google.genai import errors as genai_errors
from config import GEMINI_API_KEY, GEMINI_MODEL, GEMINI_EVAL_MODEL

_client = genai.Client(api_key=GEMINI_API_KEY)


def _call(fn, *args, **kwargs):
    delays = [2, 5]
    for i, delay in enumerate(delays):
        try:
            return fn(*args, **kwargs)
        except genai_errors.ServerError:
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
- Les 3 distracteurs doivent être du MÊME TYPE que la bonne réponse (si c'est une date → d'autres dates plausibles ; si c'est un chiffre → d'autres chiffres proches ; si c'est un concept → des concepts voisins), suffisamment plausibles pour tromper quelqu'un qui n'a pas bien révisé, mais clairement faux
Réponds au format JSON uniquement : {{"question": "...", "reponse_attendue": "...", "distracteurs": ["...", "...", "..."]}}"""

    response = _call(
        _client.models.generate_content,
        model=GEMINI_MODEL,
        contents=prompt,
        config={"thinking_config": {"thinking_budget": 0}},
    )
    return _extract_json(response.text)


def generate_distractors(question: str, expected: str, content: str) -> list[str]:
    prompt = f"""Question : {question}
Réponse correcte : {expected}
Contexte : {content}

Génère exactement 3 réponses incorrectes mais plausibles à cette question.
Les distracteurs doivent être du MÊME TYPE que la bonne réponse (si c'est une date → d'autres dates plausibles ; si c'est un chiffre → d'autres chiffres proches ; si c'est un concept → des concepts voisins). Suffisamment plausibles pour tromper quelqu'un qui n'a pas bien révisé, mais clairement faux.
Réponds au format JSON uniquement : {{"distracteurs": ["...", "...", "..."]}}"""

    response = _call(
        _client.models.generate_content,
        model=GEMINI_MODEL,
        contents=prompt,
        config={"thinking_config": {"thinking_budget": 0}},
    )
    return _extract_json(response.text)["distracteurs"]


def evaluate_answer(question: str, expected: str, user_answer: str, source_file: str, heading_path: str) -> dict:
    prompt = f"""Question posée : {question}
Réponse attendue : {expected}
Réponse de l'utilisateur : {user_answer}
Source : {source_file} — {heading_path}

Évalue la réponse de l'utilisateur. Réponds au format JSON uniquement :
{{
  "statut": "Réussi" si la réponse est correcte et complète, "Incomplet" si elle contient une partie de l'idée mais manque des éléments importants, "Échoué" si elle est incorrecte ou hors sujet,
  "explication": "une phrase max sur ce qui manque ou confirme si correct",
  "reponse_ideale": "réponse complète et bien formulée en 2-4 phrases"
}}
INTERDICTION ABSOLUE : ne commence jamais reponse_ideale ni explication par "Selon le texte", "D'après le texte", "Le texte indique", "Le texte précise", "D'après le document" ou toute formulation similaire qui fait référence à une source. Formule la réponse directement, comme un fait établi.
Règle importante pour les chiffres : si la réponse attendue contient un nombre quantitatif (statistique, pourcentage, quantité, superficie, population…) et que l'utilisateur donne un nombre dans un écart de ±10%, considère la réponse comme correcte sur ce point (ex: attendu 56, répondu 55 → correct). Cette tolérance ne s'applique PAS aux dates et années : une date doit être exacte."""

    response = _call(
        _client.models.generate_content,
        model=GEMINI_EVAL_MODEL,
        contents=prompt,
        config={"thinking_config": {"thinking_budget": 0}},
    )
    return _extract_json(response.text)


def chat(full_note: str, heading_path: str, history: list[dict], user_message: str,
         question: str | None = None, user_answer: str | None = None, eval_result: dict | None = None) -> str:

    quiz_context = ""
    if question:
        quiz_context += f"\nQuestion posée à l'utilisateur : {question}"
    if user_answer:
        quiz_context += f"\nRéponse donnée par l'utilisateur : {user_answer}"
    if eval_result:
        quiz_context += f"\nÉvaluation : {eval_result.get('statut', '')} — {eval_result.get('explication', '')}"
        if eval_result.get('reponse_ideale'):
            quiz_context += f"\nRéponse idéale : {eval_result['reponse_ideale']}"

    system = f"""Tu es un tuteur privé expert. Tu as accès à la note suivante que l'utilisateur révise :

{full_note}

L'utilisateur révise la section : {heading_path}.{quiz_context}

Règles :
- Si la réponse se trouve dans la note, appuie-toi dessus en priorité.
- Si la question dépasse le contenu de la note, réponds avec tes connaissances générales en le signalant brièvement (ex: "Ce n'est pas dans la note, mais...").
- Ne refuse jamais de répondre sous prétexte que l'information n'est pas dans le texte : enrichis la révision."""

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
