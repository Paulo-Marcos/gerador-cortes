import re

FIRE_EMOJI = "🔥"
BOOK_EMOJI = "📖"

_READING_PREFIX_RE = re.compile(
    r"^\s*Leitura\s*(?:\|\s*[^-]+-\s*|-\s*.+?\s*-\s*PT\.\d+\s*\|\s*)",
    re.IGNORECASE,
)
_LEADING_THUMB_EMOJIS_RE = re.compile(
    rf"^\s*(?:{re.escape(FIRE_EMOJI)}|{re.escape(BOOK_EMOJI)})\s*"
)


def leitura_title_prefix(autor: str, parte: int | None) -> str:
    autor_normalizado = (autor or "").strip()
    parte_normalizada = max(1, int(parte or 1))
    if not autor_normalizado:
        return ""
    return f"Leitura - {autor_normalizado} - PT.{parte_normalizada} | "


def aplicar_prefixo_leitura_titulo(titulo: str, autor: str, parte: int | None) -> str:
    prefixo = leitura_title_prefix(autor, parte)
    titulo_limpo = remover_prefixo_leitura_titulo(titulo)
    return f"{prefixo}{titulo_limpo}" if prefixo else titulo_limpo


def remover_prefixo_leitura_titulo(titulo: str) -> str:
    return _READING_PREFIX_RE.sub("", titulo or "", count=1).strip()


def aplicar_emojis_texto_capa(texto: str, is_fire: bool, is_leitura: bool) -> str:
    texto_limpo = remover_emojis_texto_capa(texto)
    emojis = []
    if is_fire:
        emojis.append(FIRE_EMOJI)
    if is_leitura:
        emojis.append(BOOK_EMOJI)
    return f"{' '.join(emojis)} {texto_limpo}".strip() if emojis else texto_limpo


def remover_emojis_texto_capa(texto: str) -> str:
    texto_limpo = texto or ""
    while True:
        novo_texto = _LEADING_THUMB_EMOJIS_RE.sub("", texto_limpo, count=1)
        if novo_texto == texto_limpo:
            return texto_limpo.strip()
        texto_limpo = novo_texto
