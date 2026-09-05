"""D-472: o caminho manual da fábrica de shorts.

Serve os cortes que o automático não alcança — os que já tinham bruto antes da
E-030, os que tiveram o bruto descartado, e o teste da esteira sem reprocessar a
live inteira.

A regra que este arquivo guarda é a que protege trabalho já feito: quando o
bruto precisa ser refeito, a regeração roda com `refazer_transcricao=False,
refazer_cenas=False` — o modo que a D-160 criou justamente para isso. Se algum
dia alguém trocar esses flags, cenas, metadados e pós-produção de um corte
publicado seriam refeitos por causa de um clique em "gerar shorts".
"""

import pytest
import pytest_asyncio
from app.models import Base, Corte, MetadadoCorte, Projeto, Short, StatusShort
from app.services import shorts as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    from app import channel_paths

    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", factory)

    # D-528: a live precisa estar em disco — sem ela nao ha de onde extrair o
    # bruto, e o servico passou a recusar antes de acionar o worker.
    (tmp_path / "p1").mkdir(parents=True, exist_ok=True)
    (tmp_path / "p1" / "video.mkv").write_bytes(b"live")

    async with factory() as db:
        db.add(
            Projeto(id="p1", youtube_url="u", titulo_live="Live", arquivo_video_path="video.mkv")
        )
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                titulo_proposto="Corte antigo",
                inicio_seg=0.0,
                fim_seg=600.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:10:00.000",
                duracao_clip_seg=600.0,
                arquivo_clip_path="cortes/c1/clip_raw_1.mkv",
            )
        )
        db.add(MetadadoCorte(id="m1", corte_id="c1", is_fire=True))
        await db.commit()

    yield factory, tmp_path
    await engine.dispose()


def _criar_bruto(raiz):
    corte_dir = raiz / "p1" / "cortes" / "c1"
    corte_dir.mkdir(parents=True, exist_ok=True)
    (corte_dir / "clip_raw_1.mkv").write_bytes(b"x" * 2048)


@pytest.fixture
def espioes(monkeypatch):
    """Captura o que o caminho manual dispara, sem rodar render nem IA."""
    chamadas: dict = {"bruto": [], "sugestao": []}

    async def _fake_bruto(corte_id, *, refazer_transcricao=True, refazer_cenas=True):
        chamadas["bruto"].append(
            {
                "corte_id": corte_id,
                "refazer_transcricao": refazer_transcricao,
                "refazer_cenas": refazer_cenas,
            }
        )
        return {"status": "pronto", "clip_path": "x"}

    async def _fake_sugestao(corte_id):
        chamadas["sugestao"].append(corte_id)
        return {"shorts": [{"id": "s1"}], "descartes": []}

    from app.services.claude_ia import ClaudeIaService
    from app.services.export import ExportService

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", staticmethod(_fake_bruto))
    monkeypatch.setattr(ClaudeIaService, "sugerir_shorts_via_claude", staticmethod(_fake_sugestao))
    return chamadas


@pytest.mark.asyncio
async def test_elegibilidade_conta_fire_bruto_e_candidatos(ambiente):
    factory, raiz = ambiente
    _criar_bruto(raiz)
    async with factory() as db:
        db.add(Short(id="s1", corte_id="c1", numero=1, status=StatusShort.APROVADO))
        await db.commit()

    assert await servico.elegibilidade("c1") == {
        "is_fire": True,
        # D-502: a indicacao manual e uma marca SEPARADA do Fire, e `elegivel`
        # e o OU das duas — a tela pergunta uma coisa so.
        "candidato_shorts": False,
        "elegivel": True,
        "tem_bruto": True,
        "total_shorts": 1,
    }


@pytest.mark.asyncio
async def test_elegibilidade_de_corte_sem_fire(ambiente):
    factory, raiz = ambiente
    _criar_bruto(raiz)
    async with factory() as db:
        (await db.get(MetadadoCorte, "m1")).is_fire = False
        await db.commit()

    assert (await servico.elegibilidade("c1"))["is_fire"] is False


@pytest.mark.asyncio
async def test_com_bruto_em_disco_nao_regera_nada(ambiente, espioes):
    """O caso comum: o corte ja tem bruto, entao so falta chamar a IA."""
    _, raiz = ambiente
    _criar_bruto(raiz)

    resultado = await servico.gerar_shorts_do_corte("c1")

    assert espioes["bruto"] == []
    assert espioes["sugestao"] == ["c1"]
    assert resultado["bruto_regerado"] is False


@pytest.mark.asyncio
async def test_sem_bruto_regera_antes_de_sugerir(ambiente, espioes):
    resultado = await servico.gerar_shorts_do_corte("c1")

    assert len(espioes["bruto"]) == 1
    assert espioes["sugestao"] == ["c1"]
    assert resultado["bruto_regerado"] is True


@pytest.mark.asyncio
async def test_regeracao_NAO_refaz_transcricao_nem_cenas(ambiente, espioes):
    """A regra que protege a pos-producao: refaz o video e nada mais (D-160)."""
    await servico.gerar_shorts_do_corte("c1")

    (chamada,) = espioes["bruto"]
    assert chamada["refazer_transcricao"] is False
    assert chamada["refazer_cenas"] is False


@pytest.mark.asyncio
async def test_corte_sem_fire_e_recusado_com_instrucao(ambiente, espioes):
    factory, raiz = ambiente
    _criar_bruto(raiz)
    async with factory() as db:
        (await db.get(MetadadoCorte, "m1")).is_fire = False
        await db.commit()

    with pytest.raises(ValueError, match="Fire"):
        await servico.gerar_shorts_do_corte("c1")

    assert espioes["sugestao"] == []


@pytest.mark.asyncio
async def test_falha_na_regeracao_nao_chama_a_ia(ambiente, monkeypatch, espioes):
    """Sem bruto novo nao ha o que analisar; gastar a chamada seria desperdicio."""

    async def _falha(corte_id, *, refazer_transcricao=True, refazer_cenas=True):
        return {"status": "erro", "mensagem": "video original sumiu"}

    from app.services.export import ExportService

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", staticmethod(_falha))

    with pytest.raises(ValueError, match="video original sumiu"):
        await servico.gerar_shorts_do_corte("c1")

    assert espioes["sugestao"] == []


@pytest.mark.asyncio
async def test_corte_inexistente_levanta_lookup(ambiente, espioes):
    with pytest.raises(LookupError):
        await servico.gerar_shorts_do_corte("nao-existe")


@pytest.mark.asyncio
async def test_sem_a_live_em_disco_a_regeracao_nem_comeca(ambiente, monkeypatch):
    """D-528: recusa antes de acionar o worker, e diz o que fazer.

    Sem o video da live nao ha de onde extrair o trecho. Deixar o FFmpeg
    descobrir isso custaria a espera inteira para devolver uma mensagem que nao
    aponta caminho nenhum — e o caminho existe: rebaixar a live (D-527).
    """
    factory, tmp_path = ambiente
    (tmp_path / "p1" / "video.mkv").unlink()

    chamou_worker = False

    async def nao_deveria_chamar(*_a, **_k):
        nonlocal chamou_worker
        chamou_worker = True
        return {"status": "pronto"}

    monkeypatch.setattr(servico, "_regerar_bruto_preservando_pos_producao", nao_deveria_chamar)
    async with factory() as db:
        corte = await db.get(Corte, "c1")
        corte.arquivo_clip_path = ""
        await db.commit()

    with pytest.raises(ValueError, match="Baixe a live de novo"):
        await servico.gerar_shorts_do_corte("c1")

    assert not chamou_worker
