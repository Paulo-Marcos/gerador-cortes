"""O que a lista de canais acrescenta à identidade de cada canal: a luz e as lives (D-1141).

Junta as duas leituras de disco do canal numa chamada só, para o router levá-las numa
única ida a uma thread (SQLite e imagens são síncronos).
"""

from __future__ import annotations

from app.services.canal.lives_do_canal import lives_do_canal
from app.services.canal.luz_do_canal import luz_do_canal


def ficha_do_canal(canal_id: str) -> dict[str, object]:
    """`luz` (amostra das capas) e `lives` (linhas de `projetos`) do canal."""
    return {"luz": luz_do_canal(canal_id), "lives": lives_do_canal(canal_id)}
