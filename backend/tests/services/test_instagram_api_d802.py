"""D-802: Reels pela API do Instagram — do disco ao post, sem navegador.

Sem rede: a Meta e o hospedeiro da capa são dublês. O que se protege aqui é a
SEQUÊNCIA e as recusas — as duas coisas que custam caro se erradas: um Reel que
sai antes da data marcada, e um Reel que sai sem a capa.
"""

from datetime import datetime, timedelta
from pathlib import Path

import httpx
import pytest
from app.domain.publicacao.agendamento import Agendamento
from app.domain.publicacao.publicacao import (
    MetadadosPublicacao,
    ModoPublicacao,
    Plataforma,
)
from app.infrastructure import instagram_graph
from app.services import instagram_api
from app.services.publicacao_destinos import PacotePublicacao
from PIL import Image


@pytest.fixture
def canal(tmp_path, monkeypatch):
    monkeypatch.setattr(instagram_api, "active_channel_root", lambda: tmp_path)
    monkeypatch.setattr(instagram_api.settings, "instagram_access_token", "IGAA-do-env")
    monkeypatch.setattr(instagram_api, "INTERVALO_DO_STATUS", 0.0)
    return tmp_path


@pytest.fixture
def meta(monkeypatch):
    """A Meta de mentira: registra a ordem das chamadas e o que recebeu."""
    chamadas: list[tuple] = []
    estado = {"status": ["IN_PROGRESS", "FINISHED"]}

    monkeypatch.setattr(instagram_graph, "quem_sou", lambda t: ("1784", "canal"))

    def hospedar(imagem: Path):
        with Image.open(imagem) as aberta:
            chamadas.append(("hospedar", aberta.format))
        return "https://litter.catbox.moe/capa.jpg"

    def criar(token, conta, *, legenda, capa_url="", no_feed=True):
        chamadas.append(("criar", conta, legenda, capa_url))
        return instagram_graph.Container("c1", "https://rupload.facebook.com/x/c1")

    def enviar(token, container, video):
        chamadas.append(("enviar", container.id, video.name))

    def status(token, container_id):
        return estado["status"].pop(0), ""

    def publicar(token, conta, container_id):
        chamadas.append(("publicar", container_id))
        return "m1"

    monkeypatch.setattr(instagram_graph, "hospedar_por_uma_hora", hospedar)
    monkeypatch.setattr(instagram_graph, "criar_container", criar)
    monkeypatch.setattr(instagram_graph, "enviar_video", enviar)
    monkeypatch.setattr(instagram_graph, "status_do_container", status)
    monkeypatch.setattr(instagram_graph, "publicar", publicar)
    monkeypatch.setattr(instagram_graph, "permalink", lambda t, m: "https://instagram.com/reel/m1")
    return chamadas, estado


def _pacote(tmp_path, *, capa=True) -> PacotePublicacao:
    video = tmp_path / "short.mp4"
    video.write_bytes(b"mp4")
    arquivo_da_capa = None
    if capa:
        arquivo_da_capa = tmp_path / "capa.png"
        Image.new("RGBA", (18, 32), (255, 0, 0, 255)).save(arquivo_da_capa)
    return PacotePublicacao(
        plataforma=Plataforma.INSTAGRAM_REELS,
        modo=ModoPublicacao.API,
        arquivo=video,
        metadados=MetadadosPublicacao(
            plataforma=Plataforma.INSTAGRAM_REELS,
            titulo="O juro composto",
            descricao="Corte completo #pix",
            hashtags=["#pix"],
        ),
        capa=arquivo_da_capa,
    )


class TestPublicacao:
    @pytest.mark.asyncio
    async def test_sobe_espera_processar_e_publica(self, canal, meta):
        chamadas, _ = meta

        resultado = await instagram_api.DestinoInstagramReelsApi().publicar(_pacote(canal))

        assert [c[0] for c in chamadas] == ["hospedar", "criar", "enviar", "publicar"]
        assert resultado["url"] == "https://instagram.com/reel/m1"
        assert resultado["capa_aplicada"] is True

    @pytest.mark.asyncio
    async def test_a_capa_vai_como_jpeg_e_o_link_entra_no_container(self, canal, meta):
        chamadas, _ = meta

        await instagram_api.DestinoInstagramReelsApi().publicar(_pacote(canal))

        assert ("hospedar", "JPEG") in chamadas
        criar = next(c for c in chamadas if c[0] == "criar")
        assert criar[3] == "https://litter.catbox.moe/capa.jpg"
        assert criar[2] == "O juro composto\n\nCorte completo #pix"

    @pytest.mark.asyncio
    async def test_video_que_a_meta_recusa_nao_e_publicado(self, canal, meta):
        chamadas, estado = meta
        estado["status"] = ["ERROR"]

        with pytest.raises(instagram_graph.ErroDoInstagram, match="processar"):
            await instagram_api.DestinoInstagramReelsApi().publicar(_pacote(canal))

        assert not any(c[0] == "publicar" for c in chamadas)

    @pytest.mark.asyncio
    async def test_capa_que_nao_sobe_segura_o_reel(self, canal, meta, monkeypatch):
        """RN-26: sem a capa confirmada, nada vai ao ar sozinho."""
        chamadas, _ = meta

        def falha(imagem):
            raise instagram_graph.ErroDoInstagram("hospedeiro fora do ar")

        monkeypatch.setattr(instagram_graph, "hospedar_por_uma_hora", falha)

        with pytest.raises(instagram_graph.ErroDoInstagram):
            await instagram_api.DestinoInstagramReelsApi().publicar(_pacote(canal))

        assert not any(c[0] in ("criar", "publicar") for c in chamadas)

    @pytest.mark.asyncio
    async def test_sem_capa_pedida_publica_sem_cover_url(self, canal, meta):
        chamadas, _ = meta

        resultado = await instagram_api.DestinoInstagramReelsApi().publicar(
            _pacote(canal, capa=False)
        )

        assert next(c for c in chamadas if c[0] == "criar")[3] == ""
        assert resultado["capa_aplicada"] is False


class TestRecusas:
    @pytest.mark.asyncio
    async def test_com_data_marcada_recusa_em_vez_de_adiantar_o_post(self, canal, meta):
        """A API não agenda. Publicar na hora seria adiantar um Reel marcado."""
        chamadas, _ = meta
        amanha = Agendamento(quando=datetime.now().astimezone() + timedelta(days=1))

        with pytest.raises(instagram_graph.ErroDoInstagram, match="nao agenda"):
            await instagram_api.DestinoInstagramReelsApi(agendamento=amanha).publicar(
                _pacote(canal)
            )

        assert chamadas == []

    @pytest.mark.asyncio
    async def test_sem_token_diz_onde_por(self, canal, meta, monkeypatch):
        monkeypatch.setattr(instagram_api.settings, "instagram_access_token", "")

        with pytest.raises(instagram_graph.ErroDoInstagram, match="INSTAGRAM_ACCESS_TOKEN"):
            await instagram_api.DestinoInstagramReelsApi().publicar(_pacote(canal))


class TestToken:
    def test_o_do_env_e_guardado_no_canal_na_primeira_vez(self, canal):
        assert instagram_api.token_atual() == "IGAA-do-env"
        assert (canal / instagram_api.ARQUIVO_DO_TOKEN).is_file()

    def test_passados_30_dias_ele_se_renova_sozinho(self, canal, monkeypatch):
        instagram_api._guardar_token("IGAA-velho")
        guardado = canal / instagram_api.ARQUIVO_DO_TOKEN
        velho = (datetime.utcnow() - timedelta(days=31)).isoformat()
        guardado.write_text(f'{{"token": "IGAA-velho", "renovado_em": "{velho}"}}')
        monkeypatch.setattr(instagram_graph, "renovar_token", lambda t: ("IGAA-novo", 5184000))

        assert instagram_api.token_atual() == "IGAA-novo"
        assert instagram_api._ler_token_guardado()[0] == "IGAA-novo"

    def test_renovacao_que_falha_segue_com_o_token_que_ainda_vale(self, canal, monkeypatch):
        guardado = canal / instagram_api.ARQUIVO_DO_TOKEN
        velho = (datetime.utcnow() - timedelta(days=31)).isoformat()
        guardado.write_text(f'{{"token": "IGAA-velho", "renovado_em": "{velho}"}}')

        def falha(token):
            raise instagram_graph.ErroDoInstagram("fora do ar")

        monkeypatch.setattr(instagram_graph, "renovar_token", falha)

        assert instagram_api.token_atual() == "IGAA-velho"

    def test_com_token_o_reels_vai_pela_api(self, canal):
        reserva = object()
        assert isinstance(
            instagram_api.destino_do_reels(reserva), instagram_api.DestinoInstagramReelsApi
        )

    def test_sem_token_o_reels_fica_com_a_reserva(self, canal, monkeypatch):
        monkeypatch.setattr(instagram_api.settings, "instagram_access_token", "")
        reserva = object()
        assert instagram_api.destino_do_reels(reserva) is reserva


class TestCliente:
    """O token vai no cabeçalho: o `httpx` loga a URL, e ela acaba em arquivo."""

    def test_o_token_nunca_vai_na_url(self, monkeypatch):
        vistas: list[httpx.Request] = []

        def responder(requisicao: httpx.Request) -> httpx.Response:
            vistas.append(requisicao)
            return httpx.Response(200, json={"user_id": "1784", "username": "canal"})

        original = instagram_graph._cliente
        monkeypatch.setattr(
            instagram_graph,
            "_cliente",
            lambda token, timeout=60.0: httpx.Client(
                transport=httpx.MockTransport(responder),
                headers=original(token).headers,
            ),
        )

        assert instagram_graph.quem_sou("IGAA-segredo") == ("1784", "canal")
        assert "IGAA-segredo" not in str(vistas[0].url)
        assert vistas[0].headers["Authorization"] == "Bearer IGAA-segredo"
        assert vistas[0].url.host == "graph.instagram.com"

    def test_erro_da_meta_chega_com_a_mensagem_dela(self):
        resposta = httpx.Response(
            400, json={"error": {"message": "Invalid parameter", "error_user_msg": "Capa grande"}}
        )
        with pytest.raises(instagram_graph.ErroDoInstagram, match="Capa grande"):
            instagram_graph._resposta(resposta)
