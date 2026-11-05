from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

VAULT_ROOT = Path(os.environ["VAULT_ROOT"])
NOTES_DIR = VAULT_ROOT / os.getenv("NOTES_DIR", "")
SCAN_INTERVAL = int(os.getenv("SCAN_INTERVAL", 10))

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_EVAL_MODEL = os.getenv("GEMINI_EVAL_MODEL", "gemini-2.5-flash")

# Compte partagé cooloss — remplace EDIT_PASSWORD (voir shared_auth.py)
SHARED_SESSION_SECRET = os.getenv("SHARED_SESSION_SECRET", "")
