"""O processamento final do clip, com o FFmpeg de mentira (D-719).

O módulo tinha 16% de cobertura e nenhum teste com o nome dele. Aqui o FFmpeg
é um dublê que só cria o arquivo de saída — o que se prova é o que o serviço
decide: o comando da prévia, quando copiar em vez de re-encodar, a ordem da
concatenação, a limpeza dos temporários mesmo na falha, e que uma versão de
filtro que falha não derruba as outras.
"""

import json
import types
from pathlib import Path

import pytest
import pytest_asyncio
from app.infrastructure import ffmpeg_runner
from app.models import Base, Corte, MetadadoCorte, Projeto
from app.services import export_processamento as modulo
from app.services.export import ExportService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def _resultado(returncode=0, stderr_tail=""):
    return types.SimpleNamespace(returncode=returncode, stderr_tail=stderr_tail)


@pytest.fixture
def ffmpeg(monkeypatch):
    """`run_ffmpeg` e `run_ffmpeg_simple` falsos: guardam o comando e criam a saída."""
    estado = {"comandos": [], "falhar": set(), "returncode": 0}

    async def run_ffmpeg(cmd, *, label, timeout):
        estado["comandos"].append((label, cmd))
        Path(cmd[-1]).write_bytes(b"x")
        return _resultado(estado["returncode"], "stderr do ffmpeg")

    async def run_ffmpeg_simple(cmd, *, label):
        estado["comandos"].append((label, cmd))
        if label in estado["falhar"]:
            raise RuntimeError(f"{label} quebrou")
        Path(cmd[-1]).write_bytes(b"x")

    monkeypatch.setattr(modulo, "run_ffmpeg", run_ffmpeg)
    monkeypatch.setattr(ffmpeg_runner, "run_ffmpeg_simple", run_ffmpeg_simple)
    return estado


# ─── Normalização ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_normaliza_com_o_comando_do_filtro(ffmpeg, tmp_path):
    saida = tmp_path / "normalizado.mkv"

    await ExportService._normalizar_audio(tmp_path / "bruto.mkv", saida, filtro="nenhum")

    ((label, cmd),) = ffmpeg["comandos"]
    esperado = modulo.build_normalize_cmd(
        tmp_path / "bruto.mkv", saida, filtro_vf=modulo.get_filtro_vf("nenhum")
    )
    assert (label, cmd) == ("ffmpeg_normalizar", esperado)


@pytest.mark.asyncio
async def test_a_previa_corta_nos_primeiros_segundos(ffmpeg, tmp_path):
    saida = tmp_path / "preview.mp4"

    await ExportService._normalizar_audio(tmp_path / "b.mkv", saida, preview_segundos=10)

    ((_, cmd),) = ffmpeg["comandos"]
    assert cmd[:5] == ["ffmpeg", "-y", "-nostdin", "-t", "10"]
    assert cmd[5:] == modulo.build_normalize_cmd(tmp_path / "b.mkv", saida, filtro_vf=None)[3:]


@pytest.mark.asyncio
async def test_normalizacao_que_falha_diz_o_stderr(ffmpeg, tmp_path):
    ffmpeg["returncode"] = 1

    with pytest.raises(RuntimeError, match="stderr do ffmpeg"):
        await ExportService._normalizar_audio(tmp_path / "b.mkv", tmp_path / "s.mkv")


@pytest.mark.asyncio
async def test_normalizacao_sem_arquivo_de_saida_e_falha(monkeypatch, tmp_path):
    async def sem_saida(cmd, *, label, timeout):
        return _resultado()

    monkeypatch.setattr(modulo, "run_ffmpeg", sem_saida)

    with pytest.raises(RuntimeError, match="not created"):
        await ExportService._normalizar_audio(tmp_path / "b.mkv", tmp_path / "s.mkv")


# ─── Intro e outro ───────────────────────────────────────────────────────────


@pytest.fixture
def assets(monkeypatch, tmp_path):
    pasta = tmp_path / "assets"
    (pasta / "intro").mkdir(parents=True)
    monkeypatch.setattr(modulo.settings, "assets_dir", str(pasta))
    return pasta / "intro"


@pytest.mark.asyncio
async def test_sem_intro_nem_outro_so_copia(ffmpeg, assets, tmp_path):
    clip = tmp_path / "clip.mkv"
    clip.write_bytes(b"conteudo")

    await ExportService._adicionar_intro_outro(clip, tmp_path / "final.mp4")

    assert (tmp_path / "final.mp4").read_bytes() == b"conteudo"
    assert ffmpeg["comandos"] == []


@pytest.mark.asyncio
async def test_intro_e_outro_normalizam_cada_parte_e_concatenam_em_ordem(ffmpeg, assets, tmp_path):
    (assets / "intro.mp4").write_bytes(b"i")
    (assets / "outro.mp4").write_bytes(b"o")
    clip = tmp_path / "saida" / "clip.mkv"
    clip.parent.mkdir()
    clip.write_bytes(b"c")
    final = clip.parent / "final.mp4"
    listas = []

    original = ffmpeg_runner.run_ffmpeg_simple

    async def guardar_a_lista(cmd, *, label):
        if label == "ffmpeg_concat":
            listas.append(Path(cmd[cmd.index("-i") + 1]).read_text(encoding="utf-8"))
        await original(cmd, label=label)

    ffmpeg_runner.run_ffmpeg_simple = guardar_a_lista
    try:
        await ExportService._adicionar_intro_outro(clip, final)
    finally:
        ffmpeg_runner.run_ffmpeg_simple = original

    labels = [label for label, _ in ffmpeg["comandos"]]
    assert labels == [
        "concat-normalize-0",
        "concat-normalize-1",
        "concat-normalize-2",
        "ffmpeg_concat",
    ]
    entradas = [cmd[cmd.index("-i") + 1] for label, cmd in ffmpeg["comandos"][:3]]
    assert entradas == [str(assets / "intro.mp4"), str(clip), str(assets / "outro.mp4")]
    temp = clip.parent / ".temp_concat"
    assert listas == ["\n".join(f"file '{temp / f'part_{i}.mkv'}'" for i in range(3))]
    assert final.exists() and not temp.exists()


@pytest.mark.asyncio
async def test_parte_que_nao_normaliza_para_tudo(ffmpeg, assets, tmp_path):
    (assets / "intro.mp4").write_bytes(b"i")
    ffmpeg["falhar"].add("concat-normalize-0")

    with pytest.raises(RuntimeError, match="normalizar parte 0"):
        await ExportService._adicionar_intro_outro(tmp_path / "clip.mkv", tmp_path / "f.mp4")


@pytest.mark.asyncio
async def test_concatenacao_que_falha_limpa_os_temporarios(ffmpeg, assets, tmp_path):
    (assets / "outro.mp4").write_bytes(b"o")
    ffmpeg["falhar"].add("ffmpeg_concat")

    with pytest.raises(RuntimeError, match="ffmpeg_concat falhou"):
        await ExportService._adicionar_intro_outro(tmp_path / "clip.mkv", tmp_path / "f.mp4")

    assert not (tmp_path / ".temp_concat").exists()


# ─── Metadados e versões por filtro ──────────────────────────────────────────


@pytest_asyncio.fixture
async def banco(monkeypatch, tmp_path):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(modulo, "AsyncSessionLocal", fabrica)
    monkeypatch.setattr(modulo, "projetos_dir", lambda: tmp_path / "projetos")
    monkeypatch.setattr(modulo, "resolver_do_projeto", lambda rel, _pid: tmp_path / rel)
    async with fabrica() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(Corte(id="c1", projeto_id="p1", numero=1, arquivo_clip_path="clip.mkv"))
        await db.commit()
    yield fabrica
    await engine.dispose()


@pytest.mark.asyncio
async def test_metadados_txt_prontos_para_o_studio(banco, tmp_path):
    async with banco() as db:
        db.add(
            MetadadoCorte(
                id="m1",
                corte_id="c1",
                titulo_youtube="Título",
                descricao_youtube="Descrição",
                tags_youtube=json.dumps(["a", "b"]),
            )
        )
        await db.commit()

    await ExportService._gerar_metadados_txt("c1", tmp_path)

    assert (tmp_path / "metadados.txt").read_text(encoding="utf-8") == (
        "=== TÍTULO ===\nTítulo\n\n=== DESCRIÇÃO ===\nDescrição\n\n=== TAGS ===\na, b\n"
    )


@pytest.mark.asyncio
async def test_sem_metadado_nao_escreve_arquivo(banco, tmp_path):
    await ExportService._gerar_metadados_txt("c1", tmp_path)

    assert not (tmp_path / "metadados.txt").exists()


@pytest.fixture
def versoes(monkeypatch, banco, tmp_path):
    """Normalização e intro/outro falsas; `falhar` escolhe o filtro que quebra."""
    estado = {"falhar": set(), "normalizados": []}
    (tmp_path / "clip.mkv").write_bytes(b"c")

    async def normalizar(entrada, saida, filtro="nenhum", preview_segundos=None):
        estado["normalizados"].append((filtro, saida.name, preview_segundos))
        if filtro in estado["falhar"]:
            raise RuntimeError("filtro quebrou")
        saida.write_bytes(b"n")

    async def intro_outro(clip, saida):
        saida.write_bytes(b"f")

    monkeypatch.setattr(ExportService, "_normalizar_audio", staticmethod(normalizar))
    monkeypatch.setattr(ExportService, "_adicionar_intro_outro", staticmethod(intro_outro))
    return estado


def _pasta_das_versoes(tmp_path):
    return tmp_path / "projetos" / "p1" / "cortes" / "c1" / "versoes"


@pytest.mark.asyncio
async def test_previas_por_filtro_e_o_que_falha_nao_para_as_outras(versoes, tmp_path):
    filtros = list(modulo.FILTROS_CINEMA)[:2]
    versoes["falhar"].add(filtros[0])
    obsoleta = _pasta_das_versoes(tmp_path) / "filtro_que_saiu"
    obsoleta.mkdir(parents=True)

    await ExportService.processar_multiversion("c1", filtros, preview=True, preview_segundos=7)

    pasta = _pasta_das_versoes(tmp_path)
    assert sorted(versoes["normalizados"]) == sorted((f, "preview.mp4", 7) for f in filtros)
    assert not (pasta / filtros[0] / "preview.mp4").exists()
    assert (pasta / filtros[1] / "preview.mp4").exists()
    for f in filtros:
        meta = json.loads((pasta / f / "meta.json").read_text(encoding="utf-8"))
        assert (meta["filtro"], meta["preview"]) == (f, True)
    assert not obsoleta.exists()


@pytest.mark.asyncio
async def test_versao_completa_passa_pela_intro_e_vira_video_mp4(versoes, tmp_path):
    filtro = next(iter(modulo.FILTROS_CINEMA))

    await ExportService.processar_multiversion("c1", [filtro])

    pasta = _pasta_das_versoes(tmp_path) / filtro
    assert (pasta / "video.mp4").read_bytes() == b"f"
    assert versoes["normalizados"] == [(filtro, "clip_normalized.mkv", None)]


@pytest.mark.asyncio
async def test_sem_filtros_pedidos_gera_todos(versoes, tmp_path):
    await ExportService.processar_multiversion("c1", preview=True)

    assert {f for f, _, _ in versoes["normalizados"]} == set(modulo.FILTROS_CINEMA)


@pytest.mark.asyncio
async def test_corte_sem_bruto_ou_bruto_sumido_nao_gera_nada(versoes, banco, tmp_path):
    await ExportService.processar_multiversion("nao-existe", ["x"])
    (tmp_path / "clip.mkv").unlink()
    await ExportService.processar_multiversion("c1", ["x"])

    assert versoes["normalizados"] == []
    assert not _pasta_das_versoes(tmp_path).exists()
