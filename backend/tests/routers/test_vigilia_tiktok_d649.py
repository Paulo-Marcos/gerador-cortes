"""A vigília do TikTok não pode ser recolhida pelo coletor de lixo (D-649).

Depois de abrir a aba do TikTok, o app fica esperando o operador publicar para
marcar o corte sozinho. A espera é de até 30 minutos — e a task era criada solta.
O event loop guarda tasks por referência FRACA: sem dono, o coletor pode levá-la
no meio do caminho. O upload não quebra; ele some calado, e o corte nunca é
marcado como publicado.
"""

import asyncio
import gc

import pytest
from app.services import publicacao_no_tiktok, tasks


@pytest.fixture(autouse=True)
def sem_vigias_de_outro_teste():
    """D-893: o registro de cortes vigiados é do processo; cada teste parte do zero."""
    publicacao_no_tiktok._VIGIADOS.clear()
    yield
    publicacao_no_tiktok._VIGIADOS.clear()


@pytest.mark.asyncio
async def test_a_vigilia_fica_com_dono_e_sobrevive_ao_coletor(monkeypatch):
    comecou = asyncio.Event()

    async def vigilia_longa(_corte_id: str, _marca: str = "") -> None:
        comecou.set()
        await asyncio.sleep(5)

    monkeypatch.setattr(publicacao_no_tiktok, "_marcar_quando_publicar", vigilia_longa)

    tarefa = publicacao_no_tiktok.vigiar_publicacao("corte-123456789")
    await comecou.wait()

    assert tarefa in tasks._background_tasks, "sem dono, o coletor pode levar a vigília"
    gc.collect()
    assert not tarefa.done(), "a vigília morreu no meio do caminho"

    tarefa.cancel()


@pytest.mark.asyncio
async def test_falha_na_vigilia_nao_derruba_nada_e_solta_a_referencia(monkeypatch, caplog):
    async def vigilia_que_falha(_corte_id: str, _marca: str = "") -> None:
        raise RuntimeError("aba fechada no meio")

    monkeypatch.setattr(publicacao_no_tiktok, "_marcar_quando_publicar", vigilia_que_falha)

    tarefa = publicacao_no_tiktok.vigiar_publicacao("corte-123456789")
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    assert tarefa.done()
    assert tarefa not in tasks._background_tasks, "task terminada não pode vazar no registro"


# ─── D-893: a vigília acha ESTA aba e o corte não é enviado duas vezes ──────


@pytest.mark.asyncio
async def test_a_vigilia_procura_a_aba_pela_etiqueta_e_solta_o_corte_ao_terminar(monkeypatch):
    from app.services import tiktok_studio

    pedidas = []

    async def aguardar(**kwargs):
        pedidas.append(kwargs.get("marca"))
        return False

    monkeypatch.setattr(tiktok_studio, "aguardar_publicacao", aguardar)

    tarefa = publicacao_no_tiktok.vigiar_publicacao("corte-123456789", "cortadorlive-abc")
    assert "corte-123456789" in publicacao_no_tiktok._VIGIADOS
    await tarefa

    assert pedidas == ["cortadorlive-abc"], (
        "sem a etiqueta, a vigília olha a primeira aba de upload"
    )
    assert "corte-123456789" not in publicacao_no_tiktok._VIGIADOS, (
        "vigília terminada solta o corte"
    )


@pytest.mark.asyncio
async def test_falha_na_vigilia_tambem_solta_o_corte(monkeypatch):
    from app.services import tiktok_studio

    async def quebra(**_kwargs):
        raise RuntimeError("Chrome fechado")

    monkeypatch.setattr(tiktok_studio, "aguardar_publicacao", quebra)

    await publicacao_no_tiktok.vigiar_publicacao("corte-987654321", "cortadorlive-x")

    assert "corte-987654321" not in publicacao_no_tiktok._VIGIADOS
