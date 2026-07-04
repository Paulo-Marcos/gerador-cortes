"""Testes para `app.infrastructure.worker_queue`.

Áreas cobertas:
  - `_polling_existencia`: fallback puro.
  - `_aguardar_arquivo_de_resposta`: caminho rápido com watcher real e
    queda para polling quando o watcher quebra (ImportError, exceções).
  - `_watch_until_present`: regressão do bug do `awatch(timeout=...)`
    — garante que NÃO passamos kwargs inválidos.
  - `RemotionWorkerQueue.submit_and_wait`: protocolo de fila (req → res),
    propagação de categoria, timeout e falha do worker.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import sys
import time
from pathlib import Path

import pytest
from app.infrastructure.worker_queue import (
    RemotionWorkerQueue,
    WorkerJob,
    WorkerJobCategory,
    WorkerJobFailed,
    WorkerJobTimeout,
    _aguardar_arquivo_de_resposta,
    _polling_existencia,
    _queue_job_id,
    _watch_until_present,
)

# ─────────────────────────────────────────────────────────────────────────────
# _polling_existencia
# ─────────────────────────────────────────────────────────────────────────────


class TestPollingExistencia:
    def test_arquivo_ja_existe_retorna_imediatamente(self, tmp_path):
        f = tmp_path / "res_x.json"
        f.write_text("{}", encoding="utf-8")
        inicio = time.perf_counter()
        ok = asyncio.run(_polling_existencia(f, timeout=10, intervalo=0.5))
        assert ok is True
        assert time.perf_counter() - inicio < 0.1

    def test_timeout_quando_arquivo_nao_aparece(self, tmp_path):
        f = tmp_path / "res_x.json"
        ok = asyncio.run(_polling_existencia(f, timeout=1, intervalo=0.1))
        assert ok is False

    def test_detecta_arquivo_criado_durante_espera(self, tmp_path):
        f = tmp_path / "res_x.json"

        async def cenario():
            async def criar(delay: float):
                await asyncio.sleep(delay)
                f.write_text("{}", encoding="utf-8")

            criar_task = asyncio.create_task(criar(0.2))
            ok = await _polling_existencia(f, timeout=5, intervalo=0.1)
            await criar_task
            return ok

        assert asyncio.run(cenario()) is True


# ─────────────────────────────────────────────────────────────────────────────
# _aguardar_arquivo_de_resposta — caminho rápido com watcher
# ─────────────────────────────────────────────────────────────────────────────


class TestAguardarArquivoDeResposta:
    def test_arquivo_existente_dispensa_watcher(self, tmp_path):
        f = tmp_path / "res_x.json"
        f.write_text("{}", encoding="utf-8")
        inicio = time.perf_counter()
        ok = asyncio.run(_aguardar_arquivo_de_resposta(f, timeout=10))
        assert ok is True
        assert time.perf_counter() - inicio < 0.1

    def test_timeout_quando_arquivo_nao_aparece(self, tmp_path):
        f = tmp_path / "res_x.json"
        ok = asyncio.run(_aguardar_arquivo_de_resposta(f, timeout=1))
        assert ok is False

    def test_detecta_arquivo_criado_apos_inicio(self, tmp_path):
        """O watcher deve detectar arquivos novos dentro de uma janela
        bem inferior a 2 s (era o intervalo do polling antigo)."""
        f = tmp_path / "res_x.json"

        async def cenario():
            async def criar(delay: float):
                await asyncio.sleep(delay)
                f.write_text("{}", encoding="utf-8")

            criar_task = asyncio.create_task(criar(0.15))
            inicio = time.perf_counter()
            ok = await _aguardar_arquivo_de_resposta(f, timeout=10)
            elapsed = time.perf_counter() - inicio
            await criar_task
            return ok, elapsed

        ok, elapsed = asyncio.run(cenario())
        assert ok is True
        assert elapsed < 2.0, f"Watcher demorou {elapsed:.2f}s, esperado < 2s"

    def test_cai_para_polling_se_watchfiles_falha(self, tmp_path, monkeypatch):
        """Se `awatch` levanta exceção arbitrária (ex.: TypeError por API
        quebrada), deve cair pro polling silenciosamente."""

        class StubBroken:
            @staticmethod
            def awatch(*args, **kwargs):
                raise TypeError("awatch() got an unexpected keyword argument 'timeout'")

        monkeypatch.setitem(sys.modules, "watchfiles", StubBroken())

        f = tmp_path / "res_x.json"

        async def cenario():
            async def criar(delay: float):
                await asyncio.sleep(delay)
                f.write_text("{}", encoding="utf-8")

            criar = asyncio.create_task(criar(0.2))
            ok = await _aguardar_arquivo_de_resposta(f, timeout=3)
            await criar
            return ok

        assert asyncio.run(cenario()) is True


# ─────────────────────────────────────────────────────────────────────────────
# Regressão: o `awatch` NÃO deve receber `timeout=` (kwarg inválido na
# `watchfiles >= 0.x`). O timeout é responsabilidade do `asyncio.timeout`.
# ─────────────────────────────────────────────────────────────────────────────


class TestAwatchKwargsRegressao:
    def test_watch_until_present_chama_awatch_sem_timeout_kwarg(self, tmp_path):
        """Se voltarmos a passar `timeout=` para `awatch`, este teste quebra
        — capturando a regressão antes de ela chegar em produção."""
        chamadas: list[dict] = []

        async def fake_awatch(*args, **kwargs):
            chamadas.append({"args": args, "kwargs": dict(kwargs)})
            # Drena rápido para deixar o `asyncio.timeout` cuidar do encerramento.
            await asyncio.sleep(0.05)
            return
            yield  # mantém esta função como gerador assíncrono

        f = tmp_path / "res_x.json"

        async def cenario():
            try:
                await asyncio.wait_for(
                    _watch_until_present(fake_awatch, f, timeout=1),
                    timeout=2,
                )
            except (TimeoutError, StopAsyncIteration):
                pass

        asyncio.run(cenario())

        assert chamadas, "awatch deveria ter sido chamado"
        for chamada in chamadas:
            assert "timeout" not in chamada["kwargs"], (
                f"awatch recebeu 'timeout' kwarg (não suportado na API atual): {chamada['kwargs']}"
            )

    def test_awatch_real_nao_tem_kwarg_timeout(self):
        """Sanity check do contrato: a função `awatch` realmente importada
        do `watchfiles` não tem parâmetro `timeout`. Se este teste passar
        a falhar, a API mudou — e o código pode ser simplificado."""
        try:
            from watchfiles import awatch
        except ImportError:
            pytest.skip("watchfiles não instalado neste ambiente")

        sig = inspect.signature(awatch)
        assert "timeout" not in sig.parameters, (
            "watchfiles agora aceita 'timeout' — considere simplificar o watcher"
        )


# ─────────────────────────────────────────────────────────────────────────────
# RemotionWorkerQueue.submit_and_wait
# ─────────────────────────────────────────────────────────────────────────────


def _write_resposta(res_file: Path, *, status: str, erro: str | None = None) -> None:
    payload: dict = {"status": status}
    if erro is not None:
        payload["erro"] = erro
    res_file.write_text(json.dumps(payload), encoding="utf-8")


async def _esperar_req(tmp_path: Path, job: WorkerJob) -> Path:
    req = tmp_path / f"req_{_queue_job_id(job)}.json"
    for _ in range(50):
        if req.exists():
            return req
        await asyncio.sleep(0.02)
    assert req.exists(), "request file nao foi escrito"
    return req


class TestRemotionWorkerQueueSubmit:
    def test_escreve_req_e_le_res_sucesso(self, tmp_path):
        queue = RemotionWorkerQueue(tmp_path)
        job = WorkerJob(
            id="job_a",
            cmd=["ffmpeg", "-i", "in.mp4", "out.mp4"],
            cwd=tmp_path,
            category=WorkerJobCategory.GRADE,
            timeout_sec=5,
        )

        async def cenario():
            async def fake_worker():
                # Espera o req aparecer; finge processamento; escreve res.
                req = await _esperar_req(tmp_path, job)
                queue_id = req.stem.removeprefix("req_")
                _write_resposta(tmp_path / f"res_{queue_id}.json", status="sucesso")

            worker_task = asyncio.create_task(fake_worker())
            await queue.submit_and_wait(job, log_level="info")
            await worker_task

        asyncio.run(cenario())

        # Após sucesso, o res é consumido (removido); o req é responsabilidade
        # do worker (não removemos no cliente).
        assert not (tmp_path / f"res_{_queue_job_id(job)}.json").exists()

    def test_payload_inclui_categoria_e_log_level(self, tmp_path):
        queue = RemotionWorkerQueue(tmp_path)
        job = WorkerJob(
            id="job_cat",
            cmd=["echo", "ola"],
            cwd=tmp_path,
            category=WorkerJobCategory.BUNDLE,
            timeout_sec=5,
        )

        captured: dict = {}

        async def cenario():
            async def fake_worker():
                req = await _esperar_req(tmp_path, job)
                captured.update(json.loads(req.read_text(encoding="utf-8")))
                queue_id = req.stem.removeprefix("req_")
                _write_resposta(tmp_path / f"res_{queue_id}.json", status="sucesso")

            worker_task = asyncio.create_task(fake_worker())
            await queue.submit_and_wait(job, log_level="debug")
            await worker_task

        asyncio.run(cenario())

        assert captured["id"] == _queue_job_id(job)
        assert captured["logical_id"] == "job_cat"
        assert captured["category"] == "bundle"
        assert captured["log_level"] == "debug"
        assert captured["cmd"] == ["echo", "ola"]

    def test_queue_id_diferencia_jobs_com_mesmo_id_logico(self, tmp_path):
        job_a = WorkerJob(
            id="clip_graded_grade",
            cmd=["ffmpeg", "-i", "a.mp4", "out.mp4"],
            cwd=tmp_path / "corte-a",
        )
        job_b = WorkerJob(
            id="clip_graded_grade",
            cmd=["ffmpeg", "-i", "b.mp4", "out.mp4"],
            cwd=tmp_path / "corte-b",
        )

        id_a = _queue_job_id(job_a)
        id_b = _queue_job_id(job_b)

        assert id_a.startswith("clip_graded_grade_")
        assert id_b.startswith("clip_graded_grade_")
        assert id_a != id_b

    def test_timeout_levanta_workerjobtimeout(self, tmp_path):
        queue = RemotionWorkerQueue(tmp_path)
        job = WorkerJob(
            id="job_timeout",
            cmd=["sleep", "999"],
            cwd=tmp_path,
            timeout_sec=1,
        )

        with pytest.raises(WorkerJobTimeout):
            asyncio.run(queue.submit_and_wait(job))

    def test_status_erro_levanta_workerjobfailed(self, tmp_path):
        queue = RemotionWorkerQueue(tmp_path)
        job = WorkerJob(
            id="job_err",
            cmd=["false"],
            cwd=tmp_path,
            timeout_sec=5,
        )

        async def cenario():
            async def fake_worker():
                req = await _esperar_req(tmp_path, job)
                queue_id = req.stem.removeprefix("req_")
                _write_resposta(tmp_path / f"res_{queue_id}.json", status="erro", erro="exit 1")

            worker_task = asyncio.create_task(fake_worker())
            with pytest.raises(WorkerJobFailed, match="exit 1"):
                await queue.submit_and_wait(job)
            await worker_task

        asyncio.run(cenario())

    def test_remove_request_e_response_stale_antes_de_enfileirar(self, tmp_path):
        """Restos de execuções anteriores não devem mascarar a resposta nova."""
        (tmp_path / "req_job_stale.json").write_text("{}", encoding="utf-8")
        (tmp_path / "res_job_stale.json").write_text(
            json.dumps({"status": "sucesso"}),
            encoding="utf-8",
        )

        queue = RemotionWorkerQueue(tmp_path)
        job = WorkerJob(id="job_stale", cmd=["x"], cwd=tmp_path, timeout_sec=1)

        # Como o stale res existia, ele deveria ter sido removido — submit_and_wait
        # bloqueia esperando o NOVO res. Como ninguém escreve, dá timeout.
        with pytest.raises(WorkerJobTimeout):
            asyncio.run(queue.submit_and_wait(job))
