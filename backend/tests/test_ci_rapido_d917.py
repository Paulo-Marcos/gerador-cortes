"""O CI roda o que é lento em paralelo e com cache (D-917).

Medido em 13/10/2026 (run da main 2754adeb): 9 min 20 s, com o job do Windows
no caminho crítico (pytest serial 5,5 min + bootstrap baixando tudo 3 min) e o
renderer logo atrás (test:cards 5 min, um `remotion still` por cenário, cada
um reempacotando e abrindo um Chrome). Estes testes seguram as três alavancas
para que uma edição do workflow ou do script não as desfaça sem ninguém ver.
"""

from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parents[2]
CI = RAIZ / ".github" / "workflows" / "ci.yml"
CARDS = RAIZ / "scripts" / "test-remotion-card-contracts.mjs"


def _passos(job: str) -> list[dict]:
    return yaml.safe_load(CI.read_text(encoding="utf-8"))["jobs"][job]["steps"]


def _passo(job: str, nome: str) -> dict:
    return next(p for p in _passos(job) if p.get("name") == nome)


def test_pytest_do_backend_e_do_windows_roda_em_paralelo():
    assert "-n auto" in _passo("backend", "Run pytest")["run"]
    assert "-n auto" in _passo("windows", "Run pytest")["run"]


def test_job_do_windows_guarda_os_downloads_de_pip_e_npm():
    assert _passo("windows", "Setup Python")["with"]["cache"] == "pip"
    assert _passo("windows", "Setup Node")["with"]["cache"] == "npm"


def test_cards_empacota_uma_vez_e_divide_o_navegador():
    script = CARDS.read_text(encoding="utf-8")

    assert '"remotion", "still"' not in script, (
        "um `remotion still` por cenário reempacota a cada still"
    )
    assert script.count("bundleOnce();") == 1
    assert script.count('openBrowser("chrome")') == 1
