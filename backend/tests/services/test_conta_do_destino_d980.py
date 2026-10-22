"""Conferir a conta logada antes de cada envio, nos cinco caminhos (RN-31, D-980).

YouTube (corte e short, pelas credenciais), Instagram pela API, e os robôs de
navegador do TikTok e do Instagram. Em cada um, a conta errada barra o envio
ANTES de o vídeo sair.
"""

import types
from contextlib import contextmanager
from pathlib import Path

import pytest
from app.core import channel_paths
from app.domain.publicacao.conta_do_destino import Conta, ContaDivergente, ContaIlegivel
from app.infrastructure import instagram_graph, youtube_api
from app.services import conta_do_destino, instagram_api, instagram_reels, tiktok_studio
from app.services.navegador_assistido import ChromeNaoAbriu


@pytest.fixture
def canal(monkeypatch, tmp_path):
    """Banco e canal próprios: a conta aprendida aqui não vaza para outro teste."""
    raiz = {"canal": tmp_path / "canal-a"}
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: raiz["canal"])
    return raiz


def _gravada(destino: str) -> dict:
    return next(c for c in conta_do_destino.contas_do_canal() if c["destino"] == destino)


# ─── Aprender, barrar, esquecer ──────────────────────────────────────────────


def test_o_primeiro_envio_aprende_a_conta_do_canal(canal):
    conta_do_destino.conferir_conta("tiktok", Conta("71", "@ateuinforma"))

    gravada = _gravada("tiktok")
    assert (gravada["conta_id"], gravada["nome"]) == ("71", "@ateuinforma")
    assert gravada["gravada_em"]


def test_depois_de_aprender_outra_conta_e_recusada(canal):
    conta_do_destino.conferir_conta("tiktok", Conta("71", "@ateuinforma"))

    with pytest.raises(ContaDivergente, match="@outra"):
        conta_do_destino.conferir_conta("tiktok", Conta("99", "@outra"))
    assert _gravada("tiktok")["conta_id"] == "71"


def test_a_conta_e_por_canal(canal, tmp_path):
    """Quem tem dois canais tem duas contas: o B aprende a dele."""
    conta_do_destino.conferir_conta("tiktok", Conta("71"))
    canal["canal"] = tmp_path / "canal-b"

    conta_do_destino.conferir_conta("tiktok", Conta("99"))

    assert _gravada("tiktok")["conta_id"] == "99"


def test_esquecer_deixa_o_proximo_envio_aprender_outra(canal):
    conta_do_destino.conferir_conta("instagram", Conta("1784", "@canal"))

    conta_do_destino.esquecer_conta("instagram")
    conta_do_destino.conferir_conta("instagram", Conta("2000", "@nova"))

    assert _gravada("instagram")["conta_id"] == "2000"


def test_a_tela_recebe_os_quatro_destinos_mesmo_sem_nada_gravado(canal):
    linhas = conta_do_destino.contas_do_canal()

    assert [c["destino"] for c in linhas] == ["youtube", "tiktok", "instagram", "instagram_web"]
    assert all(c["conta_id"] == "" for c in linhas)
    assert linhas[0]["rotulo"] == "YouTube"


# ─── YouTube: corte e short passam pelas credenciais ─────────────────────────


def test_credencial_de_outro_canal_do_youtube_volta_como_recusa(canal, monkeypatch):
    conta_do_destino.conferir_conta("youtube", Conta("UC-certo", "Canal A"))
    monkeypatch.setattr(youtube_api, "canal_da_conta", lambda creds: ("UC-outro", "Canal B"))

    creds, erro = conta_do_destino.credenciais_conferidas("creds")

    assert creds is None
    assert "Canal B (UC-outro)" in erro


def test_credencial_do_canal_certo_segue(canal, monkeypatch):
    monkeypatch.setattr(youtube_api, "canal_da_conta", lambda creds: ("UC-certo", "Canal A"))

    assert conta_do_destino.credenciais_conferidas("creds") == ("creds", None)
    assert _gravada("youtube")["nome"] == "Canal A"


def test_youtube_que_nao_responde_qual_e_o_canal_nao_envia(canal, monkeypatch):
    def quebra(_creds):
        raise OSError("sem rede")

    monkeypatch.setattr(youtube_api, "canal_da_conta", quebra)

    creds, erro = conta_do_destino.credenciais_conferidas("creds")

    assert creds is None
    assert "Não consegui confirmar" in erro


def test_as_credenciais_do_youtube_saem_conferidas(canal, monkeypatch, tmp_path):
    """O `_get_credentials` é a porta do upload do corte e do short: a conferência
    mora no retorno dele, e a conta errada chega como chega um token vencido."""
    from app.services import youtube

    segredos = tmp_path / "client_secrets.json"
    segredos.write_text("{}")
    token = tmp_path / "token.json"
    token.write_text("{}")
    monkeypatch.setattr(youtube, "youtube_client_secrets_path", lambda: segredos)
    monkeypatch.setattr(youtube, "youtube_token_path", lambda: token)
    valida = types.SimpleNamespace(valid=True)
    monkeypatch.setattr(
        youtube.Credentials, "from_authorized_user_file", staticmethod(lambda *a: valida)
    )
    conta_do_destino.conferir_conta("youtube", Conta("UC-certo"))
    monkeypatch.setattr(youtube_api, "canal_da_conta", lambda creds: ("UC-outro", ""))

    creds, erro = youtube.YouTubeService._get_credentials()

    assert creds is None
    assert "UC-outro" in erro


# ─── Instagram pela API ──────────────────────────────────────────────────────


def test_reel_pela_api_com_token_de_outra_conta_nao_sobe(canal, monkeypatch, tmp_path):
    """O token do `.env` é um só: o segundo canal o herdaria sem saber."""
    conta_do_destino.conferir_conta("instagram", Conta("1784", "@canal"))
    chamadas = []
    monkeypatch.setattr(instagram_api, "token_atual", lambda: "IGAA")
    monkeypatch.setattr(instagram_graph, "quem_sou", lambda t: ("2000", "outra"))
    monkeypatch.setattr(
        instagram_graph, "criar_container", lambda *a, **k: chamadas.append("criar")
    )
    video = tmp_path / "reel.mp4"
    video.write_bytes(b"v")

    with pytest.raises(ContaDivergente, match="@outra"):
        instagram_api.publicar_reel(video, "legenda", None)
    assert chamadas == []


# ─── Leitura da conta nos robôs de navegador ─────────────────────────────────


class _Resposta:
    def __init__(self, corpo):
        self.corpo = corpo

    def json(self):
        return self.corpo


def test_le_a_conta_do_tiktok_pela_sessao_do_robo():
    pedidos = []

    def get(url, timeout):
        pedidos.append(url)
        return _Resposta({"data": {"user_id_str": "71", "username": "ateuinforma"}})

    contexto = types.SimpleNamespace(request=types.SimpleNamespace(get=get))

    assert conta_do_destino.conta_no_tiktok(contexto) == Conta("71", "@ateuinforma")
    assert pedidos == [conta_do_destino.URL_DA_CONTA_NO_TIKTOK]


def test_tiktok_que_nao_responde_vira_conta_sem_id():
    def get(url, timeout):
        raise TimeoutError("lento")

    contexto = types.SimpleNamespace(request=types.SimpleNamespace(get=get))

    assert conta_do_destino.conta_no_tiktok(contexto) == Conta("")


def test_le_a_conta_do_instagram_pelo_cookie_da_sessao():
    cookies = [{"name": "csrftoken", "value": "x"}, {"name": "ds_user_id", "value": "3524"}]
    contexto = types.SimpleNamespace(cookies=lambda origem: cookies)

    assert conta_do_destino.conta_no_instagram_web(contexto) == Conta("3524")


def test_instagram_deslogado_nao_tem_conta():
    contexto = types.SimpleNamespace(cookies=lambda origem: [{"name": "csrftoken", "value": "x"}])

    assert conta_do_destino.conta_no_instagram_web(contexto) == Conta("")


def _sessao_com(contexto, abertos):
    @contextmanager
    def sessao(perfil, *, abrir_em=None, executavel=None):
        abertos.append((perfil, abrir_em))
        yield types.SimpleNamespace(contexts=[contexto]), False

    return sessao


def test_conferir_no_navegador_abre_o_perfil_do_robo_e_barra_a_conta_errada(canal, monkeypatch):
    from app.services import navegador_assistido

    conta_do_destino.conferir_conta("instagram_web", Conta("3524"))
    abertos = []
    contexto = types.SimpleNamespace(cookies=lambda o: [{"name": "ds_user_id", "value": "9"}])
    monkeypatch.setattr(navegador_assistido, "sessao_no_chrome", _sessao_com(contexto, abertos))

    with pytest.raises(ContaDivergente):
        conta_do_destino._conferir_no_navegador("instagram_web", Path("perfil"), "https://ig")
    assert abertos == [(Path("perfil"), "https://ig")]


def test_navegador_que_nao_abre_nao_deixa_enviar(canal, monkeypatch):
    from app.services import navegador_assistido

    @contextmanager
    def nao_abre(perfil, *, abrir_em=None, executavel=None):
        raise ChromeNaoAbriu("sem Chrome")
        yield

    monkeypatch.setattr(navegador_assistido, "sessao_no_chrome", nao_abre)

    with pytest.raises(ContaIlegivel, match="sem Chrome"):
        conta_do_destino._conferir_no_navegador("tiktok", Path("perfil"), "https://tt")


# ─── Os robôs conferem antes de subir ────────────────────────────────────────

ROBOS = [
    pytest.param(tiktok_studio, "tiktok", tiktok_studio.URL_DO_UPLOAD, id="tiktok"),
    pytest.param(instagram_reels, "instagram_web", instagram_reels.URL_INICIAL, id="instagram"),
]


@pytest.mark.parametrize(("robo", "destino", "url"), ROBOS)
@pytest.mark.asyncio
async def test_robo_com_a_conta_errada_nao_sobe_o_video(robo, destino, url, monkeypatch, tmp_path):
    subidas = []
    conferidas = []

    async def conferir(destino_pedido, perfil, url_pedida):
        conferidas.append((destino_pedido, perfil, url_pedida))
        raise ContaDivergente("conta errada")

    monkeypatch.setattr(conta_do_destino, "conferir_no_navegador", conferir)
    monkeypatch.setattr(robo, "perfil_do_chrome", lambda: Path("perfil"))
    monkeypatch.setattr(robo, "_assistir", lambda *a: subidas.append(a))
    video = tmp_path / "v.mp4"
    video.write_bytes(b"v")

    with pytest.raises(ContaDivergente):
        await robo.subir_assistido(video=video, legenda="oi")

    assert conferidas == [(destino, Path("perfil"), url)]
    assert subidas == []


@pytest.mark.parametrize(("robo", "destino", "url"), ROBOS)
@pytest.mark.asyncio
async def test_robo_com_a_conta_certa_sobe_depois_de_conferir(
    robo, destino, url, monkeypatch, tmp_path
):
    ordem = []

    async def conferir(*_a):
        ordem.append("conferiu")

    monkeypatch.setattr(conta_do_destino, "conferir_no_navegador", conferir)
    monkeypatch.setattr(robo, "_assistir", lambda *a: ordem.append("subiu") or {"passos": []})
    video = tmp_path / "v.mp4"
    video.write_bytes(b"v")

    await robo.subir_assistido(video=video, legenda="oi")

    assert ordem == ["conferiu", "subiu"]
