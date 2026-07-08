"""D-305: sync/upsert/casamento das estatísticas do YouTube e os endpoints.

Banco SQLite real por teste; nenhuma chamada de rede — a infra
(`youtube_analytics`) é substituída por fakes que devolvem dataclasses.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from app.infrastructure import youtube_analytics as ya
from app.models import Base, Corte, MetadadoCorte, Projeto, YoutubeVideoStat
from app.services import youtube_stats as svc
from app.services.youtube_stats import YoutubeStatsService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


async def _novo_banco(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'stats.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, factory


async def _criar_projeto(factory, projeto_id: str = "p-stats") -> str:
    async with factory() as db:
        db.add(
            Projeto(
                id=projeto_id,
                youtube_url="https://youtu.be/x",
                titulo_live="Live",
                canal_origem="@teste",  # explícito: evita lookup do canal ativo
            )
        )
        await db.commit()
    return projeto_id


async def _criar_corte(
    factory, projeto_id, *, numero, titulo_proposto="", youtube_video_id="", titulo_youtube=None
) -> str:
    corte_id = str(uuid.uuid4())
    async with factory() as db:
        db.add(
            Corte(
                id=corte_id,
                projeto_id=projeto_id,
                numero=numero,
                titulo_proposto=titulo_proposto,
                youtube_video_id=youtube_video_id,
                inicio_seg=0.0,
                fim_seg=100.0,
            )
        )
        if titulo_youtube is not None:
            db.add(
                MetadadoCorte(
                    id=str(uuid.uuid4()),
                    corte_id=corte_id,
                    titulo_youtube=titulo_youtube,
                    canal_credito="",  # explícito: evita lookup do canal ativo
                )
            )
        await db.commit()
    return corte_id


def _upload(video_id, titulo="T", duracao_seg=600.0, publicado_em=None):
    return ya.VideoUpload(
        video_id=video_id, titulo=titulo, duracao_seg=duracao_seg, publicado_em=publicado_em
    )


def _metrica(video_id, views=100):
    return ya.VideoMetrica(
        video_id=video_id,
        views=views,
        estimated_minutes_watched=50.0,
        average_view_duration_seg=120.0,
        average_view_percentage=42.0,
        subscribers_gained=3,
    )


# ── upsert ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upsert_e_idempotente_e_preserva_metrica_ausente(tmp_path):
    engine, factory = await _novo_banco(tmp_path)
    try:
        uploads = [_upload("v1", titulo="A"), _upload("v2", titulo="B")]
        metricas = {"v1": _metrica("v1", views=1000)}
        agora = datetime.utcnow()

        async with factory() as db:
            total = await svc._upsert(db, "canalX", uploads, metricas, sincronizado_em=agora)
            await db.commit()
        assert total == 2

        # Segundo sync sem métrica de v1: NÃO zera o valor já conhecido.
        async with factory() as db:
            await svc._upsert(db, "canalX", uploads, {}, sincronizado_em=agora)
            await db.commit()

        async with factory() as db:
            linhas = (await db.execute(select(YoutubeVideoStat))).scalars().all()
        por_id = {linha.video_id: linha for linha in linhas}
        assert len(linhas) == 2  # sem duplicar
        assert por_id["v1"].views == 1000  # preservado
        assert por_id["v1"].canal_id == "canalX"
        assert por_id["v2"].views == 0  # nunca teve métrica
    finally:
        await engine.dispose()


# ── casamento vídeo ↔ corte ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_casamento_por_video_id_e_por_titulo(tmp_path):
    engine, factory = await _novo_banco(tmp_path)
    try:
        projeto_id = await _criar_projeto(factory)
        corte_id_video = await _criar_corte(
            factory, projeto_id, numero=1, youtube_video_id="v1", titulo_youtube="Qualquer"
        )
        corte_id_titulo = await _criar_corte(
            factory, projeto_id, numero=2, titulo_youtube="🔥 A Tese Central: parte 1"
        )

        agora = datetime.utcnow()
        async with factory() as db:
            await svc._upsert(
                db,
                "canalX",
                [
                    _upload("v1", titulo="Título publicado do corte 1"),
                    _upload("v9", titulo="A Tese Central: parte 1"),  # casa por título
                    _upload("v8", titulo="Vídeo sem corte local"),  # fica órfão
                ],
                {},
                sincronizado_em=agora,
            )
            casamento = await svc._casar_com_cortes(db)
            await db.commit()

        assert casamento == {"por_video_id": 1, "por_titulo": 1}

        async with factory() as db:
            linhas = {s.video_id: s for s in (await db.execute(select(YoutubeVideoStat))).scalars()}
        assert linhas["v1"].corte_id == corte_id_video
        assert linhas["v1"].match_por_titulo == 0
        assert linhas["v9"].corte_id == corte_id_titulo
        assert linhas["v9"].match_por_titulo == 1
        assert linhas["v8"].corte_id is None
    finally:
        await engine.dispose()


# ── status / staleness ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_status_reporta_staleness(tmp_path):
    engine, factory = await _novo_banco(tmp_path)
    try:
        async with factory() as db:
            recente = await YoutubeStatsService.status(db)
        assert recente["total"] == 0
        assert recente["stale"] is True  # nunca sincronizado
        assert recente["sincronizado_em"] is None

        velho = datetime.utcnow() - timedelta(days=svc.DIAS_STALE + 1)
        async with factory() as db:
            db.add(YoutubeVideoStat(id="s1", video_id="v1", views=10, sincronizado_em=velho))
            await db.commit()
        async with factory() as db:
            estado = await YoutubeStatsService.status(db)
        assert estado["total"] == 1
        assert estado["stale"] is True
        assert estado["dias_desde_sync"] >= svc.DIAS_STALE
    finally:
        await engine.dispose()


# ── sincronizar (infra fake) ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sincronizar_popula_e_casa(tmp_path, monkeypatch):
    engine, factory = await _novo_banco(tmp_path)
    monkeypatch.setattr(svc, "AsyncSessionLocal", factory)
    monkeypatch.setattr(ya, "carregar_credenciais", lambda: object())
    monkeypatch.setattr(
        ya, "listar_uploads", lambda _creds: ("canalX", [_upload("v1"), _upload("v2")])
    )
    monkeypatch.setattr(
        ya, "metricas_lifetime", lambda _creds, **_kw: {"v1": _metrica("v1", views=500)}
    )
    try:
        projeto_id = await _criar_projeto(factory)
        corte_id = await _criar_corte(factory, projeto_id, numero=1, youtube_video_id="v1")

        resultado = await YoutubeStatsService.sincronizar()

        assert resultado["status"] == "ok"
        assert resultado["total"] == 2
        assert resultado["com_metricas"] == 1
        assert resultado["casados_por_video_id"] == 1

        async with factory() as db:
            linhas = {s.video_id: s for s in (await db.execute(select(YoutubeVideoStat))).scalars()}
        assert linhas["v1"].corte_id == corte_id
        assert linhas["v1"].views == 500
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_sincronizar_sem_escopo_devolve_erro_claro(tmp_path, monkeypatch):
    engine, factory = await _novo_banco(tmp_path)
    monkeypatch.setattr(svc, "AsyncSessionLocal", factory)

    def _sem_escopo():
        raise ya.YoutubeAnalyticsError("falta escopo", precisa_reautorizar=True)

    monkeypatch.setattr(ya, "carregar_credenciais", _sem_escopo)
    try:
        resultado = await YoutubeStatsService.sincronizar()
        assert resultado["status"] == "erro"
        assert resultado["precisa_reautorizar"] is True
        assert "escopo" in resultado["mensagem"]
    finally:
        await engine.dispose()


# ── endpoints ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_endpoint_sync_barra_sem_credencial(monkeypatch):
    from app.routers import projetos as projetos_router

    async def _erro():
        return {"status": "erro", "precisa_reautorizar": True, "mensagem": "reautorize"}

    monkeypatch.setattr(projetos_router.YoutubeStatsService, "verificar_credenciais", _erro)
    disparou = {"chamou": False}
    monkeypatch.setattr(
        projetos_router,
        "fire_and_forget",
        lambda coro, name=None: (coro.close(), disparou.update(chamou=True)),
    )

    resposta = await projetos_router.sincronizar_youtube_stats()
    assert resposta["status"] == "erro"
    assert disparou["chamou"] is False  # não dispara o sync pesado


@pytest.mark.asyncio
async def test_endpoint_sync_dispara_quando_credencial_ok(monkeypatch):
    from app.routers import projetos as projetos_router

    async def _ok():
        return {"status": "ok"}

    monkeypatch.setattr(projetos_router.YoutubeStatsService, "verificar_credenciais", _ok)
    disparou = {"chamou": False}

    def _spy(coro, name=None):
        coro.close()  # evita "coroutine never awaited"
        disparou["chamou"] = True

    monkeypatch.setattr(projetos_router, "fire_and_forget", _spy)

    resposta = await projetos_router.sincronizar_youtube_stats()
    assert resposta["status"] == "iniciado"
    assert disparou["chamou"] is True


@pytest.mark.asyncio
async def test_endpoints_de_levantamento_json_e_csv(tmp_path):
    from app.routers.projetos import (
        levantamento_duracao_retencao,
        levantamento_titulo_desempenho,
        status_youtube_stats,
    )

    engine, factory = await _novo_banco(tmp_path)
    try:
        async with factory() as db:
            db.add(
                YoutubeVideoStat(
                    id="s1",
                    video_id="v1",
                    titulo="Título de teste: com dois pontos",
                    duracao_seg=600.0,
                    views=1000,
                    average_view_percentage=40.0,
                    average_view_duration_seg=120.0,
                    sincronizado_em=datetime.utcnow(),
                )
            )
            await db.commit()

        async with factory() as db:
            dur_json = await levantamento_duracao_retencao(formato="json", db=db)
            assert "faixas" in dur_json
            faixa_5_8 = next(f for f in dur_json["faixas"] if f["faixa"] == "8-12")
            assert faixa_5_8["videos"] == 1

            dur_csv = await levantamento_duracao_retencao(formato="csv", db=db)
            assert dur_csv.media_type.startswith("text/csv")
            assert dur_csv.body.decode("utf-8").startswith("faixa,videos")

            tit_json = await levantamento_titulo_desempenho(formato="json", db=db)
            assert "grupos" in tit_json

            tit_csv = await levantamento_titulo_desempenho(formato="csv", db=db)
            assert tit_csv.media_type.startswith("text/csv")

            estado = await status_youtube_stats(db=db)
            assert estado["total"] == 1
            assert estado["stale"] is False
    finally:
        await engine.dispose()
