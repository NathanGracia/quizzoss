import re
import hashlib
from pathlib import Path
from models import Chunk


_FRONTMATTER_RE = re.compile(r"^---\s*\n.*?\n---\s*\n", re.DOTALL)
_WIKILINK_RE    = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")
_HEADING_RE     = re.compile(r"^(#{1,6})\s+(.+)", re.MULTILINE)
_IMAGE_RE       = re.compile(r"!\[?[^\]]*\]?\([^\)]*\)|!\[\[[^\]]+\]\]|!\S+|!\#\^\S+")
_EMBED_REF_RE   = re.compile(r"^\s*\^\w+\s*$", re.MULTILINE)  # lignes de type ^anchor-id

MIN_CONTENT_LEN = 80  # caractères de texte réel minimum pour qu'un chunk soit utile


def _strip_frontmatter(text: str) -> str:
    return _FRONTMATTER_RE.sub("", text, count=1).lstrip()


def _clean_wikilinks(text: str) -> str:
    return _WIKILINK_RE.sub(r"\1", text)


def _make_id(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def parse_file(md_path: Path, vault_root: Path) -> list[Chunk]:
    raw = md_path.read_text(encoding="utf-8")
    body = _clean_wikilinks(_strip_frontmatter(raw))
    source = md_path.relative_to(vault_root).as_posix()

    # Découper le document aux titres (## et plus profond, on ignore # = titre du fichier)
    matches = list(_HEADING_RE.finditer(body))

    # Texte avant le premier titre = contexte parent pour toute la note
    parent_context = body[: matches[0].start()].strip() if matches else body.strip()

    # Construire une pile pour le chemin de titres (heading_path)
    heading_stack: list[tuple[int, str]] = []  # (level, text)
    chunks: list[Chunk] = []

    for i, match in enumerate(matches):
        level = len(match.group(1))
        title = match.group(2).strip()

        # Mettre à jour la pile
        heading_stack = [(l, t) for l, t in heading_stack if l < level]
        heading_stack.append((level, title))

        heading_path = " > ".join(t for _, t in heading_stack)

        # Contenu de la section = jusqu'au prochain titre de même niveau ou supérieur
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        content = body[start:end].strip()

        if not content:
            continue

        # Retire les références d'images et les ancres Obsidian pour évaluer la richesse réelle
        content_clean = _EMBED_REF_RE.sub("", _IMAGE_RE.sub("", content)).strip()
        if len(content_clean) < MIN_CONTENT_LEN:
            continue

        chunks.append(Chunk(
            id=_make_id(content),
            source_file=source,
            heading_path=heading_path,
            parent_context=parent_context,
            content=content,
        ))

    return chunks
