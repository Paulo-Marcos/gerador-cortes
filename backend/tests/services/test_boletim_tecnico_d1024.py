"""D-1024: o boletim nunca mostra número errado como certo.

Pedido -> teste:
1. `remedir` apaga o boletim guardado -> test_remedir_apaga_o_boletim_guardado
2. vídeo defasado em relação aos trechos -> test_emendas_* (bruto novo, sem registro, registro)
3. FFmpeg que morre vira ErroDeMedicao -> tests/infrastructure/test_boletim_midia_codigo_de_saida_d1024.py
4. uma medição por vez, com dois alvos -> test_duas_medicoes_pedidas_juntas_nao_rodam_juntas
"""

# ruff: noqa: F811 — as fixtures importadas do teste irmão são "redefinidas" nos parâmetros
from __future__ import annotations

import asyncio
import os
import threading
import time

import pytest
from app.core.channel_paths import projetos_dir
from app.infrastructure import trechos_do_bruto
from app.models import Corte
from app.services import boletim_tecnico as servico

from .test_boletim_tecnico_d1015 import (  # noqa: F401 — fixtures e apoio do teste irmão
    _MEDIDO,
    _esperar_medicao,
    corte_com_desvio,
    medicao_falsa,
    video_final,
)


def _sidecar(video):
    return video.with_name(f"{video.name}.boletim.json")


@pytest.mark.asyncio
async def test_remedir_apaga_o_boletim_guardado(corte_com_desvio, video_final, monkeypatch):
    # Antes: o sidecar velho seguia válido, o GET seguinte devolvia "pronto" e o polling parava.
    solta = threading.Event()
    chamadas = []

    def medindo(alvo):
        chamadas.append(1)
        if len(chamadas) > 1:
            solta.wait(10)  # a 2ª medição fica em andamento enquanto a tela pergunta
        return _MEDIDO

    monkeypatch.setattr(servico, "_medir", medindo)
    await servico.consultar("corte", "c1")
    await _esperar_medicao()
    assert _sidecar(video_final).is_file()

    assert (await servico.consultar("corte", "c1", remedir=True))["estado"] == "medindo"
    assert not _sidecar(video_final).exists()
    assert (await servico.consultar("corte", "c1"))["estado"] == "medindo"
    solta.set()
    await _esperar_medicao()
    assert (await servico.consultar("corte", "c1"))["estado"] == "pronto"
    assert len(chamadas) == 2


@pytest.mark.asyncio
async def test_duas_medicoes_pedidas_juntas_nao_rodam_juntas(
    corte_com_desvio, video_final, monkeypatch
):
    # O teste antigo usava um alvo só: sem `_vez` ele passava igual. Aqui são dois alvos.
    async with corte_com_desvio() as db:
        db.add(
            Corte(
                id="c2", projeto_id="p1", numero=2, inicio_hms="0", fim_hms="1",
                inicio_seg=0.0, fim_seg=60.0,
            )
        )  # fmt: skip
        await db.commit()
    pasta = projetos_dir() / "p1" / "cortes" / "c2" / "upload_ready"
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "video.mp4").write_bytes(b"x" * 100)

    ativas = 0
    pico = 0
    trava = threading.Lock()

    def medindo(alvo):
        nonlocal ativas, pico
        with trava:
            ativas += 1
            pico = max(pico, ativas)
        time.sleep(0.2)
        with trava:
            ativas -= 1
        return _MEDIDO

    monkeypatch.setattr(servico, "_medir", medindo)
    try:
        await servico.consultar("corte", "c1")
        await servico.consultar("corte", "c2")
        await asyncio.gather(*servico._em_voo.values())
    finally:
        (pasta / "video.mp4").unlink(missing_ok=True)
        (pasta / "video.mp4.boletim.json").unlink(missing_ok=True)
    assert pico == 1


def _bruto_do_corte(corte_dir, *, duracoes, mais_novo_que: float | None = None):
    bruto = corte_dir / "clip_raw_1.mkv"
    bruto.write_bytes(b"b")
    if duracoes is not None:
        trechos_do_bruto.gravar(bruto, [(0.0, d) for d in duracoes])
    if mais_novo_que is not None:
        os.utime(bruto, (mais_novo_que + 100, mais_novo_que + 100))
    return bruto


@pytest.fixture
def com_bruto(corte_com_desvio, video_final):
    """Liga o bruto do banco ao arquivo em disco; devolve uma função que o grava."""
    corte_dir = video_final.parent.parent
    criados = []

    async def ligar(**kw):
        bruto = _bruto_do_corte(corte_dir, **kw)
        criados.append(bruto)
        async with corte_com_desvio() as db:
            corte = await db.get(Corte, "c1")
            corte.arquivo_clip_path = f"cortes/c1/{bruto.name}"
            await db.commit()
        return bruto

    yield ligar
    for b in criados:
        b.unlink(missing_ok=True)
        trechos_do_bruto.arquivo_do_registro(b).unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_emendas_usam_as_duracoes_gravadas_no_corte_do_bruto(com_bruto, video_final):
    # Desvio editado depois do render: o banco diz [30, 80], o vídeo foi cortado em [50, 60].
    await com_bruto(duracoes=[50.0, 60.0])
    os.utime(video_final, (time.time() + 200, time.time() + 200))  # render posterior ao bruto
    from app.services.boletim_tecnico import _descrever

    alvo = await _descrever("corte", "c1")
    assert alvo.duracoes_dos_trechos == [50.0, 60.0]
    assert alvo.emendas_aviso is None


@pytest.mark.asyncio
async def test_bruto_mais_novo_que_o_video_nao_mede_emendas(com_bruto, video_final):
    # O bruto foi regerado depois do render: o vídeo ainda tem os trechos antigos.
    await com_bruto(duracoes=[30.0, 80.0], mais_novo_que=video_final.stat().st_mtime)
    from app.services.boletim_tecnico import _descrever

    alvo = await _descrever("corte", "c1")
    assert alvo.duracoes_dos_trechos == []
    assert "renderize" in alvo.emendas_aviso.lower()


@pytest.mark.asyncio
async def test_bruto_sem_registro_dos_trechos_nao_mede_emendas(com_bruto, video_final):
    await com_bruto(duracoes=None)
    os.utime(video_final, (time.time() + 200, time.time() + 200))
    from app.services.boletim_tecnico import _descrever

    alvo = await _descrever("corte", "c1")
    assert alvo.duracoes_dos_trechos == []
    assert alvo.emendas_aviso


@pytest.mark.asyncio
async def test_boletim_pronto_sem_emendas_confiaveis_traz_o_aviso(
    com_bruto, video_final, monkeypatch
):
    await com_bruto(duracoes=None)
    os.utime(video_final, (time.time() + 200, time.time() + 200))
    monkeypatch.setattr(
        servico.medicao, "medir_volume", lambda *_: servico.regra.Volume(-14.0, -2.0, 3.0)
    )
    monkeypatch.setattr(servico.medicao, "medir_quadros_parados", lambda *_: (30.0, [False] * 30))
    import numpy as np

    monkeypatch.setattr(servico.medicao, "ler_audio", lambda *_: np.ones(48000, dtype=np.int16))
    await servico.consultar("corte", "c1")
    await _esperar_medicao()
    pronto = await servico.consultar("corte", "c1")
    assert pronto["estado"] == "pronto"
    assert pronto["emendas"] is None
    assert pronto["emendas_aviso"]


def test_gerar_o_bruto_grava_os_trechos_ao_lado_dele(tmp_path):
    # É daqui que o boletim sabe onde estavam as emendas quando o vídeo foi feito.
    from app.services.export import _gravar_bruto_no_corte

    corte = Corte(id="c1", projeto_id="p1", status="proposto")
    bruto = tmp_path / "clip_raw_9.mkv"
    _gravar_bruto_no_corte(corte, bruto, 110.0, [(0.0, 30.0), (40.0, 120.0)])
    assert trechos_do_bruto.ler(bruto) == [30.0, 80.0]
