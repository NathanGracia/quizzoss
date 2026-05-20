from dataclasses import dataclass


@dataclass
class Chunk:
    id: str           # hash SHA256 du contenu
    source_file: str  # chemin relatif depuis le vault: Dossier/Note.md
    heading_path: str # ex: "Titre Principal > Sous-Titre"
    parent_context: str  # intro de la note (texte avant le premier ##)
    content: str      # texte de la section courante
