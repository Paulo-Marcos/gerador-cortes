"""O registro dos trechos com que o bruto foi cortado (D-1024).

O bruto sai de uma lista de trechos do vídeo original (os desvios e o arranjo do
corte naquele instante). O banco guarda só o estado de HOJE; se o operador edita
um desvio depois de renderizar, o `video.mp4` segue com os trechos de antes. Quem
precisa saber onde estão as emendas do vídeo (o boletim técnico) lê aqui as
durações de quando o bruto foi cortado, ao lado do próprio bruto.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.infrastructure.worker_queue import escrever_json_atomico


def arquivo_do_registro(bruto: Path) -> Path:
    return bruto.with_name(f"{bruto.name}.trechos.json")


def gravar(bruto: Path, trechos: list[tuple[float, float]]) -> None:
    """Guarda a duração de cada trecho, na ordem em que entraram no bruto."""
    duracoes = [round(fim - inicio, 3) for inicio, fim in trechos]
    escrever_json_atomico(arquivo_do_registro(bruto), {"duracoes": duracoes})


def ler(bruto: Path) -> list[float] | None:
    """As durações gravadas, ou `None` (bruto de antes do registro, ou registro ilegível)."""
    try:
        dados = json.loads(arquivo_do_registro(bruto).read_text(encoding="utf-8"))
        return [float(d) for d in dados["duracoes"]]
    except (OSError, ValueError, KeyError, TypeError):
        return None
