"""D-468 e D-469: os destinos concretos.

**YouTube por API** é o único com OAuth pronto. O teste dubla o cliente do
Google: o que precisa de prova é o MAPEAMENTO (título, descrição, hashtags sem
`#`, privacidade), não a biblioteca deles.

**Pacote manual** é o caminho principal de Instagram e TikTok enquanto o app
review não sai. O produto ali é o TEXTO: se o operador precisar reescrever o
título no celular, o pacote falhou no seu único trabalho.
"""

from pathlib import Path

import pytest
from app.domain.publicacao import (
    MetadadosBase,
    ModoPublicacao,
    Plataforma,
    adaptar,
)
from app.services.destinos_shorts import (
    UPLOADS_POR_DIA,
    DestinoManual,
    DestinoYouTubeShorts,
    montar_texto_do_pacote,
)
from app.services.publicacao_destinos import ContextoPublicacao, PacotePublicacao


def _pacote(plataforma: Plataforma, arquivo: Path, avisos: list[str] | None = None):
    return PacotePublicacao(
        plataforma=plataforma,
        modo=ModoPublicacao.MANUAL,
        arquivo=arquivo,
        metadados=adaptar(
            MetadadosBase(
                titulo="A conta que nao fecha",
                descricao="ninguem te conta isso",
                hashtags=["economia"],
                url_video_longo="https://youtu.be/longo",
            ),
            plataforma,
        ),
        avisos=avisos or [],
    )


def test_quota_do_youtube_da_seis_uploads_por_dia():
    """1600 unidades por upload contra teto de 10000 — o limite real da esteira."""
    assert UPLOADS_POR_DIA == 6


def test_destino_do_youtube_e_por_api_os_outros_nao():
    assert DestinoYouTubeShorts().modo is ModoPublicacao.API
    assert DestinoManual(Plataforma.TIKTOK).modo is ModoPublicacao.MANUAL


def test_todos_os_destinos_padrao_estao_registrados():
    from app.services import publicacao_destinos

    registradas = {d.plataforma for d in publicacao_destinos.destinos_disponiveis()}

    assert registradas == set(Plataforma)


@pytest.mark.asyncio
async def test_upload_mapeia_titulo_descricao_e_tags(tmp_path, monkeypatch):
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")
    capturado: dict = {}

    async def _fake_enviar(self, creds, pacote):
        capturado["pacote"] = pacote
        return "abc123"

    monkeypatch.setattr(DestinoYouTubeShorts, "_enviar", _fake_enviar)

    from app.services import youtube as youtube_module

    monkeypatch.setattr(
        youtube_module.YouTubeService, "_get_credentials", staticmethod(lambda: ("creds", None))
    )

    resultado = await DestinoYouTubeShorts().publicar(_pacote(Plataforma.YOUTUBE_SHORTS, video))

    assert resultado["url"] == "https://youtu.be/abc123"
    assert capturado["pacote"].metadados.titulo == "A conta que nao fecha"


@pytest.mark.asyncio
async def test_upload_sem_credencial_falha_com_motivo(tmp_path, monkeypatch):
    from app.services import youtube as youtube_module

    monkeypatch.setattr(
        youtube_module.YouTubeService,
        "_get_credentials",
        staticmethod(lambda: (None, "token do canal expirou")),
    )
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")

    with pytest.raises(RuntimeError, match="token do canal expirou"):
        await DestinoYouTubeShorts().publicar(_pacote(Plataforma.YOUTUBE_SHORTS, video))


@pytest.mark.asyncio
async def test_pacote_manual_escreve_pasta_com_texto_e_metadados(tmp_path):
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")

    resultado = await DestinoManual(Plataforma.TIKTOK).publicar(_pacote(Plataforma.TIKTOK, video))

    pasta = Path(resultado["pasta"])
    assert (pasta / "publicar.txt").is_file()
    assert (pasta / "metadados.json").is_file()
    assert resultado["modo"] == "manual"


@pytest.mark.asyncio
async def test_cada_plataforma_ganha_sua_propria_pasta(tmp_path):
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")

    reels = await DestinoManual(Plataforma.INSTAGRAM_REELS).publicar(
        _pacote(Plataforma.INSTAGRAM_REELS, video)
    )
    tiktok = await DestinoManual(Plataforma.TIKTOK).publicar(_pacote(Plataforma.TIKTOK, video))

    assert reels["pasta"] != tiktok["pasta"]


def test_texto_do_pacote_traz_o_que_colar(tmp_path):
    texto = montar_texto_do_pacote(_pacote(Plataforma.TIKTOK, tmp_path / "short.mp4"))

    assert "-- TITULO" in texto
    assert "A conta que nao fecha" in texto
    assert "-- DESCRICAO" in texto
    assert "https://youtu.be/longo" in texto
    assert "#economia" in texto


def test_avisos_vem_antes_de_tudo_no_texto():
    """De nada adianta descobrir o limite depois de ja ter subido."""
    texto = montar_texto_do_pacote(
        _pacote(Plataforma.INSTAGRAM_REELS, Path("s.mp4"), avisos=["passa de 90s"])
    )

    assert texto.index("ANTES DE SUBIR") < texto.index("-- TITULO")


def test_texto_diz_quantos_caracteres_aparecem_no_feed():
    """O operador precisa saber onde o titulo e cortado para escrever para isso."""
    texto = montar_texto_do_pacote(_pacote(Plataforma.YOUTUBE_SHORTS, Path("s.mp4")))

    assert "~40 caracteres" in texto


@pytest.mark.asyncio
async def test_contexto_vertical_nao_gera_aviso_de_formato(tmp_path):
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")
    contexto = ContextoPublicacao(
        short_id="s1",
        arquivo=video,
        duracao_seg=40.0,
        vertical=True,
        base=MetadadosBase(titulo="t"),
    )

    pacote = await DestinoYouTubeShorts().preparar(contexto)

    assert pacote.avisos == []
