"""D-575: junção de dois cortes vizinhos preservando o trabalho já feito.

Cobre `CorteService.juntar_cortes` e o endpoint `POST /cortes/{id}/juntar`
contra um SQLite em memória real — a junção apaga linha, move filhos e renumera
a lista, e mocks esconderiam exatamente o que pode quebrar aí.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, MetadadoCorte, Projeto, Short
from app.routers import cortes as cortes_router
from app.routers.cortes_schemas import JuntarCortesRequest
from app.services import corte as corte_module
from app.services.corte import CorteService
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def session_factory(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
def sem_resync(monkeypatch):
    """Neutraliza a re-sincronização da transcrição e registra os ids chamados."""
    chamados: list[str] = []

    async def _fake(corte_id, db=None):
        chamados.append(corte_id)

    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(_fake))
    return chamados


@pytest_asyncio.fixture(autouse=True)
def sem_disco(monkeypatch, tmp_path):
    """Aponta a raiz de projetos para um tmp — a junção apaga artefatos em disco."""
    monkeypatch.setattr(corte_module, "projetos_dir", lambda: tmp_path)


async def _seed(
    factory,
    *,
    corte_id,
    numero,
    inicio_seg,
    fim_seg,
    desvios=None,
    **campos,
):
    async with factory() as db:
        if await db.get(Projeto, "proj-1") is None:
            db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(
            Corte(
                id=corte_id,
                projeto_id="proj-1",
                numero=numero,
                inicio_seg=inicio_seg,
                fim_seg=fim_seg,
                inicio_hms=f"{inicio_seg}",
                fim_hms=f"{fim_seg}",
                desvios=json.dumps(desvios or []),
                **campos,
            )
        )
        await db.commit()


async def _par_de_cortes(factory, **extras_do_segundo):
    """Corte #1 de 0–100s e corte #2 de 120–200s: 20s de vão entre eles."""
    await _seed(
        factory,
        corte_id="c1",
        numero=1,
        inicio_seg=0.0,
        fim_seg=100.0,
        desvios=[{"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "A"}],
        titulo_proposto="Parte A",
        resumo="Resumo A",
    )
    await _seed(
        factory,
        corte_id="c2",
        numero=2,
        inicio_seg=120.0,
        fim_seg=200.0,
        desvios=[{"inicio_seg": 130.0, "fim_seg": 140.0, "motivo": "B"}],
        titulo_proposto="Parte B",
        resumo="Resumo B",
        **extras_do_segundo,
    )


# ─── O caso que motivou a feature ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_corte_resultante_vai_do_inicio_do_primeiro_ao_fim_do_segundo(
    session_factory, sem_resync
):
    await _par_de_cortes(session_factory)

    sobrevivente_id = await CorteService.juntar_cortes("c1", "c2")

    assert sobrevivente_id == "c1"
    async with session_factory() as db:
        corte = await db.get(Corte, "c1")
        assert await db.get(Corte, "c2") is None

    assert corte.inicio_seg == 0.0
    assert corte.fim_seg == 200.0
    assert corte.fim_hms == "200.0"


@pytest.mark.asyncio
async def test_o_vao_entre_os_cortes_vira_trecho_removido(session_factory, sem_resync):
    """Sem isto, 20s que não estavam em nenhum dos dois cortes entrariam de carona."""
    await _par_de_cortes(session_factory)

    await CorteService.juntar_cortes("c1", "c2")

    async with session_factory() as db:
        desvios = json.loads((await db.get(Corte, "c1")).desvios)

    assert [(d["inicio_seg"], d["fim_seg"]) for d in desvios] == [
        (10.0, 20.0),
        (100.0, 120.0),
        (130.0, 140.0),
    ]


@pytest.mark.asyncio
async def test_cortes_encostados_nao_ganham_desvio_de_vao(session_factory, sem_resync):
    await _seed(session_factory, corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=100.0)
    await _seed(session_factory, corte_id="c2", numero=2, inicio_seg=100.0, fim_seg=200.0)

    await CorteService.juntar_cortes("c1", "c2")

    async with session_factory() as db:
        assert json.loads((await db.get(Corte, "c1")).desvios) == []


@pytest.mark.asyncio
async def test_juntar_pelo_id_do_segundo_corte_da_o_mesmo_resultado(session_factory, sem_resync):
    """Quem sobrevive é quem começa antes, não quem está na rota."""
    await _par_de_cortes(session_factory)

    assert await CorteService.juntar_cortes("c2", "c1") == "c1"


# ─── O trabalho já feito ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cenas_do_segundo_corte_andam_pela_duracao_liquida_do_primeiro(
    session_factory, sem_resync
):
    """Primeiro corte: 100s de span − 10s de desvio = 90s de bruto."""
    await _par_de_cortes(
        session_factory,
        cenas_remotion=json.dumps([{"inicio": 5.0, "fim": 12.0, "titulo": "cena B"}]),
    )
    async with session_factory() as db:
        corte = await db.get(Corte, "c1")
        corte.cenas_remotion = json.dumps([{"inicio": 1.0, "fim": 4.0, "titulo": "cena A"}])
        await db.commit()

    await CorteService.juntar_cortes("c1", "c2")

    async with session_factory() as db:
        cenas = json.loads((await db.get(Corte, "c1")).cenas_remotion)

    assert [(c["titulo"], c["inicio"], c["fim"]) for c in cenas] == [
        ("cena A", 1.0, 4.0),
        ("cena B", 95.0, 102.0),
    ]


@pytest.mark.asyncio
async def test_regioes_do_layout_do_segundo_corte_tambem_andam(session_factory, sem_resync):
    await _par_de_cortes(
        session_factory,
        layout_youtube=json.dumps(
            {"modo_padrao": "full", "regioes": [{"inicio": 2.0, "fim": 8.0, "modo": "full"}]}
        ),
    )

    await CorteService.juntar_cortes("c1", "c2")

    async with session_factory() as db:
        layout = json.loads((await db.get(Corte, "c1")).layout_youtube)

    assert [(r["inicio"], r["fim"]) for r in layout["regioes"]] == [(92.0, 98.0)]


@pytest.mark.asyncio
async def test_shorts_do_corte_absorvido_sobrevivem_deslocados(session_factory, sem_resync):
    """Sem a adoção, o cascade delete-orphan levaria os shorts junto."""
    await _par_de_cortes(session_factory)
    async with session_factory() as db:
        db.add(Short(id="s1", corte_id="c2", numero=1, inicio_seg=10.0, fim_seg=40.0))
        await db.commit()

    await CorteService.juntar_cortes("c1", "c2")

    async with session_factory() as db:
        short = await db.get(Short, "s1")

    assert short is not None
    assert short.corte_id == "c1"
    assert (short.inicio_seg, short.fim_seg) == (100.0, 130.0)


@pytest.mark.asyncio
async def test_resumo_dos_dois_cortes_e_emendado(session_factory, sem_resync):
    await _par_de_cortes(session_factory)

    await CorteService.juntar_cortes("c1", "c2")

    async with session_factory() as db:
        corte = await db.get(Corte, "c1")

    assert corte.resumo == "Resumo A\n\nResumo B"
    # O título descreve a ENTRADA do corte, que continua sendo a do primeiro.
    assert corte.titulo_proposto == "Parte A"


@pytest.mark.asyncio
async def test_metadado_do_segundo_e_adotado_quando_o_primeiro_nao_tem(session_factory, sem_resync):
    await _par_de_cortes(session_factory)
    async with session_factory() as db:
        db.add(MetadadoCorte(id="m2", corte_id="c2", titulo_youtube="Título do B"))
        await db.commit()

    await CorteService.juntar_cortes("c1", "c2")

    async with session_factory() as db:
        metadado = await db.get(MetadadoCorte, "m2")

    assert metadado is not None
    assert metadado.corte_id == "c1"


@pytest.mark.asyncio
async def test_o_bruto_registrado_e_invalidado(session_factory, sem_resync):
    """O span mudou: anunciar 'bruto pronto' seria mentir sobre meio vídeo."""
    await _par_de_cortes(session_factory)
    async with session_factory() as db:
        corte = await db.get(Corte, "c1")
        corte.arquivo_clip_path = "cortes/c1/clip_raw.mkv"
        corte.duracao_clip_seg = 90.0
        corte.cenas_validadas = 1
        await db.commit()

    await CorteService.juntar_cortes("c1", "c2")

    async with session_factory() as db:
        corte = await db.get(Corte, "c1")

    assert corte.arquivo_clip_path == ""
    assert corte.duracao_clip_seg == 0.0
    assert corte.cenas_validadas == 0


@pytest.mark.asyncio
async def test_apaga_os_artefatos_de_video_do_corte_mesclado(session_factory, sem_resync, tmp_path):
    await _par_de_cortes(session_factory)
    pasta = tmp_path / "proj-1" / "cortes" / "c1"
    (pasta / "graded").mkdir(parents=True)
    (pasta / "clip_raw.mkv").write_bytes(b"x")
    (pasta / "graded" / "clip_graded.mp4").write_bytes(b"x")
    thumb = pasta / "thumbnail.png"
    thumb.write_bytes(b"x")

    await CorteService.juntar_cortes("c1", "c2")

    assert not (pasta / "clip_raw.mkv").exists()
    assert not (pasta / "graded").exists()
    # A capa é arte editorial, não deriva do span: fica.
    assert thumb.exists()


@pytest.mark.asyncio
async def test_transcricao_do_corte_mesclado_e_re_sincronizada(session_factory, sem_resync):
    await _par_de_cortes(session_factory)

    await CorteService.juntar_cortes("c1", "c2")

    assert sem_resync == ["c1"]


# ─── Recusas ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_recusa_juntar_corte_com_ele_mesmo(session_factory, sem_resync):
    await _par_de_cortes(session_factory)

    with pytest.raises(ValueError, match="dois cortes diferentes"):
        await CorteService.juntar_cortes("c1", "c1")


@pytest.mark.asyncio
async def test_recusa_quando_ha_outro_corte_entre_os_dois(session_factory, sem_resync):
    """O vão viraria desvio e engoliria o corte do meio."""
    await _par_de_cortes(session_factory)
    await _seed(session_factory, corte_id="c-meio", numero=3, inicio_seg=105.0, fim_seg=115.0)

    with pytest.raises(ValueError, match="outro corte entre"):
        await CorteService.juntar_cortes("c1", "c2")


@pytest.mark.asyncio
async def test_recusa_juntar_corte_ja_publicado(session_factory, sem_resync):
    await _par_de_cortes(session_factory, youtube_video_id="abc123")

    with pytest.raises(ValueError, match="já foi publicado"):
        await CorteService.juntar_cortes("c1", "c2")


@pytest.mark.asyncio
async def test_recusa_corte_inexistente(session_factory, sem_resync):
    await _par_de_cortes(session_factory)

    with pytest.raises(ValueError, match="não encontrado"):
        await CorteService.juntar_cortes("c1", "fantasma")


# ─── Endpoint ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_endpoint_sem_corpo_junta_com_o_proximo_corte(session_factory, sem_resync):
    await _par_de_cortes(session_factory)

    async with session_factory() as db:
        resposta = await cortes_router.juntar_cortes("c1", None, db)

    assert resposta["id"] == "c1"
    assert resposta["fim_seg"] == 200.0


@pytest.mark.asyncio
async def test_endpoint_no_ultimo_corte_avisa_que_nao_ha_com_quem_juntar(
    session_factory, sem_resync
):
    await _par_de_cortes(session_factory)

    async with session_factory() as db:
        with pytest.raises(HTTPException) as excinfo:
            await cortes_router.juntar_cortes("c2", None, db)

    assert excinfo.value.status_code == 400
    assert "último corte" in excinfo.value.detail


@pytest.mark.asyncio
async def test_endpoint_traduz_recusa_do_servico_em_400(session_factory, sem_resync):
    await _par_de_cortes(session_factory, youtube_video_id="abc123")

    async with session_factory() as db:
        with pytest.raises(HTTPException) as excinfo:
            await cortes_router.juntar_cortes("c1", JuntarCortesRequest(outro_corte_id="c2"), db)

    assert excinfo.value.status_code == 400
