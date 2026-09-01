"""D-466: a orquestração do render do short.

O que este arquivo guarda é a ORDEM e o que cada passo recebe. Errar aqui não
produz exceção: produz um MP4 com a legenda gradada junto com o vídeo, ou com o
recorte no lugar errado — coisas que só se veem assistindo.

O worker é dublê. Rodar ffmpeg e Remotion de verdade aqui levaria minutos e
exigiria bruto, bundle e headless shell; o que precisa de teste é a decisão,
não a execução.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto, Short, StatusShort
from app.services import render_short
from app.services.transcricao_fiel import TranscricaoFiel
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    from app import channel_paths
    from app.services import legendas_short, transcricao_fiel

    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(render_short, "projetos_dir", lambda: tmp_path)

    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    corte_dir.mkdir(parents=True)
    (corte_dir / "clip_raw_1.mkv").write_bytes(b"x" * 2048)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(render_short, "AsyncSessionLocal", factory)

    async def _transcricao(corte_id):
        return TranscricaoFiel(palavras=[], fonte="auto_legenda")

    monkeypatch.setattr(transcricao_fiel, "obter_do_corte", _transcricao)
    monkeypatch.setattr(legendas_short.transcricao_fiel, "obter_do_corte", _transcricao)

    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=600.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:10:00.000",
                duracao_clip_seg=600.0,
                arquivo_clip_path="cortes/c1/clip_raw_1.mkv",
            )
        )
        db.add(
            Short(
                id="s1",
                corte_id="c1",
                numero=1,
                inicio_seg=10.0,
                fim_seg=45.0,
                cenas_remotion=json.dumps([{"tipo": "hook", "inicio": 0, "fim": 2, "texto": "oi"}]),
            )
        )
        await db.commit()

    yield factory, tmp_path
    await engine.dispose()


@pytest.fixture
def jobs(monkeypatch):
    """Captura os despachos em vez de rodar ffmpeg/Remotion de verdade."""
    capturados: list[dict] = []

    async def _fake(job_id, cmd, *, cwd, category, timeout):
        capturados.append({"id": job_id, "cmd": cmd, "cwd": cwd, "category": category})

    monkeypatch.setattr(render_short, "_despachar", _fake)
    return capturados


@pytest.mark.asyncio
async def test_os_tres_passos_saem_na_ordem(ambiente, jobs):
    await render_short.renderizar_short("s1")

    assert [j["id"] for j in jobs] == ["s1_recorte", "s1_camada", "s1_composicao"]


@pytest.mark.asyncio
async def test_recorte_usa_o_intervalo_do_short(ambiente, jobs):
    await render_short.renderizar_short("s1")

    cmd = jobs[0]["cmd"]
    assert cmd[cmd.index("-ss") + 1] == "10.0"
    assert cmd[cmd.index("-t") + 1] == "35.0"


@pytest.mark.asyncio
async def test_recorte_sai_em_9x16(ambiente, jobs):
    cmd = (await _render_e_pegar(jobs, 0))["cmd"]

    assert "scale=1080:1920" in cmd[cmd.index("-vf") + 1]


@pytest.mark.asyncio
async def test_camada_renderiza_a_composicao_vertical_com_alpha(ambiente, jobs):
    cmd = (await _render_e_pegar(jobs, 1))["cmd"]

    assert render_short.COMPOSICAO_CAMADA in cmd
    # ProRes 4444 e o unico codec com alpha confiavel neste projeto.
    assert "--codec=prores" in cmd


@pytest.mark.asyncio
async def test_props_da_camada_levam_cenas_captions_e_duracao(ambiente, jobs):
    _, raiz = ambiente
    await render_short.renderizar_short("s1")

    props = json.loads(
        (raiz / "p1" / "cortes" / "c1" / "shorts" / "s1" / "camada.props.json").read_text(
            encoding="utf-8"
        )
    )
    assert props["duracaoSeg"] == 35.0
    assert props["cenas"][0]["tipo"] == "hook"
    assert props["captions"] == []


@pytest.mark.asyncio
async def test_composicao_poe_a_camada_por_cima_do_video(ambiente, jobs):
    cmd = (await _render_e_pegar(jobs, 2))["cmd"]

    assert "overlay=x=0:y=0:eof_action=pass:format=auto" in " ".join(cmd)
    assert "-shortest" in cmd


@pytest.mark.asyncio
async def test_short_pronto_vira_renderizado_com_caminho_relativo(ambiente, jobs):
    factory, _ = ambiente

    resultado = await render_short.renderizar_short("s1")

    assert resultado["arquivo_short_path"].endswith("short.mp4")
    assert not resultado["arquivo_short_path"].startswith("C:")
    async with factory() as db:
        short = await db.get(Short, "s1")
        assert short.status == StatusShort.RENDERIZADO
        assert short.arquivo_short_path == resultado["arquivo_short_path"]


@pytest.mark.asyncio
async def test_sem_bruto_em_disco_recusa_antes_de_gastar_render(ambiente, jobs):
    factory, raiz = ambiente
    (raiz / "p1" / "cortes" / "c1" / "clip_raw_1.mkv").unlink()

    with pytest.raises(ValueError, match="bruto"):
        await render_short.renderizar_short("s1")

    assert jobs == []


@pytest.mark.asyncio
async def test_intervalo_invertido_recusa_antes_de_gastar_render(ambiente, jobs):
    factory, _ = ambiente
    async with factory() as db:
        short = await db.get(Short, "s1")
        short.fim_seg = short.inicio_seg
        await db.commit()

    with pytest.raises(ValueError, match="intervalo"):
        await render_short.renderizar_short("s1")

    assert jobs == []


@pytest.mark.asyncio
async def test_short_inexistente_levanta_lookup(ambiente, jobs):
    with pytest.raises(LookupError):
        await render_short.renderizar_short("nao-existe")


async def _render_e_pegar(jobs: list[dict], indice: int) -> dict:
    await render_short.renderizar_short("s1")
    return jobs[indice]
