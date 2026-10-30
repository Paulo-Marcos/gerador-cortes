"""D-994: a sync do YouTube que falha tem que aparecer, e rodar sozinha.

De 10/07 a 27/10/2026 a sync foi recusada (token sem `yt-analytics.readonly`) sem
nenhum aviso: o erro morria no log e o `status` só sabia dizer "sincronizado há N
dias". Aqui cada ponto do pedido vira um comportamento com teste.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from app.infrastructure import youtube_analytics as ya
from app.models import Base
from app.services import youtube_stats as svc
from app.services.youtube_stats import YoutubeStatsService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest.fixture(autouse=True)
def _sem_falha_de_outro_teste():
    svc._limpar_falha()
    yield
    svc._limpar_falha()


async def _novo_banco(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'stats.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _sem_escopo():
    raise ya.YoutubeAnalyticsError("falta escopo", precisa_reautorizar=True)


# ── (1) a falha aparece no status ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_recusada_em_background_aparece_no_status(tmp_path, monkeypatch):
    """O defeito: a sync falhava e o status seguia sem falha nenhuma."""
    engine, factory = await _novo_banco(tmp_path)
    monkeypatch.setattr(svc, "AsyncSessionLocal", factory)
    monkeypatch.setattr(ya, "carregar_credenciais", _sem_escopo)
    try:
        await YoutubeStatsService.sincronizar()
        async with factory() as db:
            estado = await YoutubeStatsService.status(db)
        assert estado["falha"]["mensagem"] == "falta escopo"
        assert estado["falha"]["precisa_reautorizar"] is True
        assert estado["falha"]["em"]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_pre_checagem_do_botao_tambem_registra_a_falha(tmp_path, monkeypatch):
    engine, factory = await _novo_banco(tmp_path)
    monkeypatch.setattr(ya, "carregar_credenciais", _sem_escopo)
    try:
        await YoutubeStatsService.verificar_credenciais()
        async with factory() as db:
            assert (await YoutubeStatsService.status(db))["falha"] is not None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_sync_que_da_certo_limpa_a_falha(tmp_path, monkeypatch):
    engine, factory = await _novo_banco(tmp_path)
    monkeypatch.setattr(svc, "AsyncSessionLocal", factory)
    monkeypatch.setattr(ya, "carregar_credenciais", _sem_escopo)
    try:
        await YoutubeStatsService.sincronizar()
        monkeypatch.setattr(ya, "carregar_credenciais", lambda: object())
        monkeypatch.setattr(ya, "listar_uploads", lambda _c: ("canal", []))
        monkeypatch.setattr(ya, "metricas_lifetime", lambda _c, **_kw: {})
        await YoutubeStatsService.sincronizar()
        async with factory() as db:
            assert (await YoutubeStatsService.status(db))["falha"] is None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_status_sem_falha_nenhuma(tmp_path):
    engine, factory = await _novo_banco(tmp_path)
    try:
        async with factory() as db:
            assert (await YoutubeStatsService.status(db))["falha"] is None
    finally:
        await engine.dispose()


# ── a mensagem manda fazer a coisa certa ─────────────────────────────────────


def test_mensagem_nao_manda_reiniciar_e_diz_em_qual_pasta_rodar():
    texto = ya._INSTRUCAO_REAUTORIZAR
    assert "reinicie o backend" not in texto.lower()  # o token é relido a cada chamada
    assert "instalação" in texto.lower()  # auth_youtube.py grava o token da pasta onde roda


# ── (3) sincronização periódica ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_agendador_sincroniza_mais_de_uma_vez_e_sobrevive_a_erro(monkeypatch):
    chamadas = []

    async def _sincronizar():
        chamadas.append(1)
        if len(chamadas) == 1:
            raise RuntimeError("rede caiu")
        return {"status": "ok"}

    monkeypatch.setattr(YoutubeStatsService, "sincronizar", staticmethod(_sincronizar))
    tarefa = asyncio.create_task(
        svc.sincronizar_periodicamente(espera_inicial_seg=0, intervalo_seg=0.01, timeout_seg=1)
    )
    try:
        await asyncio.wait_for(_ate(lambda: len(chamadas) >= 3), timeout=2)
    finally:
        tarefa.cancel()
    assert len(chamadas) >= 3  # a exceção da 1ª rodada não matou o laço


@pytest.mark.asyncio
async def test_agendador_corta_sync_que_trava_e_registra_a_falha(monkeypatch):
    async def _trava():
        await asyncio.sleep(60)

    monkeypatch.setattr(YoutubeStatsService, "sincronizar", staticmethod(_trava))
    tarefa = asyncio.create_task(
        svc.sincronizar_periodicamente(espera_inicial_seg=0, intervalo_seg=60, timeout_seg=0.05)
    )
    try:
        await asyncio.wait_for(_ate(lambda: svc._ultima_falha is not None), timeout=2)
    finally:
        tarefa.cancel()
    assert "tempo" in svc._ultima_falha["mensagem"].lower()


@pytest.mark.asyncio
async def test_agendador_espera_antes_da_primeira_rodada(monkeypatch):
    """Não pode competir com o boot: a 1ª rodada só vem depois da espera."""
    chamadas = []

    async def _sincronizar():
        chamadas.append(1)

    monkeypatch.setattr(YoutubeStatsService, "sincronizar", staticmethod(_sincronizar))
    tarefa = asyncio.create_task(
        svc.sincronizar_periodicamente(espera_inicial_seg=30, intervalo_seg=60, timeout_seg=1)
    )
    await asyncio.sleep(0.05)
    tarefa.cancel()
    assert chamadas == []


def test_lifespan_dispara_o_agendador():
    fonte = (Path(__file__).resolve().parents[2] / "app" / "main.py").read_text(encoding="utf-8")
    assert "sincronizar_periodicamente" in fonte


async def _ate(condicao):
    while not condicao():
        await asyncio.sleep(0.005)
