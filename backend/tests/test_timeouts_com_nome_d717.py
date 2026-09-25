"""Nenhum timeout escrito como número solto no app (D-717).

`timeout=1800` não diz se são 30 minutos de propósito nem de onde saíram; um
nome (`_TIMEOUT_DO_OVERLAY_S`) diz a unidade e o papel, e o comentário ao lado
diz o porquê. Os 27 literais que havia viraram constantes — este teste impede
que voltem. Vale também para o `busy_timeout` do SQLite.

Exemplos de doctest (`>>>`) ficam de fora: são texto para quem lê.
"""

import re
from pathlib import Path

_APP = Path(__file__).resolve().parents[1] / "app"
_TIMEOUT_LITERAL = re.compile(r"timeout\s*=\s*\d")


def test_nenhum_timeout_e_um_numero_solto():
    achados = [
        f"{arquivo.relative_to(_APP.parent)}:{numero}: {linha.strip()}"
        for arquivo in sorted(_APP.rglob("*.py"))
        for numero, linha in enumerate(arquivo.read_text(encoding="utf-8").splitlines(), 1)
        if _TIMEOUT_LITERAL.search(linha) and not linha.lstrip().startswith(">>>")
    ]

    assert achados == [], "timeout sem nome — use uma constante:\n" + "\n".join(achados)
