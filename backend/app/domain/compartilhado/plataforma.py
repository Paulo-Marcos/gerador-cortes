"""As plataformas onde um vídeo é publicado (D-467, D-759).

Mora no compartilhado porque dois agregados a usam: a Publicação, que sabe o que
cada plataforma aceita, e o Short, que lista os prontos por plataforma. Um
agregado não importa outro (ADR-0015 §2); o valor que os dois precisam fica aqui.
"""

from enum import StrEnum


class Plataforma(StrEnum):
    YOUTUBE_SHORTS = "youtube_shorts"
    INSTAGRAM_REELS = "instagram_reels"
    TIKTOK = "tiktok"
    TIKTOK_HORIZONTAL = "tiktok_horizontal"
