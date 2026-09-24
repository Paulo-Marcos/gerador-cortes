"""O worker começa limpo, sai limpo e avisa quando o canal muda (D-640).

Três buracos que só aparecem depois de um tropeço:

1. `ack_` órfão. O relógio do backend só começa a correr quando o `ack_`
   aparece; um `ack_` deixado por um worker que morreu no meio faz o próximo
   job herdar um cronômetro que já andou.
2. Processos filhos ao encerrar. Sem tratar o encerramento, ffmpeg e Chromium
   ficam comendo CPU depois que o app fecha.
3. Troca de canal. O `filaDir` nasce do canal ativo lido no boot. Trocar de
   canal com o app no ar deixa este worker olhando a fila do canal anterior —
   e os jobs novos ficam parados, sem uma linha explicando.

Honestidade sobre o alcance da correção (medido em 18/09/2026): no Windows, o
app encerra o worker com `Stop-Process -Force`, que NÃO entrega sinal — nenhum
handler roda nesse caminho. Quem cobre os órfãos ali é o próprio launcher, que
mata a árvore inteira, e a limpeza de `ack_` no boot. O handler vale para Ctrl+C
no terminal e para Linux/macOS.
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


def _fonte() -> str:
    return WORKER.read_text(encoding="utf-8")


def _subir_worker(projetos: Path, saida: Path) -> subprocess.Popen:
    (projetos / "fila_remotion").mkdir(parents=True, exist_ok=True)
    (projetos / "app_settings.json").write_text(json.dumps({"log_level": "info"}), encoding="utf-8")
    return subprocess.Popen(
        ["node", str(WORKER)],
        cwd=str(RENDERER),
        env={**os.environ, "PROJETOS_DIR": str(projetos)},
        stdout=saida.open("wb"),
        stderr=subprocess.STDOUT,
    )


def _encerrar(worker: subprocess.Popen) -> None:
    worker.terminate()
    try:
        worker.wait(timeout=15)
    except subprocess.TimeoutExpired:
        worker.kill()


def test_ack_orfao_some_no_boot(tmp_path):
    """O resto de um worker que morreu no meio não pode enganar o próximo."""
    fila = tmp_path / "fila_remotion"
    fila.mkdir(parents=True)
    (fila / "ack_job-morto.json").write_text(
        json.dumps({"id": "job-morto", "started_at": 1}), encoding="utf-8"
    )

    worker = _subir_worker(tmp_path, tmp_path / "saida.txt")
    try:
        time.sleep(3)
        assert list(fila.glob("ack_*.json")) == [], "o ack_ órfão sobreviveu ao boot"
    finally:
        _encerrar(worker)


def test_troca_de_canal_vira_aviso_no_log(tmp_path):
    """Sem isto, a fila fica muda: os jobs do canal novo simplesmente não andam."""
    (tmp_path / "instance").mkdir()
    ponteiro = tmp_path / "instance" / "active-channel"
    ponteiro.write_text("canal-a", encoding="utf-8")
    renderer_falso = tmp_path / "video-renderer"
    renderer_falso.mkdir()
    for arquivo in RENDERER.glob("*.js"):
        shutil.copy2(arquivo, renderer_falso / arquivo.name)

    projetos = tmp_path / "projetos"
    (projetos / "fila_remotion").mkdir(parents=True)
    (projetos / "app_settings.json").write_text(json.dumps({"log_level": "info"}), encoding="utf-8")
    saida = tmp_path / "saida.txt"
    worker = subprocess.Popen(
        ["node", str(renderer_falso / "native_worker.js")],
        cwd=str(renderer_falso),
        env={**os.environ, "PROJETOS_DIR": str(projetos)},
        stdout=saida.open("wb"),
        stderr=subprocess.STDOUT,
    )
    try:
        time.sleep(3)
        ponteiro.write_text("canal-b", encoding="utf-8")
        time.sleep(8)
    finally:
        _encerrar(worker)

    texto = saida.read_text(encoding="utf-8", errors="replace")
    avisos = [linha for linha in texto.splitlines() if "Canal ativo mudou" in linha]

    assert len(avisos) == 1, f"esperava um aviso, houve {len(avisos)}"
    assert "feche e abra o app" in avisos[0]


def test_o_encerramento_mata_filhos_por_pid_e_limpa_o_ack():
    """Guarda do CÓDIGO: o encerramento não pode matar por nome de imagem.

    Matar `ffmpeg.exe` por nome derrubaria o render de PROD junto — é regra da
    casa. O `matarFilhos` já mata por PID; o encerramento reusa ele.
    """
    fonte = _fonte()
    corpo = fonte[fonte.index("function encerrarComCalma") :][:500]

    assert "matarFilhos(id)" in corpo
    assert "removerSeExistir(ackPath(id))" in corpo
    assert "/IM" not in corpo, "matar por nome de imagem é proibido"


def test_o_encerramento_esta_ligado_aos_sinais_e_a_saida():
    fonte = _fonte()

    for sinal in ("SIGINT", "SIGTERM"):
        assert sinal in fonte, f"{sinal} sem tratamento"
    assert 'process.on("exit"' in fonte
