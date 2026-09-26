"""A sessão no Chrome e a vigília dos dois robôs de publicação (D-718).

Teste de caracterização, antes de levar o encanamento comum para
`navegador_assistido`. `_assistir` e `_vigiar_publicacao` falam com o Chrome de
verdade e nenhum teste os executava. Aqui o Playwright é um dublê instalado em
`sys.modules`: fixa a ordem (Playwright → Chrome → conexão), o que vira
`RoteiroInterrompido` e o que sobe cru, que a desconexão acontece sempre, e cada
motivo de a vigília parar — nos dois robôs, que é onde mora a duplicação.
"""

import sys
import threading
import types
from pathlib import Path

import pytest
from app.domain.publicacao import instagram_reels as dominio_ig
from app.domain.publicacao import tiktok_studio as dominio_tt
from app.services import instagram_reels, navegador_assistido, tiktok_studio
from app.services.navegador_assistido import NavegadorIndisponivel

ROBOS = [
    pytest.param(tiktok_studio, dominio_tt, id="tiktok"),
    pytest.param(instagram_reels, dominio_ig, id="instagram"),
]
PORTA = 9333


class PageFalsa:
    def __init__(self, url=""):
        self.url = url
        self.fechada = False

    def is_closed(self):
        return self.fechada


class ContextoFalso:
    def __init__(self):
        self.pages = []

    def new_page(self):
        page = PageFalsa()
        self.pages.append(page)
        return page


class PlaywrightFalso:
    """`sync_playwright().start()` devolve isto; `chromium` também."""

    def __init__(self, *, contextos=1, falha_ao_conectar=None):
        self.contextos = [ContextoFalso() for _ in range(contextos)]
        self.criados = []
        self.falha_ao_conectar = falha_ao_conectar
        self.conectado_em = None
        self.parado = False

    def start(self):
        return self

    @property
    def chromium(self):
        return self

    def connect_over_cdp(self, url):
        if self.falha_ao_conectar:
            raise self.falha_ao_conectar
        self.conectado_em = url
        navegador = types.SimpleNamespace(contexts=list(self.contextos))

        def new_context():
            contexto = ContextoFalso()
            self.criados.append(contexto)
            return contexto

        navegador.new_context = new_context
        return navegador

    def stop(self):
        self.parado = True


@pytest.fixture
def playwright(monkeypatch):
    """Instala o dublê; `instalar(None)` simula o Playwright ausente."""

    def instalar(falso):
        if falso is None:
            monkeypatch.setitem(sys.modules, "playwright.sync_api", None)
        else:
            monkeypatch.setitem(sys.modules, "playwright", types.ModuleType("playwright"))
            modulo = types.ModuleType("playwright.sync_api")
            modulo.sync_playwright = lambda: falso
            monkeypatch.setitem(sys.modules, "playwright.sync_api", modulo)
        return falso

    return instalar


@pytest.fixture
def ambiente(monkeypatch):
    """Perfil, porta e abertura do Chrome sob controle, nos dois robôs."""
    registro = {"abriu": [], "ordem": []}

    def garantir(perfil, url):
        registro["ordem"].append("chrome")
        registro["abriu"].append((perfil, url))
        return True

    for robo in (tiktok_studio, instagram_reels):
        monkeypatch.setattr(robo, "perfil_do_chrome", lambda: Path("perfil"))
    monkeypatch.setattr(navegador_assistido, "porta_do_chrome", lambda _perfil: PORTA)
    monkeypatch.setattr(navegador_assistido, "garantir_chrome", garantir)
    return registro


def _assistir(robo):
    return robo._assistir(Path("v.mp4"), "legenda", None, "marca-1", False)


# ─── A sessão do roteiro (_assistir) ─────────────────────────────────────────


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_sem_playwright_para_no_abrir_antes_de_tocar_no_chrome(robo, dominio, playwright, ambiente):
    playwright(None)

    with pytest.raises(dominio.RoteiroInterrompido) as exc:
        _assistir(robo)

    assert exc.value.passo == dominio.Passo.ABRIR
    assert "pip install playwright" in exc.value.detalhe
    assert ambiente["abriu"] == []


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_chrome_que_nao_abre_vira_falha_no_abrir(robo, dominio, playwright, monkeypatch):
    falso = playwright(PlaywrightFalso())

    def nao_abre(_perfil, _url):
        raise NavegadorIndisponivel("Chrome nao encontrado")

    monkeypatch.setattr(robo, "perfil_do_chrome", lambda: Path("perfil"))
    monkeypatch.setattr(navegador_assistido, "garantir_chrome", nao_abre)

    with pytest.raises(dominio.RoteiroInterrompido) as exc:
        _assistir(robo)

    assert (exc.value.passo, exc.value.detalhe) == (dominio.Passo.ABRIR, "Chrome nao encontrado")
    assert falso.conectado_em is None


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_porta_ocupada_sobe_crua_e_desconecta(robo, dominio, playwright, ambiente, monkeypatch):
    falso = playwright(PlaywrightFalso())

    def ocupada(_perfil):
        raise NavegadorIndisponivel("portas ocupadas")

    monkeypatch.setattr(navegador_assistido, "porta_do_chrome", ocupada)

    with pytest.raises(NavegadorIndisponivel, match="portas ocupadas"):
        _assistir(robo)

    assert falso.parado


@pytest.mark.parametrize(
    ("robo", "url", "escapar"),
    [
        (tiktok_studio, tiktok_studio.URL_DO_UPLOAD, True),
        (instagram_reels, instagram_reels.URL_INICIAL, False),
    ],
    ids=["tiktok", "instagram"],
)
def test_roteiro_roda_numa_aba_nova_do_chrome_conectado(
    robo, url, escapar, playwright, ambiente, monkeypatch
):
    falso = playwright(PlaywrightFalso())
    recebido = {}

    def roteiro(pagina, **kwargs):
        recebido.update(pagina=pagina, **kwargs)
        return {"passos": ["abrir"]}

    monkeypatch.setattr(robo, "executar_roteiro", roteiro)
    monkeypatch.setattr(robo, "apagar_copias_do_upload", lambda *a: False, raising=False)

    relatorio = _assistir(robo)

    assert relatorio == {"passos": ["abrir"], "chrome_aberto_agora": True}
    assert ambiente["abriu"] == [(Path("perfil"), url)]
    assert falso.conectado_em == f"http://127.0.0.1:{PORTA}"
    (aba,) = falso.contextos[0].pages
    assert recebido["pagina"]._page is aba
    assert recebido["pagina"]._seletores is robo.SELETORES
    assert recebido["pagina"]._escapar_apos_escrever is escapar
    assert (recebido["video"], recebido["legenda"], recebido["marca"]) == (
        Path("v.mp4"),
        "legenda",
        "marca-1",
    )
    assert falso.parado


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_sem_contexto_aberto_cria_um(robo, dominio, playwright, ambiente, monkeypatch):
    falso = playwright(PlaywrightFalso(contextos=0))
    monkeypatch.setattr(robo, "executar_roteiro", lambda pagina, **_k: {})
    monkeypatch.setattr(robo, "apagar_copias_do_upload", lambda *a: False, raising=False)

    _assistir(robo)

    (criado,) = falso.criados
    assert len(criado.pages) == 1


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_roteiro_que_falha_ainda_desconecta(robo, dominio, playwright, ambiente, monkeypatch):
    falso = playwright(PlaywrightFalso())

    def quebra(_pagina, **_k):
        raise dominio.RoteiroInterrompido(dominio.Passo.ARQUIVO)

    monkeypatch.setattr(robo, "executar_roteiro", quebra)
    monkeypatch.setattr(robo, "apagar_copias_do_upload", lambda *a: False, raising=False)

    with pytest.raises(dominio.RoteiroInterrompido):
        _assistir(robo)

    assert falso.parado


def test_o_tiktok_apaga_as_copias_antigas_antes_de_abrir_a_aba(playwright, ambiente, monkeypatch):
    falso = playwright(PlaywrightFalso())
    ordem = []
    monkeypatch.setattr(
        tiktok_studio,
        "apagar_copias_do_upload",
        lambda contexto, origem, trecho: ordem.append(("apagar", len(contexto.pages), origem)),
    )
    monkeypatch.setattr(
        tiktok_studio, "executar_roteiro", lambda pagina, **_k: ordem.append("roteiro") or {}
    )

    _assistir(tiktok_studio)

    assert ordem == [("apagar", 0, tiktok_studio.ORIGEM_DO_TIKTOK), "roteiro"]
    assert falso.parado


# ─── A vigília (_vigiar_publicacao) ──────────────────────────────────────────


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_vigilia_sem_playwright_diz_nao_sei(robo, dominio, playwright, ambiente):
    playwright(None)

    assert robo._vigiar_publicacao(5, "marca-1") is False


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_vigilia_nao_abre_o_chrome_e_sem_contexto_diz_nao_sei(robo, dominio, playwright, ambiente):
    falso = playwright(PlaywrightFalso(contextos=0))

    assert robo._vigiar_publicacao(5, "marca-1") is False
    assert ambiente["abriu"] == [] and falso.criados == [] and falso.parado


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_vigilia_sem_a_aba_marcada_diz_nao_sei(robo, dominio, playwright, ambiente, monkeypatch):
    falso = playwright(PlaywrightFalso())
    procurada = {}

    def aba(contexto, marca, url_padrao):
        procurada.update(marca=marca, url=url_padrao)

    monkeypatch.setattr(robo, "aba_marcada", aba)

    assert robo._vigiar_publicacao(5, "marca-1") is False
    assert procurada["marca"] == "marca-1" and falso.parado


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_vigilia_que_quebra_diz_nao_sei_e_desconecta(robo, dominio, playwright, ambiente):
    falso = playwright(PlaywrightFalso(falha_ao_conectar=RuntimeError("cdp caiu")))

    assert robo._vigiar_publicacao(5, "marca-1") is False
    assert falso.parado


@pytest.fixture
def aba_do_robo(monkeypatch, playwright, ambiente):
    """A aba marcada existe; devolve a aba e o dublê do Playwright."""
    falso = playwright(PlaywrightFalso())
    aba = PageFalsa("https://www.tiktok.com/tiktokstudio/upload?from=upload")
    falso.contextos[0].pages.append(aba)
    for robo in (tiktok_studio, instagram_reels):
        monkeypatch.setattr(robo, "aba_marcada", lambda contexto, marca, url: aba)
        monkeypatch.setattr(robo, "INTERVALO_DA_VIGILIA", 0.0)
    return aba, falso


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_vigilia_cancelada_pelo_lote(robo, dominio, aba_do_robo):
    parar = threading.Event()
    parar.set()

    assert robo._vigiar_publicacao(5, "marca-1", parar) is False


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_vigilia_com_a_aba_fechada(robo, dominio, aba_do_robo):
    aba, _ = aba_do_robo
    aba.fechada = True

    assert robo._vigiar_publicacao(5, "marca-1") is False


def test_tiktok_publicado_quando_a_aba_navega_e_a_copia_sai(aba_do_robo, monkeypatch):
    aba, falso = aba_do_robo
    aba.url = "https://www.tiktok.com/tiktokstudio/content"
    apagadas = []
    monkeypatch.setattr(
        tiktok_studio,
        "apagar_copias_do_upload",
        lambda contexto, origem, trecho: apagadas.append((origem, trecho)) or True,
    )

    assert tiktok_studio._vigiar_publicacao(5, "marca-1") is True
    assert apagadas == [(tiktok_studio.ORIGEM_DO_TIKTOK, tiktok_studio.TRECHO_DA_ABA_DE_UPLOAD)]
    assert falso.parado


@pytest.mark.parametrize(("robo", "dominio"), ROBOS)
def test_vigilia_sem_prazo_diz_nao_sei(robo, dominio, aba_do_robo):
    assert robo._vigiar_publicacao(0, "marca-1") is False


class AbaQuePublicaNaSegundaOlhada(PageFalsa):
    def __init__(self):
        super().__init__()
        self.olhadas = 0

    @property
    def url(self):
        self.olhadas += 1
        if self.olhadas < 2:
            return "https://www.tiktok.com/tiktokstudio/upload?from=upload"
        return "https://www.tiktok.com/tiktokstudio/content"

    @url.setter
    def url(self, _valor):
        pass


def test_tiktok_espera_ate_a_aba_navegar(aba_do_robo, monkeypatch):
    aba = AbaQuePublicaNaSegundaOlhada()
    monkeypatch.setattr(tiktok_studio, "aba_marcada", lambda contexto, marca, url: aba)
    monkeypatch.setattr(tiktok_studio, "apagar_copias_do_upload", lambda *a: False)

    assert tiktok_studio._vigiar_publicacao(5, "marca-1") is True
    assert aba.olhadas >= 2


class PaginaDoInstagramFalsa:
    """Responde `existe` pelo roteiro de cada volta da vigília."""

    voltas: list[dict] = []

    def __init__(self, page, seletores, *, escapar_apos_escrever=True):
        self.page, self.seletores, self.escapar = page, seletores, escapar_apos_escrever
        self.feitas = 0

    def existe(self, alvo, *, segundos, visivel=True):
        volta = self.voltas[min(self.feitas, len(self.voltas) - 1)]
        if alvo == "dialogo":
            self.feitas += 1
        return volta.get(alvo, False)


@pytest.fixture
def instagram_na_aba(aba_do_robo, monkeypatch):
    fechadas = []
    monkeypatch.setattr(instagram_reels, "PaginaDoPlaywright", PaginaDoInstagramFalsa)
    monkeypatch.setattr(instagram_reels, "_fechar_confirmacao", fechadas.append)
    return fechadas


def test_instagram_publicado_quando_a_confirmacao_aparece(instagram_na_aba):
    PaginaDoInstagramFalsa.voltas = [{"dialogo": True}, {"confirmacao_de_envio": True}]

    assert instagram_reels._vigiar_publicacao(5, "marca-1") is True
    (pagina,) = instagram_na_aba
    assert pagina.seletores is instagram_reels.SELETORES and pagina.escapar is False


def test_instagram_com_o_compositor_sumido_sem_confirmar(instagram_na_aba):
    PaginaDoInstagramFalsa.voltas = [{"dialogo": False}]

    assert instagram_reels._vigiar_publicacao(5, "marca-1") is False
    assert instagram_na_aba == []
