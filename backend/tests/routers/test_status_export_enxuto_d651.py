"""O status da exportação: uma consulta só e o disco fora do laço (D-651).

Era uma consulta de metadados POR CORTE e uma varredura de disco por corte,
dentro do event loop. Num projeto com 30 cortes aprovados, a tela custava 30
idas ao banco e 30 ao disco — e o app parava enquanto isso.

A resposta precisa continuar idêntica: é ela que pinta os selos de "pronto" na
tela de exportação.
"""

import threading

import pytest
import pytest_asyncio
from app.models import Base, Corte, MetadadoCorte, Projeto, StatusCorte
from app.routers import export as export_router
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

CASOS = (
    # (id, status, tem video final, tem grade, MB de overlay, tem metadados)
    ("c1", StatusCorte.PROCESSADO, True, True, 2.0, True),
    ("c2", StatusCorte.APROVADO, False, True, 0.5, True),
    ("c3", StatusCorte.APROVADO, False, False, 0.0, False),
)


def _artefatos_no_disco(base, corte_id, *, final, grade, overlay_mb):
    corte_dir = base / "proj-1" / "cortes" / corte_id
    for sub in ("upload_ready", "graded", "overlays"):
        (corte_dir / sub).mkdir(parents=True, exist_ok=True)
    if final:
        (corte_dir / "upload_ready" / "video.mp4").write_bytes(b"v")
    if grade:
        (corte_dir / "graded" / "clip_graded.mp4").write_bytes(b"g")
    if overlay_mb:
        (corte_dir / "overlays" / "chunk_001.webm").write_bytes(
            b"o" * int(overlay_mb * 1024 * 1024)
        )


@pytest_asyncio.fixture
async def projeto_com_tres_cortes(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'p.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Sessao = async_sessionmaker(engine, expire_on_commit=False)
    projetos = tmp_path / "projetos"

    async with Sessao() as db:
        db.add(Projeto(id="proj-1", youtube_url="https://youtu.be/abc12345678", titulo_live="Live"))
        for i, (cid, status, final, grade, mb, com_meta) in enumerate(CASOS, start=1):
            db.add(
                Corte(
                    id=cid,
                    projeto_id="proj-1",
                    numero=i,
                    titulo_proposto=f"Corte {i}",
                    inicio_hms="00:00:10",
                    fim_hms="00:02:00",
                    status=status,
                    arquivo_clip_path="cortes/x/clip.mkv" if final else "",
                )
            )
            if com_meta:
                db.add(
                    MetadadoCorte(
                        id=f"meta-{cid}",
                        corte_id=cid,
                        titulo_youtube=f"Título {i}",
                        descricao_youtube="desc" if final else "",
                        thumbnail_path="cortes/x/thumb.jpg" if final else "",
                    )
                )
            _artefatos_no_disco(projetos, cid, final=final, grade=grade, overlay_mb=mb)
        await db.commit()

    monkeypatch.setattr(export_router, "projetos_dir", lambda: projetos)
    async with Sessao() as db:
        yield db
    await engine.dispose()


@pytest.mark.asyncio
async def test_os_selos_de_pronto_continuam_os_mesmos(projeto_com_tres_cortes):
    resposta = await export_router.status_export("proj-1", projeto_com_tres_cortes)

    por_id = {item["corte_id"]: item for item in resposta["cortes"]}
    assert [item["corte_id"] for item in resposta["cortes"]] == ["c1", "c2", "c3"]

    # Vídeo final pronto arrasta as fases anteriores, mesmo sem o intermediário.
    assert por_id["c1"]["video_pronto"] and por_id["c1"]["grade_pronta"]
    assert por_id["c1"]["overlays_prontos"] and por_id["c1"]["pronto_publicar"]
    assert por_id["c1"]["titulo_youtube"] == "Título 1"

    # Meio do caminho: grade existe, overlay pequeno demais não conta.
    assert por_id["c2"]["grade_pronta"] is True
    assert por_id["c2"]["overlays_prontos"] is False
    assert por_id["c2"]["video_pronto"] is False
    assert por_id["c2"]["pronto_publicar"] is False

    # Sem metadados: os campos vêm nulos, não estouram.
    assert por_id["c3"]["titulo_youtube"] is None
    assert por_id["c3"]["metadados_completos"] is False


@pytest.mark.asyncio
async def test_o_disco_e_varrido_fora_do_event_loop(projeto_com_tres_cortes, monkeypatch):
    original = export_router._artefatos_de_cada_corte

    def na_thread(cortes):
        assert threading.current_thread() is not threading.main_thread(), (
            "a varredura de disco voltou para o event loop"
        )
        return original(cortes)

    monkeypatch.setattr(export_router, "_artefatos_de_cada_corte", na_thread)

    resposta = await export_router.status_export("proj-1", projeto_com_tres_cortes)

    assert len(resposta["cortes"]) == 3


@pytest.mark.asyncio
async def test_metadados_saem_numa_consulta_so(projeto_com_tres_cortes, monkeypatch):
    """O N+1: uma consulta por corte virava 30 idas ao banco num projeto cheio."""
    consultas = []
    execute_original = projeto_com_tres_cortes.execute

    async def contando(sql, *args, **kwargs):
        consultas.append(str(sql))
        return await execute_original(sql, *args, **kwargs)

    monkeypatch.setattr(projeto_com_tres_cortes, "execute", contando)

    await export_router.status_export("proj-1", projeto_com_tres_cortes)

    de_metadados = [sql for sql in consultas if "metadados_cortes" in sql]
    assert len(de_metadados) == 1, f"esperava 1 consulta de metadados, houve {len(de_metadados)}"
