"""A moldura da capa segue as marcas editoriais do corte.

Exercita SQLite em memória e uma pasta de projetos temporária, porque o que
importa aqui é o efeito em DISCO: qual PNG acabou colado na capa publicada.

As molduras de teste são chapadas e de cores diferentes — o pixel do canto diz
qual foi usada, sem depender do desenho real do canal.
"""

import io
import os

import pytest
import pytest_asyncio
from app.core import channel_paths
from app.models import Base, Corte, MetadadoCorte, Projeto
from app.services import thumbnail as thumbnail_module
from app.services.thumbnail import ThumbnailService
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Cor de cada moldura, para reconhecê-la pelo pixel do canto da capa.
CORES = {
    "thumb_padrao.png": (20, 200, 90),
    "thumb_fire.png": (240, 90, 20),
    "thumb_livro.png": (30, 120, 240),
    "thumb_fire_livro.png": (250, 220, 40),
}

CAPA = (120, 120, 120)
LARGURA, ALTURA = 160, 90
BANDA = 10


def _escrever_molduras(pasta, nomes=tuple(CORES)):
    pasta.mkdir(parents=True, exist_ok=True)
    for nome in nomes:
        moldura = Image.new("RGBA", (LARGURA, ALTURA), (*CORES[nome], 255))
        miolo = Image.new("RGBA", (LARGURA - BANDA * 2, ALTURA - BANDA * 2), (0, 0, 0, 0))
        moldura.paste(miolo, (BANDA, BANDA))
        moldura.save(pasta / nome)


def _capa_crua() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (LARGURA, ALTURA), CAPA).save(buffer, "PNG")
    return buffer.getvalue()


def _moldura_usada(caminho: str) -> str | None:
    """Qual moldura está colada na capa, lida pelo pixel do canto."""
    canto = Image.open(caminho).convert("RGB").getpixel((0, 0))
    for nome, cor in CORES.items():
        if canto == cor:
            return nome
    return None


@pytest_asyncio.fixture
async def cenario(tmp_path, monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(thumbnail_module, "AsyncSessionLocal", sf)
    monkeypatch.setattr(thumbnail_module, "projetos_dir", lambda: tmp_path / "projetos")
    # `resolver_do_projeto` chama `projetos_dir()` do namespace do PRÓPRIO
    # channel_paths — trocar só o nome importado no serviço deixaria a
    # reemolduração procurando a capa na raiz de dados de verdade.
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path / "projetos")

    molduras = tmp_path / "molduras"
    monkeypatch.setattr(
        thumbnail_module,
        "moldura_thumbnail_path",
        lambda arquivo: (molduras / arquivo) if (molduras / arquivo).is_file() else None,
    )

    async with sf() as db:
        db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(Corte(id="corte-1", projeto_id="proj-1", numero=1, is_leitura=0))
        db.add(MetadadoCorte(id="meta-1", corte_id="corte-1"))
        await db.commit()

    yield sf, molduras, tmp_path
    await engine.dispose()


async def _marcar(sf, *, fire=None, leitura=None):
    async with sf() as db:
        corte = await db.get(Corte, "corte-1")
        if fire is not None:
            corte.is_fire = fire
        if leitura is not None:
            corte.is_leitura = leitura
        await db.commit()


class TestMolduraNoUpload:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("fire", "leitura", "esperada"),
        [
            (0, 0, "thumb_padrao.png"),
            (1, 0, "thumb_fire.png"),
            (0, 1, "thumb_livro.png"),
            (1, 1, "thumb_fire_livro.png"),
        ],
    )
    async def test_cada_marca_traz_a_sua_moldura(self, cenario, fire, leitura, esperada):
        sf, molduras, _ = cenario
        _escrever_molduras(molduras)
        await _marcar(sf, fire=fire, leitura=leitura)

        caminho = await ThumbnailService.upload_manual("corte-1", _capa_crua(), "capa.png")

        assert _moldura_usada(caminho) == esperada

    @pytest.mark.asyncio
    async def test_sem_a_exata_cai_para_a_padrao(self, cenario):
        """Canal com só a padrão ainda emoldura — não publica capa crua."""
        sf, molduras, _ = cenario
        _escrever_molduras(molduras, nomes=("thumb_padrao.png",))
        await _marcar(sf, fire=1, leitura=1)

        caminho = await ThumbnailService.upload_manual("corte-1", _capa_crua(), "capa.png")

        assert _moldura_usada(caminho) == "thumb_padrao.png"

    @pytest.mark.asyncio
    async def test_canal_sem_moldura_nenhuma_publica_a_capa_crua(self, cenario):
        sf, _, _ = cenario

        caminho = await ThumbnailService.upload_manual("corte-1", _capa_crua(), "capa.png")

        assert open(caminho, "rb").read() == _capa_crua()

    @pytest.mark.asyncio
    async def test_a_arte_crua_fica_guardada_ao_lado(self, cenario):
        sf, molduras, _ = cenario
        _escrever_molduras(molduras)

        caminho = await ThumbnailService.upload_manual("corte-1", _capa_crua(), "capa.png")

        arte = thumbnail_module._caminho_da_arte(caminho)
        assert open(arte, "rb").read() == _capa_crua()


class TestReaplicarQuandoAMarcaMuda:
    """Fire e Leitura costumam ser decididos DEPOIS que a capa entrou."""

    @pytest.mark.asyncio
    async def test_marcar_fire_troca_a_moldura_da_capa_ja_publicada(self, cenario):
        sf, molduras, _ = cenario
        _escrever_molduras(molduras)
        caminho = await ThumbnailService.upload_manual("corte-1", _capa_crua(), "capa.png")
        assert _moldura_usada(caminho) == "thumb_padrao.png"

        await _marcar(sf, fire=1)
        assert await ThumbnailService.reaplicar_moldura("corte-1") is True

        assert _moldura_usada(caminho) == "thumb_fire.png"

    @pytest.mark.asyncio
    async def test_desmarcar_volta_para_a_padrao(self, cenario):
        """A ida e a volta: desmarcar tem que desfazer, não acumular."""
        sf, molduras, _ = cenario
        _escrever_molduras(molduras)
        await _marcar(sf, fire=1, leitura=1)
        caminho = await ThumbnailService.upload_manual("corte-1", _capa_crua(), "capa.png")

        await _marcar(sf, fire=0, leitura=0)
        await ThumbnailService.reaplicar_moldura("corte-1")

        assert _moldura_usada(caminho) == "thumb_padrao.png"

    @pytest.mark.asyncio
    async def test_o_miolo_da_capa_nao_degrada_a_cada_troca(self, cenario):
        """A prova contra moldura sobre moldura.

        Cada reaplicação parte da arte crua, nunca da capa já emoldurada. Se
        partisse, a banda de uma se somaria à da outra e a capa iria encolhendo
        de moldura em moldura, sem ninguém perceber.
        """
        sf, molduras, _ = cenario
        _escrever_molduras(molduras)
        caminho = await ThumbnailService.upload_manual("corte-1", _capa_crua(), "capa.png")

        for fire, leitura in [(1, 0), (1, 1), (0, 1), (0, 0)]:
            await _marcar(sf, fire=fire, leitura=leitura)
            await ThumbnailService.reaplicar_moldura("corte-1")

        emoldurada = Image.open(caminho).convert("RGB")
        # O pixel logo DENTRO da banda ainda é capa, não moldura empilhada.
        assert emoldurada.getpixel((BANDA + 2, BANDA + 2)) == CAPA

    @pytest.mark.asyncio
    async def test_capa_antiga_sem_arte_guardada_nao_e_remoldurada(self, cenario):
        """Capas anteriores a este fluxo não têm original — carimbar de novo
        empilharia molduras. A ausência do `_arte` é o que as protege."""
        sf, molduras, tmp_path = cenario
        _escrever_molduras(molduras)
        thumb_dir = tmp_path / "projetos" / "proj-1" / "thumbnails"
        thumb_dir.mkdir(parents=True, exist_ok=True)
        antiga = thumb_dir / "thumb_corte-1.png"
        antiga.write_bytes(_capa_crua())
        async with sf() as db:
            meta = await db.get(MetadadoCorte, "meta-1")
            meta.thumbnail_path = str(antiga)
            await db.commit()

        await _marcar(sf, fire=1)

        assert await ThumbnailService.reaplicar_moldura("corte-1") is False
        assert antiga.read_bytes() == _capa_crua()

    @pytest.mark.asyncio
    async def test_corte_sem_capa_nao_faz_nada(self, cenario):
        sf, molduras, _ = cenario
        _escrever_molduras(molduras)

        assert await ThumbnailService.reaplicar_moldura("corte-1") is False


class TestGatilhosDeMarca:
    @pytest.mark.asyncio
    async def test_toggle_fire_reemoldura_sozinho(self, cenario, monkeypatch):
        """O gatilho de verdade: ligar o Fire na tela troca a moldura."""
        from app.services import metadados as metadados_module

        sf, molduras, _ = cenario
        monkeypatch.setattr(metadados_module, "AsyncSessionLocal", sf)
        _escrever_molduras(molduras)
        caminho = await ThumbnailService.upload_manual("corte-1", _capa_crua(), "capa.png")

        await metadados_module.MetadadosService.toggle_fire("corte-1")

        assert _moldura_usada(caminho) == "thumb_fire.png"

    @pytest.mark.asyncio
    async def test_marcar_leitura_no_corte_reemoldura_sozinho(self, cenario, monkeypatch):
        from app.services import corte as corte_module

        sf, molduras, _ = cenario
        monkeypatch.setattr(corte_module, "AsyncSessionLocal", sf)
        _escrever_molduras(molduras)
        caminho = await ThumbnailService.upload_manual("corte-1", _capa_crua(), "capa.png")

        async with sf() as db:
            await corte_module.CorteService.atualizar(
                db, "corte-1", corte_module.AtualizarCorteDTO(is_leitura=1)
            )

        assert _moldura_usada(caminho) == "thumb_livro.png"


def test_o_diretorio_de_molduras_do_canal_resolve_um_nome_por_vez(tmp_path, monkeypatch):
    """`channel_paths` resolve UM nome; a preferência é regra do domínio."""
    monkeypatch.setattr(channel_paths, "_channel_assets_root", lambda: tmp_path)
    _escrever_molduras(tmp_path / "moldura", nomes=("thumb_fire.png",))

    assert channel_paths.moldura_thumbnail_path("thumb_fire.png") is not None
    assert channel_paths.moldura_thumbnail_path("thumb_livro.png") is None
    assert os.path.basename(str(channel_paths.moldura_thumbnail_path("thumb_fire.png"))) == (
        "thumb_fire.png"
    )


class TestBotaoAplicarMoldura:
    """O botão da tela: emoldurar a capa que já está publicada."""

    @pytest.mark.asyncio
    async def test_emoldura_capa_antiga_que_nunca_passou_por_aqui(self, cenario):
        """As capas do acervo não têm `_arte`; o publicado É a arte delas."""
        sf, molduras, tmp_path = cenario
        _escrever_molduras(molduras)
        thumb_dir = tmp_path / "projetos" / "proj-1" / "thumbnails"
        thumb_dir.mkdir(parents=True, exist_ok=True)
        antiga = thumb_dir / "thumb_corte-1.png"
        antiga.write_bytes(_capa_crua())
        async with sf() as db:
            meta = await db.get(MetadadoCorte, "meta-1")
            meta.thumbnail_path = str(antiga)
            await db.commit()

        resultado = await ThumbnailService.aplicar_moldura("corte-1")

        assert resultado["moldura"] == "thumb_padrao.png"
        assert _moldura_usada(str(antiga)) == "thumb_padrao.png"

    @pytest.mark.asyncio
    async def test_clicar_duas_vezes_nao_empilha_moldura(self, cenario):
        """A prova de que guardar o `_arte` ANTES de colar era o essencial.

        Sem isso, o segundo clique leria a capa já emoldurada como se fosse arte
        e somaria uma banda à outra, encolhendo a imagem a cada clique.
        """
        sf, molduras, tmp_path = cenario
        _escrever_molduras(molduras)
        thumb_dir = tmp_path / "projetos" / "proj-1" / "thumbnails"
        thumb_dir.mkdir(parents=True, exist_ok=True)
        antiga = thumb_dir / "thumb_corte-1.png"
        antiga.write_bytes(_capa_crua())
        async with sf() as db:
            meta = await db.get(MetadadoCorte, "meta-1")
            meta.thumbnail_path = str(antiga)
            await db.commit()

        await ThumbnailService.aplicar_moldura("corte-1")
        primeira = antiga.read_bytes()
        await ThumbnailService.aplicar_moldura("corte-1")

        assert antiga.read_bytes() == primeira
        # O pixel logo dentro da banda continua sendo capa, não segunda moldura.
        assert Image.open(antiga).convert("RGB").getpixel((BANDA + 2, BANDA + 2)) == CAPA

    @pytest.mark.asyncio
    async def test_respeita_as_marcas_do_corte(self, cenario):
        sf, molduras, tmp_path = cenario
        _escrever_molduras(molduras)
        thumb_dir = tmp_path / "projetos" / "proj-1" / "thumbnails"
        thumb_dir.mkdir(parents=True, exist_ok=True)
        antiga = thumb_dir / "thumb_corte-1.png"
        antiga.write_bytes(_capa_crua())
        async with sf() as db:
            meta = await db.get(MetadadoCorte, "meta-1")
            meta.thumbnail_path = str(antiga)
            await db.commit()
        await _marcar(sf, fire=1, leitura=1)

        resultado = await ThumbnailService.aplicar_moldura("corte-1")

        assert resultado["moldura"] == "thumb_fire_livro.png"

    @pytest.mark.asyncio
    async def test_sem_capa_o_operador_ouve_o_motivo(self, cenario):
        """Botão clicado tem que responder — silêncio aqui é o pior desfecho."""
        sf, molduras, _ = cenario
        _escrever_molduras(molduras)

        with pytest.raises(ValueError, match="Nenhuma capa"):
            await ThumbnailService.aplicar_moldura("corte-1")

    @pytest.mark.asyncio
    async def test_canal_sem_moldura_avisa_em_vez_de_fingir_sucesso(self, cenario):
        sf, _, tmp_path = cenario
        thumb_dir = tmp_path / "projetos" / "proj-1" / "thumbnails"
        thumb_dir.mkdir(parents=True, exist_ok=True)
        antiga = thumb_dir / "thumb_corte-1.png"
        antiga.write_bytes(_capa_crua())
        async with sf() as db:
            meta = await db.get(MetadadoCorte, "meta-1")
            meta.thumbnail_path = str(antiga)
            await db.commit()

        with pytest.raises(ValueError, match="não tem moldura"):
            await ThumbnailService.aplicar_moldura("corte-1")

        assert antiga.read_bytes() == _capa_crua()
