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
    copiar_capa,
    montar_texto_do_pacote,
)
from app.services.publicacao_destinos import ContextoPublicacao, PacotePublicacao


def _pacote(
    plataforma: Plataforma,
    arquivo: Path,
    avisos: list[str] | None = None,
    capa: Path | None = None,
):
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
        capa=capa,
        avisos=avisos or [],
    )


def test_quota_do_youtube_da_seis_uploads_por_dia():
    """1600 unidades por upload contra teto de 10000 — o limite real da esteira."""
    assert UPLOADS_POR_DIA == 6


def test_destino_do_youtube_e_por_api_os_outros_nao():
    assert DestinoYouTubeShorts().modo is ModoPublicacao.API
    assert DestinoManual(Plataforma.TIKTOK).modo is ModoPublicacao.MANUAL


def test_o_registro_dos_shorts_nao_inclui_o_tiktok_horizontal():
    """D-584: o registro e dos destinos do SHORT, e nem toda plataforma cabe.

    O teste antes dizia `registradas == set(Plataforma)` — "todas as plataformas
    estao registradas" —, e era essa afirmacao que estava errada. O
    `TIKTOK_HORIZONTAL` e destino do CORTE (o arquivo 16:9, publicado pela tela
    do projeto). Registrado aqui, ele aparecia no painel de publicacao de todo
    short oferecendo um destino que a validacao reprova SEMPRE: os limites dele
    pedem horizontal e no minimo 60s, e um short e 9:16 com 15 a 90s.

    O operador perguntou duas vezes o que o TikTok horizontal fazia na tela de
    shorts. A resposta era esta linha.
    """
    from app.services import publicacao_destinos

    registradas = {d.plataforma for d in publicacao_destinos.destinos_disponiveis()}

    assert registradas == set(Plataforma) - {Plataforma.TIKTOK_HORIZONTAL}


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

    assert "A conta que nao fecha" in texto
    assert "https://youtu.be/longo" in texto
    assert "#economia" in texto


def test_o_tiktok_tem_legenda_e_nao_titulo(tmp_path):
    """D-535: o pacote nomeia as caixas que existem de verdade.

    O TikTok tem UMA caixa de texto. Anunciar "TITULO" e "DESCRICAO" mandava o
    operador procurar um campo inexistente — a duvida chegou como pergunta, o
    que e o sinal de que o pacote estava ensinando errado.
    """
    texto = montar_texto_do_pacote(_pacote(Plataforma.TIKTOK, tmp_path / "short.mp4"))

    assert "-- LEGENDA" in texto
    assert "-- TITULO" not in texto
    assert "-- DESCRICAO" not in texto


def test_o_youtube_shorts_continua_com_dois_campos():
    """La os dois campos existem — juntar tudo numa caixa so seria perder um."""
    texto = montar_texto_do_pacote(_pacote(Plataforma.YOUTUBE_SHORTS, Path("s.mp4")))

    assert "-- TITULO" in texto
    assert "-- DESCRICAO" in texto


def test_avisos_vem_antes_de_tudo_no_texto():
    """De nada adianta descobrir o limite depois de ja ter subido."""
    texto = montar_texto_do_pacote(
        _pacote(Plataforma.INSTAGRAM_REELS, Path("s.mp4"), avisos=["passa de 90s"])
    )

    assert texto.index("ANTES DE SUBIR") < texto.index("-- LEGENDA")


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


# D-518: a capa.
#
# O TikTok deixa escolher a capa no upload; sem escolha ele congela um frame
# qualquer do video. O pacote nao mencionava a imagem que o corte JA tem — o
# operador subia sem capa por nao saber que havia uma.


def _capa(tmp_path: Path, nome: str = "thumb.jpg") -> Path:
    imagem = tmp_path / nome
    imagem.write_bytes(b"jpeg-falso")
    return imagem


@pytest.mark.asyncio
async def test_capa_entra_na_pasta_do_pacote(tmp_path):
    """Ao lado do texto, e nao a tres pastas de distancia.

    A pasta abre no explorador durante o upload: a capa precisa estar ali para
    ser arrastada, senao o operador tem de sair procurando no meio do gesto.
    """
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")

    resultado = await DestinoManual(Plataforma.TIKTOK).publicar(
        _pacote(Plataforma.TIKTOK, video, capa=_capa(tmp_path))
    )

    copiada = Path(resultado["capa"])
    assert copiada.parent == Path(resultado["pasta"])
    assert copiada.read_bytes() == b"jpeg-falso"


@pytest.mark.asyncio
async def test_capa_preserva_a_extensao_original(tmp_path):
    """O TikTok recusa PNG servido como .jpg — a extensao vem da imagem."""
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")

    resultado = await DestinoManual(Plataforma.TIKTOK).publicar(
        _pacote(Plataforma.TIKTOK, video, capa=_capa(tmp_path, "thumb.PNG"))
    )

    assert Path(resultado["capa"]).name == "capa.png"


@pytest.mark.asyncio
async def test_sem_capa_o_pacote_sai_do_mesmo_jeito(tmp_path):
    """Ausencia de capa nao pode derrubar o pacote — so aparecer como ausencia."""
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")

    resultado = await DestinoManual(Plataforma.TIKTOK).publicar(_pacote(Plataforma.TIKTOK, video))

    assert resultado["capa"] == ""
    assert (Path(resultado["pasta"]) / "publicar.txt").is_file()


def test_capa_apontando_para_arquivo_sumido_nao_e_copiada(tmp_path):
    """A retencao apaga thumbnail antiga; caminho morto e pior que nada."""
    sumida = tmp_path / "apagada.jpg"

    assert copiar_capa(_pacote(Plataforma.TIKTOK, Path("s.mp4"), capa=sumida), tmp_path) is None


def test_texto_do_pacote_lista_a_capa(tmp_path):
    capa = _capa(tmp_path)

    texto = montar_texto_do_pacote(_pacote(Plataforma.TIKTOK, Path("s.mp4"), capa=capa), capa)

    assert "-- CAPA --" in texto
    assert str(capa) in texto


def test_texto_diz_quando_nao_ha_capa():
    """Silencio aqui viraria upload sem capa descoberto depois de publicado."""
    texto = montar_texto_do_pacote(_pacote(Plataforma.TIKTOK, Path("s.mp4")))

    assert "sem capa" in texto


def test_a_ausencia_de_capa_diz_o_que_fazer(tmp_path):
    """D-522: a thumbnail 16:9 do YouTube NAO e reserva desta capa.

    Sem alternativa escrita, o operador tenderia a arrastar a capa do YouTube —
    que no quadro 9:16 vira uma faixa fina e some na grade do perfil.
    """
    texto = montar_texto_do_pacote(_pacote(Plataforma.TIKTOK, Path("s.mp4")))

    assert "Metadados" in texto
    assert "frame" in texto


# D-588: a capa do short no YouTube.
#
# O destino fazia so o `videos.insert` e jogava fora a capa que o pacote trazia.
# O operador testou, e o short subiu com um quadro qualquer.


@pytest.fixture
def youtube_dublado(monkeypatch):
    """Upload e capa de mentira: o que se prova e a ORDEM e a tolerancia a falha."""
    from app.services import youtube as youtube_module

    monkeypatch.setattr(
        youtube_module.YouTubeService, "_get_credentials", staticmethod(lambda: ("creds", None))
    )

    async def _fake_enviar(self, creds, pacote):
        return "vid42"

    monkeypatch.setattr(DestinoYouTubeShorts, "_enviar", _fake_enviar)

    capas: list[tuple[str, bytes]] = []
    estado = {"falha": None}

    def _fake_subir_capa(creds, video_id, dados, mimetype):
        if estado["falha"]:
            raise estado["falha"]
        capas.append((video_id, dados))

    monkeypatch.setattr(DestinoYouTubeShorts, "_subir_capa", staticmethod(_fake_subir_capa))
    return capas, estado


def _png(tmp_path: Path) -> Path:
    from PIL import Image

    caminho = tmp_path / "capa.png"
    Image.new("RGB", (9, 16), "red").save(caminho)
    return caminho


@pytest.mark.asyncio
async def test_a_capa_do_short_vai_para_o_video_que_acabou_de_subir(tmp_path, youtube_dublado):
    capas, _ = youtube_dublado
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")
    capa = _png(tmp_path)

    resultado = await DestinoYouTubeShorts().publicar(
        _pacote(Plataforma.YOUTUBE_SHORTS, video, capa=capa)
    )

    assert capas == [("vid42", capa.read_bytes())]
    assert resultado["capa_aplicada"] is True
    assert resultado["avisos"] == []


@pytest.mark.asyncio
async def test_capa_que_falha_nao_desfaz_o_short_que_subiu(tmp_path, youtube_dublado):
    """Levantar aqui faria a fila marcar ERRO num video que ja esta no canal —
    e a proxima tentativa o subiria de novo."""
    _, estado = youtube_dublado
    estado["falha"] = RuntimeError("canal sem permissao de capa")
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")

    resultado = await DestinoYouTubeShorts().publicar(
        _pacote(Plataforma.YOUTUBE_SHORTS, video, capa=_png(tmp_path))
    )

    assert resultado["url"] == "https://youtu.be/vid42"
    assert resultado["capa_aplicada"] is False
    assert "Studio" in resultado["avisos"][0]


@pytest.mark.asyncio
async def test_short_sem_capa_nao_chama_a_api_de_capa(tmp_path, youtube_dublado):
    capas, _ = youtube_dublado
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")

    resultado = await DestinoYouTubeShorts().publicar(_pacote(Plataforma.YOUTUBE_SHORTS, video))

    assert capas == []
    assert resultado["capa_aplicada"] is False
    assert resultado["avisos"] == []
