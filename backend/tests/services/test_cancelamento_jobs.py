"""Testes de `app.services.cancelamento_jobs` (D-426).

Cobrem o contrato que a fila global usa: cancelar pelo mesmo id publicado,
recusar o que não é cancelável, e não deixar rastro de trabalho já terminado.
"""

from __future__ import annotations

import asyncio

import pytest
from app.services.cancelamento_jobs import (
    CancelamentoNaoSuportado,
    JobNaoEstaEmVoo,
    TrabalhoEmVoo,
    cancelar_job,
)


@pytest.fixture(autouse=True)
def _registro_limpo():
    TrabalhoEmVoo.limpar()
    yield
    TrabalhoEmVoo.limpar()


class TestRegistro:
    def test_task_registrada_fica_em_voo(self):
        async def cenario():
            task = asyncio.create_task(asyncio.sleep(5))
            TrabalhoEmVoo.registrar("render:corte-1", task)
            assert TrabalhoEmVoo.em_voo("render:corte-1")
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

        asyncio.run(cenario())

    def test_task_concluida_sai_do_registro(self):
        """Só o que ainda roda pode ser cancelado — senão a UI ofereceria um
        botão que mira trabalho morto."""

        async def cenario():
            task = asyncio.create_task(asyncio.sleep(0))
            TrabalhoEmVoo.registrar("task:x", task)
            await task
            await asyncio.sleep(0)  # deixa o done_callback rodar
            return TrabalhoEmVoo.em_voo("task:x")

        assert asyncio.run(cenario()) is False


class TestCancelarJob:
    def test_cancela_a_task_registrada(self):
        async def cenario():
            iniciou = asyncio.Event()

            async def trabalho_longo():
                iniciou.set()
                await asyncio.sleep(30)

            task = asyncio.create_task(trabalho_longo())
            TrabalhoEmVoo.registrar("render:corte-9", task, owner="corte-9")
            await iniciou.wait()

            resultado = cancelar_job("render:corte-9")
            with pytest.raises(asyncio.CancelledError):
                await task
            return resultado

        resultado = asyncio.run(cenario())
        assert resultado["cancelado"] is True
        assert resultado["job_id"] == "render:corte-9"

    def test_avisa_os_jobs_do_worker_do_dono(self, monkeypatch):
        """Cancelar só a task deixaria o ffmpeg/Chromium rodando órfão."""
        avisados: list[str] = []
        monkeypatch.setattr(
            "app.services.cancelamento_jobs.cancelar_owner",
            lambda owner: avisados.append(owner) or 3,
        )

        async def cenario():
            task = asyncio.create_task(asyncio.sleep(30))
            TrabalhoEmVoo.registrar("render:corte-7", task, owner="corte-7")
            resultado = cancelar_job("render:corte-7")
            with pytest.raises(asyncio.CancelledError):
                await task
            return resultado

        resultado = asyncio.run(cenario())
        assert avisados == ["corte-7"]
        assert resultado["jobs_worker_avisados"] == 3

    def test_job_desconhecido_recusa(self):
        with pytest.raises(JobNaoEstaEmVoo):
            cancelar_job("render:nao-existe")

    def test_upload_youtube_nao_e_cancelavel(self):
        """Abortar no meio do envio deixaria vídeo parcial na conta."""
        with pytest.raises(CancelamentoNaoSuportado):
            cancelar_job("youtube:corte-1")


class TestCancelarItemDaPos:
    def test_marca_o_corte_na_fila_em_lote(self, monkeypatch):
        from app.services.export import ExportService

        fila = {"projeto-1": {"corte-a": "aguardando"}}
        monkeypatch.setattr(ExportService, "_fila_processamento", fila, raising=False)
        monkeypatch.setattr(
            "app.services.cancelamento_jobs.cancelar_owner",
            lambda _owner: 0,
        )

        resultado = cancelar_job("pos:corte-a")

        assert resultado["cancelado"] is True
        assert fila["projeto-1"]["corte-a"] == "cancelado"

    def test_corte_fora_da_fila_recusa(self, monkeypatch):
        from app.services.export import ExportService

        monkeypatch.setattr(ExportService, "_fila_processamento", {}, raising=False)
        with pytest.raises(JobNaoEstaEmVoo):
            cancelar_job("pos:corte-fantasma")
