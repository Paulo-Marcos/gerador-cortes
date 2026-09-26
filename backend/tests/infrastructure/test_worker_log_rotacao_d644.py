"""O `worker_debug.log` tem teto e vira `.1` ao passar dele (D-644).

Ele crescia para sempre por `appendFileSync`: o da raiz do renderer passou de
2 MB. O cuidado é o outro lado: a tela do short lê esse arquivo inteiro para
mostrar as durações (D-568), então rotacionar não pode apagar nada abaixo do
teto — e o teto padrão fica ordens de grandeza acima do log de um short.

Os testes rodam o `native_worker.js` real, com o teto baixado por env.
"""

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

RENDERER = Path(__file__).resolve().parents[3] / "video-renderer"
WORKER = RENDERER / "native_worker.js"
pytestmark = [
    pytest.mark.skipif(shutil.which("node") is None, reason="node não está no PATH"),
    pytest.mark.integration,  # sobe o worker Node de verdade (D-751)
]

TETO = 2000


def _rodar_job(projetos: Path, pasta_do_job: Path) -> None:
    fila = projetos / "fila_remotion"
    fila.mkdir(parents=True, exist_ok=True)
    worker = subprocess.Popen(
        ["node", str(WORKER)],
        cwd=str(RENDERER),
        env={
            **os.environ,
            "PROJETOS_DIR": str(projetos),
            "WORKER_LOG_LEVEL": "info",
            "WORKER_LOG_MAX_BYTES": str(TETO),
        },
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    try:
        time.sleep(2)
        pedido = {"id": "teste", "cwd": str(pasta_do_job), "cmd": [sys.executable, "-c", "0"]}
        (fila / "req_teste.json").write_text(json.dumps(pedido), encoding="utf-8")
        resposta = fila / "res_teste.json"
        limite = time.time() + 8
        while time.time() < limite and not resposta.exists():
            time.sleep(0.2)
        assert resposta.exists(), "o worker não respondeu no prazo"
    finally:
        worker.terminate()
        try:
            worker.wait(timeout=15)
        except subprocess.TimeoutExpired:
            worker.kill()


def test_log_acima_do_teto_vira_ponto_um_e_recomeca(tmp_path):
    pasta = tmp_path / "corte"
    pasta.mkdir()
    antigo = "linha antiga\n" * 300  # ~3,9 KB, acima do teto de 2 KB
    (pasta / "worker_debug.log").write_text(antigo, encoding="utf-8")

    _rodar_job(tmp_path / "projetos", pasta)

    guardado = (pasta / "worker_debug.log.1").read_text(encoding="utf-8")
    atual = (pasta / "worker_debug.log").read_text(encoding="utf-8")
    assert guardado.startswith(antigo), "o histórico foi para o .1 sem perder nada"
    assert "linha antiga" not in atual, "o log novo recomeça do zero"
    assert "Job: teste" in atual
    assert "Fim: teste status=sucesso" in atual


def test_log_abaixo_do_teto_so_acrescenta(tmp_path):
    """O caso do short: log pequeno, que a tela lê inteiro, nunca é rotacionado."""
    pasta = tmp_path / "short"
    pasta.mkdir()
    (pasta / "worker_debug.log").write_text(
        "[t] Fim: passo_1 status=sucesso duration_ms=1500\n", encoding="utf-8"
    )

    _rodar_job(tmp_path / "projetos", pasta)

    assert not (pasta / "worker_debug.log.1").exists()
    atual = (pasta / "worker_debug.log").read_text(encoding="utf-8")
    assert "Fim: passo_1 status=sucesso duration_ms=1500" in atual, "a duração antiga ficou"
    assert "Fim: teste status=sucesso" in atual
