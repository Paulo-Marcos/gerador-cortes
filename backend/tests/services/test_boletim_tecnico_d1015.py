"""D-1015: pedir, medir em segundo plano, guardar e invalidar o boletim.

Banco em memória; a medição de verdade (FFmpeg) é trocada por uma resposta fixa
— ela tem seus testes em `tests/infrastructure`. Aqui vale o ciclo de vida.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import pytest
import pytest_asyncio
from app import database
from app.core.channel_paths import projetos_dir
from app.domain.compartilhado.erros import NaoEncontrado
from app.infrastructure import boletim_midia as medicao
from app.infrastructure import trechos_do_bruto
from app.models import Base, Corte, Projeto, Short, StatusCorte
from app.services import boletim_tecnico as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_MEDIDO = {
    "volume": {"integrado_lufs": -14.0, "pico_dbtp": -1.5, "lra_lu": 5.0, "avisos": []},
    "paradas": [],
    "emendas": {
        "total": 1,
        "com_som_dos_dois_lados": 1,
        "acima_do_p99": 0,
        "p99_da_fala": 0.05,
        "itens": [],
    },
}


@pytest_asyncio.fixture
async def corte_com_desvio(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", duracao_segundos=200))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_hms="00:00:00",
                fim_hms="00:02:00",
                inicio_seg=0.0,
                fim_seg=120.0,
                desvios=json.dumps([{"inicio_seg": 30.0, "fim_seg": 40.0, "motivo": "pausa"}]),
                status=StatusCorte.PROPOSTO,
            )
        )
        await db.commit()
    servico._em_voo.clear()
    servico._falhas.clear()
    yield f
    await engine.dispose()


@pytest.fixture
def video_final():
    pasta = projetos_dir() / "p1" / "cortes" / "c1" / "upload_ready"
    pasta.mkdir(parents=True, exist_ok=True)
    arquivo = pasta / "video.mp4"
    arquivo.write_bytes(b"x" * 100)
    yield arquivo
    arquivo.unlink(missing_ok=True)
    arquivo.with_name(f"{arquivo.name}.boletim.json").unlink(missing_ok=True)


@pytest.fixture
def medicao_falsa(monkeypatch):
    chamadas: list[servico._Alvo] = []

    def falsa(alvo):
        chamadas.append(alvo)
        return _MEDIDO

    monkeypatch.setattr(servico, "_medir", falsa)
    return chamadas


async def _esperar_medicao() -> None:
    for tarefa in list(servico._em_voo.values()):
        await tarefa


@pytest.mark.asyncio
async def test_arquivo_apagado_pela_limpeza_vira_estado_e_nao_erro(corte_com_desvio):
    # Pedido: se o arquivo não está mais em disco, mostrar isso em vez de erro.
    assert await servico.consultar("corte", "c1") == {"estado": "arquivo_ausente"}


@pytest.mark.asyncio
async def test_corte_inexistente_e_nao_encontrado(corte_com_desvio):
    with pytest.raises(NaoEncontrado):
        await servico.consultar("corte", "nao-existe")


@pytest.mark.asyncio
async def test_primeira_consulta_mede_em_segundo_plano_e_depois_entrega(
    corte_com_desvio, video_final, medicao_falsa
):
    # Pedido: rodar em segundo plano, mostrar "medindo" e guardar o resultado.
    assert (await servico.consultar("corte", "c1"))["estado"] == "medindo"
    await _esperar_medicao()
    pronto = await servico.consultar("corte", "c1")
    assert pronto["estado"] == "pronto"
    assert pronto["volume"]["integrado_lufs"] == -14.0
    assert len(medicao_falsa) == 1


@pytest.mark.asyncio
async def test_emendas_vem_dos_trechos_gravados_no_bruto(
    corte_com_desvio, video_final, medicao_falsa
):
    # Pedido: os trechos vêm da mesma fonte do bruto (desvio 30-40 s => [0-30] e [40-120]).
    # D-1024: a fonte é o registro que o corte do bruto gravou, não o desvio de hoje no banco.
    bruto = video_final.parent.parent / "clip_raw_1.mkv"
    bruto.write_bytes(b"b")
    trechos_do_bruto.gravar(bruto, [(0.0, 30.0), (40.0, 120.0)])
    os.utime(video_final, (time.time() + 200, time.time() + 200))
    async with corte_com_desvio() as db:
        (await db.get(Corte, "c1")).arquivo_clip_path = "cortes/c1/clip_raw_1.mkv"
        await db.commit()
    try:
        await servico.consultar("corte", "c1")
        await _esperar_medicao()
    finally:
        bruto.unlink(missing_ok=True)
        trechos_do_bruto.arquivo_do_registro(bruto).unlink(missing_ok=True)
    assert medicao_falsa[0].duracoes_dos_trechos == [30.0, 80.0]


@pytest.mark.asyncio
async def test_resultado_guardado_nao_mede_de_novo(corte_com_desvio, video_final, medicao_falsa):
    await servico.consultar("corte", "c1")
    await _esperar_medicao()
    await servico.consultar("corte", "c1")
    assert len(medicao_falsa) == 1


@pytest.mark.asyncio
async def test_arquivo_novo_invalida_o_boletim(corte_com_desvio, video_final, medicao_falsa):
    # Pedido: invalidar o resultado quando o arquivo mudar.
    await servico.consultar("corte", "c1")
    await _esperar_medicao()
    video_final.write_bytes(b"y" * 250)  # render novo: outro tamanho
    assert (await servico.consultar("corte", "c1"))["estado"] == "medindo"
    await _esperar_medicao()
    assert len(medicao_falsa) == 2


@pytest.mark.asyncio
async def test_desvio_editado_sem_novo_render_nao_refaz_o_boletim(
    corte_com_desvio, video_final, medicao_falsa
):
    # D-1024: o vídeo não mudou, então o boletim dele segue valendo; o desvio de hoje no
    # banco não descreve o vídeo e não entra na assinatura.
    await servico.consultar("corte", "c1")
    await _esperar_medicao()
    async with corte_com_desvio() as db:
        corte = await db.get(Corte, "c1")
        corte.desvios = json.dumps([{"inicio_seg": 50.0, "fim_seg": 60.0, "motivo": "pausa"}])
        await db.commit()
    assert (await servico.consultar("corte", "c1"))["estado"] == "pronto"
    assert len(medicao_falsa) == 1


@pytest.mark.asyncio
async def test_falha_nao_repete_ffmpeg_a_cada_consulta_mas_remedir_tenta(
    corte_com_desvio, video_final, monkeypatch
):
    chamadas = []

    def quebra(alvo):
        chamadas.append(1)
        raise medicao.ErroDeMedicao("A medição passou de 600s e foi interrompida.")

    monkeypatch.setattr(servico, "_medir", quebra)
    await servico.consultar("corte", "c1")
    await _esperar_medicao()
    falhou = await servico.consultar("corte", "c1")
    assert falhou["estado"] == "falhou" and "600s" in falhou["erro"]
    assert len(chamadas) == 1
    assert (await servico.consultar("corte", "c1", remedir=True))["estado"] == "medindo"
    await _esperar_medicao()
    assert len(chamadas) == 2


@pytest.mark.asyncio
async def test_so_uma_medicao_por_vez_na_maquina(corte_com_desvio, video_final, monkeypatch):
    # Pedido: não competir com o render nem consigo mesma; consulta repetida não duplica.
    chamadas = []
    monkeypatch.setattr(servico, "_medir", lambda alvo: chamadas.append(1) or _MEDIDO)
    await servico.consultar("corte", "c1")
    await servico.consultar("corte", "c1")
    await _esperar_medicao()
    assert len(chamadas) == 1


@pytest.mark.asyncio
async def test_medicao_roda_fora_do_event_loop(corte_com_desvio, video_final, monkeypatch):
    # Pedido: não travar o event loop — `_medir` é síncrono e pesado, então tem de
    # rodar em outra thread que não a do loop.
    import threading

    threads = []
    monkeypatch.setattr(
        servico, "_medir", lambda a: threads.append(threading.get_ident()) or _MEDIDO
    )
    await servico.consultar("corte", "c1")
    await _esperar_medicao()
    assert threads and threads[0] != threading.get_ident()


def _alvo(duracoes, *, bruto=None, no_bruto=lambda t: t):
    return servico._Alvo("corte:c1", Path("v.mp4"), bruto, duracoes, no_bruto)


def test_alvo_do_short_usa_as_juncoes_entre_as_fatias_montadas():
    # Pedido: horizontal E short. Fatias [45-60] e [0-30] ⇒ uma emenda no short, aos 15 s.
    short = Short(
        id="s1", corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=60.0,
        arquivo_short_path="shorts/s1/short.mp4",
        segmentos=json.dumps([{"inicio_seg": 45, "fim_seg": 60}, {"inicio_seg": 0, "fim_seg": 30}]),
    )  # fmt: skip
    corte = Corte(
        id="c1",
        projeto_id="p1",
        numero=1,
        inicio_hms="0",
        fim_hms="1",
        inicio_seg=0.0,
        fim_seg=60.0,
    )
    alvo = servico._alvo_do_short(short, corte)
    assert alvo.duracoes_dos_trechos == [15.0, 30.0]
    assert alvo.no_bruto(20.0) == 5.0  # o 2º trecho do short toca o início do bruto


def test_short_de_uma_fatia_so_nao_tem_emenda():
    short = Short(
        id="s1", corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=30.0,
        arquivo_short_path="shorts/s1/short.mp4", segmentos="[]",
    )  # fmt: skip
    corte = Corte(
        id="c1",
        projeto_id="p1",
        numero=1,
        inicio_hms="0",
        fim_hms="1",
        inicio_seg=0.0,
        fim_seg=30.0,
    )
    assert servico._alvo_do_short(short, corte).duracoes_dos_trechos == []


def test_origem_da_parada_compara_com_o_bruto_no_mesmo_instante(monkeypatch, tmp_path):
    # Pedido: dizer a origem. Final parado em 3-4 s: o bruto também (live) ou não (render).
    bruto = tmp_path / "clip_raw.mkv"
    bruto.write_bytes(b"x")
    parada = servico.regra.Parada(3.0, 1.0)
    for parado_no_bruto, esperado in ((True, "live"), (False, "render")):
        quadros = ([False] * 90 + [True] * 30 + [False] * 30) if parado_no_bruto else [False] * 150
        monkeypatch.setattr(
            servico.medicao, "medir_quadros_parados", lambda *_, q=quadros: (30.0, q)
        )
        itens = servico._paradas_com_origem(_alvo([10.0], bruto=bruto), [parada])
        assert itens[0]["origem"] == esperado


def test_sem_bruto_no_disco_a_origem_fica_nao_verificada(tmp_path):
    itens = servico._paradas_com_origem(
        _alvo([10.0], bruto=tmp_path / "apagado.mkv"), [servico.regra.Parada(3.0, 1.0)]
    )
    assert itens[0]["origem"] == "nao_verificada"


def test_emendas_resume_total_som_e_acima_do_p99(monkeypatch):
    import numpy as np

    # D-1027: a posição vem de `localizar_emendas` (testada em tests/infrastructure);
    # aqui vale o resumo, com as emendas achadas aos 1 s e 2 s do vídeo.
    monkeypatch.setattr(servico.medicao, "localizar_emendas", lambda *_: [1.0, 2.0])

    def seno(fase):
        t = np.arange(48000) / 48000
        return (np.sin(2 * np.pi * 200 * t + fase) * 12000).astype(np.int16)

    amostras = np.concatenate([seno(0), seno(np.pi / 2), np.zeros(48000, dtype=np.int16)])
    resultado = servico._emendas(_alvo([(0.0, 1.0)] * 3), amostras)
    assert resultado["total"] == 2
    assert resultado["com_som_dos_dois_lados"] == 1  # a 2ª emenda cai no silêncio
    assert resultado["acima_do_p99"] == 1


@pytest.mark.asyncio
async def test_medicao_pendente_de_arquivo_que_mudou_na_fila_nao_roda(
    corte_com_desvio, video_final, medicao_falsa
):
    await servico.consultar("corte", "c1")
    video_final.write_bytes(b"z" * 500)  # muda antes de a tarefa pegar a vez
    await _esperar_medicao()
    assert medicao_falsa == []
