"""O erro do worker diz o MOTIVO, e a concorrência deixa de ser número mágico (D-641).

A resposta de falha levava só "Exit code: 1". O motivo real — a linha do ffmpeg
ou do Remotion dizendo o que quebrou — ficava no console do worker: quem via o
erro na tela não via a causa, e quem via a causa era quem estivesse com o
terminal aberto naquele instante.

Medido com o worker real (18/09/2026):
  antes  -> "Job falhou: Exit code: 1"
  depois -> "Exit code: 1\\nError: Could not find font ..."
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
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node não está no PATH")

CAUSA = 'Error: Could not find font "Inter" in the bundle'
JOB_QUE_FALHA = (
    "import sys\n"
    "print('render iniciado', file=sys.stderr)\n"
    f"print({CAUSA!r}, file=sys.stderr)\n"
    "sys.exit(1)\n"
)


def _rodar_job(projetos: Path, cmd: list[str], *, espera: float = 8.0) -> dict:
    """Enfileira um job direto na pasta e devolve o `res_` que o worker escreveu."""
    fila = projetos / "fila_remotion"
    fila.mkdir(parents=True, exist_ok=True)
    (projetos / "app_settings.json").write_text(json.dumps({"log_level": "info"}), encoding="utf-8")
    worker = subprocess.Popen(
        ["node", str(WORKER)],
        cwd=str(RENDERER),
        env={**os.environ, "PROJETOS_DIR": str(projetos)},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    try:
        time.sleep(2)
        (fila / "req_teste.json").write_text(
            json.dumps({"id": "teste", "cwd": str(RENDERER), "cmd": cmd}), encoding="utf-8"
        )
        limite = time.time() + espera
        resposta = fila / "res_teste.json"
        while time.time() < limite:
            if resposta.exists():
                return json.loads(resposta.read_text(encoding="utf-8"))
            time.sleep(0.2)
        raise AssertionError("o worker não respondeu no prazo")
    finally:
        worker.terminate()
        try:
            worker.wait(timeout=15)
        except subprocess.TimeoutExpired:
            worker.kill()


def test_a_resposta_de_erro_carrega_a_causa(tmp_path):
    resposta = _rodar_job(tmp_path, [sys.executable, "-c", JOB_QUE_FALHA])

    assert resposta["status"] == "erro"
    assert "Exit code: 1" in resposta["erro"], "o código continua útil"
    assert CAUSA in resposta["erro"], "a causa real precisa viajar junto"


def test_falha_sem_saida_nenhuma_diz_isso_em_vez_de_mentir(tmp_path):
    """Sem stderr, o texto avisa que não houve saída — melhor que um vazio mudo."""
    resposta = _rodar_job(tmp_path, [sys.executable, "-c", "import sys; sys.exit(3)"])

    assert resposta["status"] == "erro"
    assert "sem saída de erro do processo" in resposta["erro"]


def test_sucesso_continua_sem_ruido(tmp_path):
    resposta = _rodar_job(tmp_path, [sys.executable, "-c", "print('ok')"])

    assert resposta["status"] == "sucesso"
    assert "erro" not in resposta


class TestConcorrenciaDoRemotion:
    """O `12` era mágico e o env inválido virava NaN — que o Remotion aceita calado."""

    def _rodar_no_node(self, trecho: str, env: dict | None = None) -> str:
        fonte = WORKER.read_text(encoding="utf-8")
        inicio = fonte.index("function inteiroDoAmbiente")
        fim = fonte.index("function isOverlayJob")
        script = f"{fonte[inicio:fim]}\n{trecho}"
        return subprocess.run(
            ["node", "-e", script],
            capture_output=True,
            text=True,
            check=True,
            timeout=60,
            env={**os.environ, **(env or {})},
        ).stdout.strip()

    def test_sem_env_usa_o_valor_que_a_maquina_ja_praticava(self):
        assert self._rodar_no_node('console.log(inteiroDoAmbiente("X_TESTE", 12, 1));') == "12"

    def test_env_valido_manda(self):
        saida = self._rodar_no_node(
            'console.log(inteiroDoAmbiente("X_TESTE", 12, 1));', {"X_TESTE": "4"}
        )

        assert saida == "4"

    @pytest.mark.parametrize("lixo", ["abc", "0", "-3", "3.9.9"])
    def test_env_invalido_cai_no_padrao_com_aviso(self, lixo):
        saida = self._rodar_no_node(
            'console.log(inteiroDoAmbiente("X_TESTE", 12, 1));', {"X_TESTE": lixo}
        )

        assert saida.splitlines()[-1] == "12", f"{lixo!r} deveria cair no padrão"
