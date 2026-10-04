"""O navegador do robô do TikTok e do Instagram: Chrome ou Edge, por canal (D-832)."""

from contextlib import contextmanager
from pathlib import Path

import pytest
from app.core import channel_paths
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.publicacao import instagram_reels as dominio_ig
from app.domain.publicacao import tiktok_studio as dominio_tt
from app.services import instagram_reels, navegador_assistido, navegador_do_robo, tiktok_studio
from app.services.navegador_assistido import ChromeNaoAbriu

ROBOS = [
    pytest.param(tiktok_studio, dominio_tt, id="tiktok"),
    pytest.param(instagram_reels, dominio_ig, id="instagram"),
]


@pytest.fixture
def canal(monkeypatch, tmp_path):
    """Banco e canal próprios: a escolha gravada aqui não vaza para outro teste."""
    raiz = {"canal": tmp_path / "canal-a"}
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: raiz["canal"])
    monkeypatch.setattr(navegador_assistido, "active_channel_root", lambda: raiz["canal"])
    return raiz


@pytest.fixture
def edge(monkeypatch, tmp_path):
    exe = tmp_path / "msedge.exe"
    monkeypatch.setattr(navegador_do_robo, "edge_no_disco", lambda: exe)
    return exe


def test_sem_escolha_abre_o_edge(canal, edge):
    """D-873: o Edge é o padrão; o Chrome passou a ser escolha."""
    assert navegador_do_robo.navegador_do_canal() == "edge"
    assert (
        navegador_do_robo.perfil_da_plataforma("tiktok")
        == canal["canal"] / "browser" / "tiktok-edge"
    )
    assert navegador_do_robo.executavel_escolhido() == edge


def test_sem_escolha_e_sem_edge_cai_no_chrome(canal, monkeypatch):
    """O padrão é preferência, não exigência: máquina sem Edge (o CI no Linux)
    segue no Chrome, com a pasta do Chrome — navegador e perfil decididos juntos."""
    monkeypatch.setattr(navegador_do_robo, "edge_no_disco", lambda: None)

    assert navegador_do_robo.navegador_do_canal() == "chrome"
    assert navegador_do_robo.perfil_da_plataforma("tiktok").name == "tiktok"
    assert navegador_do_robo.executavel_escolhido() is None


def test_chrome_escolhido_segue_o_chrome_de_sempre(canal):
    navegador_do_robo.escolher_navegador("chrome")

    assert navegador_do_robo.perfil_da_plataforma("tiktok") == canal["canal"] / "browser" / "tiktok"
    # None: o `garantir_chrome` procura o Chrome e fala do CHROME_PATH como antes.
    assert navegador_do_robo.executavel_escolhido() is None


def test_edge_abre_o_edge_numa_pasta_de_sessao_propria(canal, edge):
    """A pasta do Chrome não serve ao Edge: os cookies de um o outro não abre."""
    assert navegador_do_robo.escolher_navegador("edge") == "edge"

    perfil = navegador_do_robo.perfil_da_plataforma("instagram")
    assert perfil == canal["canal"] / "browser" / "instagram-edge"
    assert navegador_do_robo.executavel_escolhido() == edge


def test_voltar_ao_chrome_volta_a_pasta_de_antes(canal, edge):
    navegador_do_robo.escolher_navegador("edge")
    navegador_do_robo.escolher_navegador("chrome")

    assert navegador_do_robo.perfil_da_plataforma("tiktok").name == "tiktok"


def test_a_escolha_e_do_canal(canal, edge):
    navegador_do_robo.escolher_navegador("chrome")
    canal["canal"] = canal["canal"].parent / "canal-b"

    assert navegador_do_robo.navegador_do_canal() == "edge"


def test_edge_escolhido_e_ausente_explica_o_que_fazer(canal, monkeypatch):
    monkeypatch.setattr(navegador_do_robo, "edge_no_disco", lambda: None)
    navegador_do_robo.escolher_navegador("edge")

    with pytest.raises(ChromeNaoAbriu, match="Edge"):
        navegador_do_robo.executavel_escolhido()


def test_navegador_desconhecido_e_recusado(canal, edge):
    with pytest.raises(PedidoInvalido):
        navegador_do_robo.escolher_navegador("firefox")

    assert navegador_do_robo.navegador_do_canal() == "edge"


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_o_robo_abre_no_navegador_escolhido(robo, dominio, canal, edge, monkeypatch):
    navegador_do_robo.escolher_navegador("edge")
    pedidos = []

    @contextmanager
    def sessao(perfil, **opcoes):
        pedidos.append((perfil, opcoes))
        raise ChromeNaoAbriu("parou aqui")
        yield  # pragma: no cover

    monkeypatch.setattr(robo, "sessao_no_chrome", sessao)

    with pytest.raises(dominio.RoteiroInterrompido):
        robo._assistir(Path("v.mp4"), "legenda", None, "marca-1", False)

    ((perfil, opcoes),) = pedidos
    assert perfil.name == f"{robo.PERFIL}-edge"
    assert opcoes["executavel"] == edge


def test_a_tela_le_e_grava_a_escolha_pela_api(canal, edge):
    from app.routers import channels
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(channels.router, prefix="/api/channels")
    cliente = TestClient(app)
    rota = "/api/channels/ativo/navegador-do-robo"

    assert cliente.get(rota).json() == {"navegador": "edge"}
    assert cliente.put(rota, json={"navegador": "chrome"}).json() == {"navegador": "chrome"}
    assert cliente.get(rota).json() == {"navegador": "chrome"}
    assert cliente.put(rota, json={"navegador": "firefox"}).status_code == 422
