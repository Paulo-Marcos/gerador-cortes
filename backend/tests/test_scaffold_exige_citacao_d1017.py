"""D-1017 (RN-35): a skill de canal novo pede a citação que o app confere.

O corpo da skill é por canal, no banco: este template só semeia canal novo.
"""

from __future__ import annotations

from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def test_a_skill_de_canal_novo_tem_os_campos_no_formato_de_saida():
    texto = (RAIZ / "examples" / "instance.example" / "editorial" / "trechos.md").read_text(
        encoding="utf-8"
    )
    assert '"inicio_texto":' in texto
    assert '"fim_texto":' in texto
