"""O que a lista de canais acrescenta à identidade de cada canal: a luz e as lives (D-1141).

Junta as duas leituras de disco do canal numa chamada só, para o router levá-las numa
única ida a uma thread (SQLite e imagens são síncronos).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.services.canal.lives_do_canal import lives_do_canal
from app.services.canal.luz_do_canal import luz_do_canal


@dataclass(frozen=True)
class FichaDoCanal:
    """`luz` (amostra das capas) e `lives` (linhas de `projetos`) do canal."""

    luz: list[str] = field(default_factory=list)
    lives: int = 0


FICHA_VAZIA = FichaDoCanal()


def ficha_do_canal(canal_id: str) -> FichaDoCanal:
    return FichaDoCanal(luz=luz_do_canal(canal_id), lives=lives_do_canal(canal_id))
