"""`.agents/skills` é cópia exata de `.claude/skills` (D-681).

Cada pasta serve a um agente (Antigravity e Claude Code). Editar só uma deixa os
dois agentes trabalhando com regras diferentes, sem aviso. O espelho é
`bin/espelhar_skills.py`.
"""

import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "bin" / "espelhar_skills.py"
_spec = importlib.util.spec_from_file_location("espelhar_skills", _SCRIPT)
espelho = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(espelho)


def test_copia_das_skills_e_igual_a_fonte():
    problemas = espelho.diferencas()
    assert not problemas, "rode `python bin/espelhar_skills.py`:\n" + "\n".join(problemas)


def test_diferencas_aponta_o_que_falta_sobra_e_difere(tmp_path):
    fonte, copia = tmp_path / "fonte", tmp_path / "copia"
    (fonte / "a").mkdir(parents=True)
    (copia / "a").mkdir(parents=True)
    (fonte / "a" / "SKILL.md").write_bytes(b"linha\n")
    (copia / "a" / "SKILL.md").write_bytes(b"linha\r\n")  # CRLF não conta como diferença
    (fonte / "nova.md").write_text("x")
    (copia / "velha.md").write_text("y")

    assert espelho.diferencas(fonte, copia) == [
        "falta na copia: nova.md",
        "sobra na copia: velha.md",
    ]

    espelho.espelhar(fonte, copia)
    assert espelho.diferencas(fonte, copia) == []
