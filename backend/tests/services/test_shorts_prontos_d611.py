"""D-611: a central de shorts prontos.

Protege a regra que decide o que SOME da tela — a mais cara de errar: um short
que some antes da hora fica esquecido fora de uma rede, e ninguém percebe.
"""

import json
from datetime import datetime

import pytest
import pytest_asyncio
from app.domain.short.shorts_prontos import plataformas_pendentes
from app.models import (
    Base,
    Corte,
    MetadadoShort,
    Projeto,
    PublicacaoShort,
    Short,
    StatusShort,
)
from app.services import shorts_prontos
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

REDES = ("youtube_shorts", "tiktok", "instagram_reels")


def _corte(corte_id: str, **extra) -> Corte:
    return Corte(
        id=corte_id,
        projeto_id="p1",
        numero=1,
        titulo_proposto=f"Corte {corte_id}",
        inicio_seg=0.0,
        fim_seg=600.0,
        inicio_hms="00:00:00.000",
        fim_hms="00:10:00.000",
        layout_youtube=json.dumps({}),
        **extra,
    )


def _short(short_id: str, corte_id: str) -> Short:
    return Short(
        id=short_id,
        corte_id=corte_id,
        numero=1,
        titulo_sugerido=f"Trecho {short_id}",
        inicio_seg=10.0,
        fim_seg=40.0,
        status=StatusShort.RENDERIZADO,
        arquivo_short_path=f"cortes/{corte_id}/shorts/{short_id}/short.mp4",
    )


def _publicado(alvo_id: str, plataforma: str) -> PublicacaoShort:
    return PublicacaoShort(
        id=f"{alvo_id}-{plataforma}",
        alvo_tipo="short",
        alvo_id=alvo_id,
        plataforma=plataforma,
        estado="publicado",
        publicado_em=datetime(2026, 9, 1),
    )


@pytest_asyncio.fixture
async def banco(monkeypatch, tmp_path):
    from app import channel_paths

    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    for corte_id, short_id in (
        ("c1", "falta_tudo"),
        ("c1", "falta_um"),
        ("c1", "no_ar"),
        ("c2", "de_finalizado"),
    ):
        pasta = tmp_path / "p1" / "cortes" / corte_id / "shorts" / short_id
        pasta.mkdir(parents=True)
        (pasta / "short.mp4").write_bytes(b"video")

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(shorts_prontos, "AsyncSessionLocal", factory)

    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u", titulo_live="A live"))
        db.add(_corte("c1"))
        db.add(_corte("c2", shorts_finalizados_em=datetime(2026, 9, 2)))
        db.add(_short("falta_tudo", "c1"))
        db.add(_short("falta_um", "c1"))
        db.add(_short("no_ar", "c1"))
        db.add(_short("de_finalizado", "c2"))
        db.add(_short("apagado", "c1"))  # renderizado, mas o MP4 sumiu do disco
        db.add(
            MetadadoShort(
                id="m1",
                short_id="falta_um",
                titulo_youtube="Post pronto",
                tags_youtube=json.dumps(["#pix", "#juros"]),
                capa_path="cortes/c1/shorts/falta_um/capa.jpg",
                capa_instante_seg=3.5,
            )
        )
        db.add(_publicado("falta_um", "youtube_shorts"))
        db.add(_publicado("falta_um", "tiktok"))
        for rede in REDES:
            db.add(_publicado("no_ar", rede))
        await db.commit()

    yield
    await engine.dispose()


def test_pendentes_ignora_o_tiktok_horizontal_do_corte():
    assert plataformas_pendentes(["tiktok_horizontal"]) == list(REDES)


@pytest.mark.asyncio
async def test_central_so_mostra_o_que_ainda_falta_em_alguma_rede(banco):
    prontos = {s["id"]: s for s in await shorts_prontos.listar_prontos()}

    assert set(prontos) == {"falta_tudo", "falta_um"}
    assert prontos["falta_tudo"]["pendentes"] == list(REDES)
    assert prontos["falta_um"]["pendentes"] == ["instagram_reels"]
    assert prontos["falta_um"]["publicadas"] == ["tiktok", "youtube_shorts"]


@pytest.mark.asyncio
async def test_cartao_traz_post_capa_e_de_onde_veio(banco):
    prontos = {s["id"]: s for s in await shorts_prontos.listar_prontos()}

    com_post = prontos["falta_um"]
    assert com_post["post"] == {"gerado": True, "titulo": "Post pronto", "hashtags": 2}
    assert com_post["capa"] == {"tem_capa": True, "instante_seg": 3.5}
    assert com_post["projeto_titulo"] == "A live"
    assert com_post["corte_titulo"] == "Corte c1"

    sem_nada = prontos["falta_tudo"]
    assert sem_nada["post"]["gerado"] is False
    assert sem_nada["capa"]["tem_capa"] is False
