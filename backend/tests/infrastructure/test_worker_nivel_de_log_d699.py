"""D-699: o nível de log da partida do worker vem de quem o sobe, não de um arquivo.

Antes o worker lia o `app_settings.json`, espelho que o backend deixou de escrever
quando o `settings.db` virou a fonte única. Continuar lendo o arquivo daria um
nível velho; agora o `dev.ps1` lê o banco e entrega `WORKER_LOG_LEVEL`. Cada job
segue trazendo o seu (`worker_queue.submit_and_wait`).
"""

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

RENDERER = Path(__file__).resolve().parents[3] / "video-renderer"
WORKER = RENDERER / "native_worker.js"
pytestmark = [
    pytest.mark.skipif(shutil.which("node") is None, reason="node não está no PATH"),
    pytest.mark.integration,  # sobe o worker Node de verdade (D-751)
]

PARTIDA = "Native Worker Iniciado"


def _saida_da_partida(projetos: Path, env_extra: dict[str, str]) -> str:
    (projetos / "fila_remotion").mkdir(parents=True, exist_ok=True)
    env = {k: v for k, v in os.environ.items() if k != "WORKER_LOG_LEVEL"}
    saida = projetos / "saida.txt"
    worker = subprocess.Popen(
        ["node", str(WORKER)],
        cwd=str(RENDERER),
        env={**env, "PROJETOS_DIR": str(projetos), **env_extra},
        stdout=saida.open("wb"),
        stderr=subprocess.STDOUT,
    )
    try:
        time.sleep(3)
    finally:
        worker.terminate()
        try:
            worker.wait(timeout=15)
        except subprocess.TimeoutExpired:
            worker.kill()
    return saida.read_text(encoding="utf-8", errors="replace")


def test_o_nivel_da_partida_vem_do_ambiente(tmp_path):
    assert PARTIDA in _saida_da_partida(tmp_path, {"WORKER_LOG_LEVEL": "info"})


def test_o_app_settings_json_nao_liga_mais_o_log(tmp_path):
    """O arquivo antigo, largado na pasta, não pode mais decidir nada."""
    (tmp_path / "app_settings.json").write_text(json.dumps({"log_level": "info"}), encoding="utf-8")

    assert PARTIDA not in _saida_da_partida(tmp_path, {})
