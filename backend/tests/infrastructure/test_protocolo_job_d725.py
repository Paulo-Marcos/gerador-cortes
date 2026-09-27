"""D-725: o pedido `req_` tem contrato e versão, conferidos dos dois lados.

O protocolo da fila vivia só em docstring: o worker desestruturava
`{id, cmd, cwd}` sem conferir nada, e um pedido torto só estourava lá dentro
do spawn. Agora ele está em video-renderer/protocol/job.schema.json; o backend
monta o pedido que o schema descreve, e o worker (protocolo_job.js) recusa, com
um erro dito, o pedido que não tem como rodar.

Os dois lados não são idênticos de propósito: o schema diz o que o backend DEVE
mandar; o worker aceita um pouco mais — pedido sem `v`, gravado antes de a
versão existir, e nível de log ou categoria que ele normaliza. O teste confere
a direção que importa: o que o schema aceita, o worker aceita; o que não tem
como rodar, os dois recusam.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest
from app.infrastructure.worker_queue import (
    VERSAO_DO_PROTOCOLO_DO_JOB,
    WorkerJob,
    WorkerJobCategory,
    montar_pedido,
)
from app.services.app_settings import LogLevel

from tests.json_schema_minimo import violacoes

_RAIZ = Path(__file__).resolve().parents[3]
_CONTRATO = json.loads(
    (_RAIZ / "video-renderer" / "protocol" / "job.schema.json").read_text(encoding="utf-8")
)
_PEDIDO = _CONTRATO["$defs"]["pedido"]
_RESPOSTA = _CONTRATO["$defs"]["resposta"]
_WORKER = _RAIZ / "video-renderer" / "native_worker.js"
_PROTOCOLO_JS = _RAIZ / "video-renderer" / "protocolo_job.js"


def _job(categoria: WorkerJobCategory = WorkerJobCategory.OVERLAY) -> WorkerJob:
    return WorkerJob(
        id="overlay_chunk_3",
        cmd=["npx", "remotion", "render", "OverlayTimelineV2"],
        cwd=".",
        category=categoria,
        timeout_sec=60,
    )


@pytest.mark.parametrize("categoria", list(WorkerJobCategory))
@pytest.mark.parametrize("nivel", list(LogLevel))
def test_o_pedido_que_o_backend_monta_cabe_no_contrato(categoria, nivel):
    pedido = montar_pedido(_job(categoria), "overlay_chunk_3_ab12", log_level=str(nivel))

    assert violacoes(pedido, _PEDIDO, "pedido") == []


def test_a_versao_do_backend_e_a_do_contrato():
    assert _PEDIDO["properties"]["v"]["const"] == VERSAO_DO_PROTOCOLO_DO_JOB


def test_todo_status_que_o_worker_escreve_esta_no_contrato():
    escritos = set(re.findall(r'status: "(\w+)"', _WORKER.read_text(encoding="utf-8")))

    assert escritos
    assert escritos <= set(_RESPOSTA["properties"]["status"]["enum"])


def _veredito_do_worker(pedidos: list) -> list:
    """Roda o `problemaDoPedido` REAL no node para cada pedido."""
    script = (
        f"const {{ problemaDoPedido }} = require({json.dumps(str(_PROTOCOLO_JS))});\n"
        f"const pedidos = {json.dumps(pedidos)};\n"
        "console.log(JSON.stringify(pedidos.map(problemaDoPedido)));\n"
    )
    saida = subprocess.run(
        ["node", "-e", script], capture_output=True, text=True, check=True, timeout=60
    )
    return json.loads(saida.stdout)


_VALIDO = {
    "v": 1,
    "id": "grade_ab12",
    "logical_id": "grade",
    "cwd": "C:/fila",
    "cmd": ["ffmpeg", "-i", "entrada.mp4"],
    "log_level": "disabled",
    "category": "grade",
}

# O que não tem como rodar: o schema recusa e o worker também.
_SEM_COMO_RODAR = {
    "versão que o worker não conhece": {**_VALIDO, "v": 2},
    "sem id": {k: v for k, v in _VALIDO.items() if k != "id"},
    "id vazio": {**_VALIDO, "id": ""},
    "sem cwd": {k: v for k, v in _VALIDO.items() if k != "cwd"},
    "sem cmd": {k: v for k, v in _VALIDO.items() if k != "cmd"},
    "cmd vazio": {**_VALIDO, "cmd": []},
    "cmd com número": {**_VALIDO, "cmd": ["ffmpeg", 3]},
    "cmd como texto": {**_VALIDO, "cmd": "ffmpeg -i entrada.mp4"},
}


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("node") is None, reason="node não está no PATH")
def test_os_dois_lados_recusam_o_que_nao_tem_como_rodar():
    nomes = list(_SEM_COMO_RODAR)
    pedidos = [_SEM_COMO_RODAR[nome] for nome in nomes]

    vereditos = _veredito_do_worker(pedidos)

    for nome, pedido, veredito in zip(nomes, pedidos, vereditos, strict=True):
        assert violacoes(pedido, _PEDIDO, "pedido"), f"o schema aceitou: {nome}"
        assert veredito, f"o worker aceitou: {nome}"


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("node") is None, reason="node não está no PATH")
def test_o_worker_aceita_o_que_o_backend_monta_e_o_pedido_antigo_sem_versao():
    do_backend = [
        montar_pedido(_job(categoria), f"job_{categoria.value}", log_level="info")
        for categoria in WorkerJobCategory
    ]
    sem_versao = {k: v for k, v in _VALIDO.items() if k != "v"}

    vereditos = _veredito_do_worker([*do_backend, sem_versao])

    assert vereditos == [None] * (len(do_backend) + 1)


def _rodar_no_worker(projetos: Path, pedido: dict, *, espera: float = 10.0) -> tuple[dict, bool]:
    """Sobe o worker REAL, entrega o pedido e devolve (res_, o req_ ainda existe)."""
    fila = projetos / "fila_remotion"
    fila.mkdir(parents=True, exist_ok=True)
    worker = subprocess.Popen(
        ["node", str(_WORKER)],
        cwd=str(_WORKER.parent),
        env={**os.environ, "PROJETOS_DIR": str(projetos), "WORKER_LOG_LEVEL": "info"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    try:
        time.sleep(2)
        pedido_arquivo = fila / f"req_{pedido['id']}.json"
        pedido_arquivo.write_text(json.dumps(pedido), encoding="utf-8")
        resposta = fila / f"res_{pedido['id']}.json"
        limite = time.time() + espera
        while time.time() < limite:
            if resposta.exists():
                time.sleep(0.3)  # o worker apaga o req_ logo depois de responder
                return json.loads(resposta.read_text(encoding="utf-8")), pedido_arquivo.exists()
            time.sleep(0.2)
        raise AssertionError("o worker não respondeu no prazo")
    finally:
        worker.terminate()
        try:
            worker.wait(timeout=15)
        except subprocess.TimeoutExpired:
            worker.kill()


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("node") is None, reason="node não está no PATH")
def test_o_worker_roda_o_pedido_versionado_que_o_backend_monta(tmp_path):
    job = WorkerJob(
        id="versionado",
        cmd=[sys.executable, "-c", "print('ok')"],
        cwd=str(tmp_path),
        category=WorkerJobCategory.DEFAULT,
        timeout_sec=30,
    )

    resposta, _ = _rodar_no_worker(tmp_path, montar_pedido(job, "versionado", log_level="info"))

    assert resposta["status"] == "sucesso"


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("node") is None, reason="node não está no PATH")
def test_o_worker_responde_erro_dito_para_a_versao_que_nao_conhece(tmp_path):
    pedido = {**_VALIDO, "v": 2, "id": "do_futuro", "cwd": str(tmp_path)}

    resposta, pedido_ficou = _rodar_no_worker(tmp_path, pedido)

    assert resposta["status"] == "erro"
    assert "pedido inválido" in resposta["erro"] and "versão 2" in resposta["erro"]
    assert not pedido_ficou, "o pedido recusado precisa sair da fila"
