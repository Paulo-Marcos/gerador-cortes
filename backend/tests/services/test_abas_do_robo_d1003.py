"""D-1003: no fim do lote, o Chrome do robô fica sem as abas que o robô abriu.

O sintoma era "sempre sobra uma aba". A sobra é a aba de LANÇAMENTO: o Chrome
nasce com uma URL (a conferência da conta do TikTok, o Studio do YouTube), e o
roteiro trabalha numa aba nova. A dele fecha; a de lançamento, ninguém fechava.

O Chrome aqui é de mentira, mas guarda as abas entre uma conexão e outra, como
o de verdade — é isso que deixa a sobra aparecer. Fora dele, o caminho é o real:
a raia do lote, o destino assistido, a conferência da conta, a vigília e o
roteiro do Studio.
"""

from contextlib import contextmanager
from pathlib import Path

import pytest
from app.domain.publicacao.conta_do_destino import Conta
from app.domain.publicacao.publicacao import Plataforma
from app.domain.publicacao.ritmo_publicacao import EstadoItem
from app.services import (
    capa_no_tiktok_studio,
    conta_do_destino,
    janela_do_robo,
    navegador_assistido,
    navegador_do_robo,
    studio_youtube,
    tiktok_studio,
)
from app.services import publicacao_lote as lote_svc

from tests.services.test_publicacao_lote_d564 import _rodar, ambiente  # noqa: F401

URL_PUBLICADO = "https://www.tiktok.com/tiktokstudio/content"


class AbaFalsa:
    def __init__(self, chrome: "ChromeFalso", url: str) -> None:
        self._chrome = chrome
        self.url = url
        self.nome = ""

    def goto(self, url, **_kwargs) -> None:
        self.url = url

    def evaluate(self, script, *args):
        if args:  # `marcar`: window.name = nome
            self.nome = args[0]
            return None
        return self.nome

    def is_closed(self) -> bool:
        return self not in self._chrome.abas

    def wait_for_timeout(self, _ms) -> None:
        return None

    def close(self) -> None:
        self._chrome.fechar(self)


class _Contexto:
    def __init__(self, chrome: "ChromeFalso") -> None:
        self._chrome = chrome

    @property
    def pages(self) -> list:
        return list(self._chrome.abas)

    def new_page(self) -> AbaFalsa:
        return self._chrome.abrir_aba("about:blank")

    def new_cdp_session(self, _pagina):
        class _Sessao:
            def send(self, *_args, **_kwargs):
                return {}

        return _Sessao()


class ChromeFalso:
    """Um Chrome por perfil: nasce com a aba da URL pedida e morre sem abas."""

    def __init__(self, perfil: Path) -> None:
        self.perfil = perfil
        self.abas: list[AbaFalsa] = []
        self.no_ar = False
        self.contexto = _Contexto(self)

    def abrir_aba(self, url: str) -> AbaFalsa:
        aba = AbaFalsa(self, url)
        self.abas.append(aba)
        return aba

    def fechar(self, aba: AbaFalsa) -> None:
        if aba in self.abas:
            self.abas.remove(aba)
        # Fechar a última aba fecha o Chrome, como no Windows.
        self.no_ar = bool(self.abas)

    @property
    def contexts(self) -> list:
        return [self.contexto] if self.no_ar else []

    @contextmanager
    def sessao(self, perfil, *, abrir_em=None, executavel=None):
        assert Path(perfil) == self.perfil
        abriu_agora = False
        if abrir_em is not None and not self.no_ar:
            self.no_ar = True
            self.abrir_aba(abrir_em)
            abriu_agora = True
        with janela_do_robo.em_uso(Path(perfil)):
            yield self, abriu_agora

    def ligar(self, monkeypatch) -> None:
        """Responde, na porta, como o Chrome DESTE perfil — só quando está no ar."""
        monkeypatch.setattr(
            navegador_assistido,
            "perfil_na_porta",
            lambda _p: str(self.perfil) if self.no_ar else "",
        )
        monkeypatch.setattr(navegador_assistido, "_porta_responde", lambda _p: self.no_ar)


@pytest.fixture
def chrome_do_tiktok(ambiente, monkeypatch, tmp_path):  # noqa: F811
    chrome = ChromeFalso(tmp_path / "browser" / "tiktok")
    chrome.ligar(monkeypatch)
    monkeypatch.setattr(navegador_assistido, "sessao_no_chrome", chrome.sessao)
    monkeypatch.setattr(tiktok_studio, "sessao_no_chrome", chrome.sessao)
    monkeypatch.setattr(tiktok_studio, "perfil_do_chrome", lambda: chrome.perfil)
    monkeypatch.setattr(tiktok_studio, "executavel_escolhido", lambda: None)
    monkeypatch.setattr(navegador_do_robo, "executavel_escolhido", lambda: None)
    monkeypatch.setattr(tiktok_studio, "INTERVALO_DA_VIGILIA", 0)
    # A conta confere certo: o que importa aqui é a aba que a conferência abre.
    monkeypatch.setitem(conta_do_destino._LEITORES, "tiktok", lambda _c: Conta("1", "@canal"))
    monkeypatch.setattr(conta_do_destino, "conferir_conta", lambda *_a: None)
    monkeypatch.setattr(capa_no_tiktok_studio, "PaginaNoTikTok", lambda page, _s: page)

    def roteiro(page, *, marca="", publicar_sozinho=False, **_kwargs):
        """O roteiro sem o TikTok: abre o upload, marca a aba e, pedido, publica."""
        page.goto(tiktok_studio.URL_DO_UPLOAD)
        page.evaluate("(nome) => { window.name = nome; }", marca)
        if publicar_sozinho:
            page.goto(URL_PUBLICADO)
        return {"passos": [], "resumo": "ok", "avisos": [], "publicado": publicar_sozinho}

    monkeypatch.setattr(tiktok_studio, "executar_roteiro", roteiro)
    return chrome


async def _lote_no_tiktok(ambiente, **opcoes):  # noqa: F811
    _, raias = ambiente
    lote = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1"), (lote_svc.ALVO_SHORT, "s2")],
        plataformas=[Plataforma.TIKTOK],
        opcoes=lote_svc.OpcoesDoLote(tiktok_assistido=True, **opcoes),
    )
    await _rodar(raias)
    return lote


@pytest.mark.asyncio
async def test_lote_do_tiktok_publicado_pelo_operador_nao_deixa_aba(
    ambiente,  # noqa: F811
    chrome_do_tiktok,
    monkeypatch,
):
    """O operador publica as duas abas; a vigília vê, e no fim nada sobra."""
    publicar = tiktok_studio.executar_roteiro

    def operador_publica(page, **kwargs):
        relatorio = publicar(page, **kwargs)
        page.goto(URL_PUBLICADO)  # o clique do operador, que a vigília vai ver
        return relatorio

    monkeypatch.setattr(tiktok_studio, "executar_roteiro", operador_publica)

    lote = await _lote_no_tiktok(ambiente)

    assert all(i.estado is EstadoItem.PUBLICADO for i in lote.itens)
    assert [aba.url for aba in chrome_do_tiktok.abas] == []


@pytest.mark.asyncio
async def test_lote_do_tiktok_publicado_pelo_robo_nao_deixa_aba(
    ambiente,  # noqa: F811
    chrome_do_tiktok,
):
    """Com `publicar_sozinho` não há vigília para fechar a aba: fecha o fim do lote."""
    lote = await _lote_no_tiktok(ambiente, publicar_sozinho=True)

    assert all(i.estado is EstadoItem.PUBLICADO for i in lote.itens)
    assert [aba.url for aba in chrome_do_tiktok.abas] == []


@pytest.mark.asyncio
async def test_aba_esperando_o_publicar_fica_aberta_no_fim_do_lote(
    ambiente,  # noqa: F811
    chrome_do_tiktok,
    monkeypatch,
):
    """A vigília desistiu sem ver o post: a aba ainda tem o upload pronto e fica.

    Fechá-la jogaria fora o envio; a de lançamento, que não espera ninguém, sai.
    """
    aguardar = tiktok_studio.aguardar_publicacao

    async def vigilia_sem_prazo(**kwargs):
        return await aguardar(**{**kwargs, "segundos": 0})

    monkeypatch.setattr(tiktok_studio, "aguardar_publicacao", vigilia_sem_prazo)

    lote = await _lote_no_tiktok(ambiente)

    assert all(i.estado is EstadoItem.SUA_VEZ for i in lote.itens)
    assert [aba.url for aba in chrome_do_tiktok.abas] == [tiktok_studio.URL_DO_UPLOAD] * 2


@pytest.fixture
def studio(monkeypatch, tmp_path):
    """A fila do Studio sobre o Chrome de mentira; devolve o Chrome e o que rodar."""
    chrome = ChromeFalso(tmp_path / "browser" / "youtube")
    chrome.ligar(monkeypatch)
    monkeypatch.setattr(navegador_assistido, "sessao_no_chrome", chrome.sessao)
    monkeypatch.setattr(navegador_do_robo, "perfil_da_plataforma", lambda _p: chrome.perfil)
    monkeypatch.setattr(navegador_do_robo, "executavel_escolhido", lambda: None)
    monkeypatch.setattr(
        studio_youtube, "ler_configuracao", lambda: {"monetizar": True, "relacionar_short": True}
    )
    monkeypatch.setattr(studio_youtube, "RESPIRO_ANTES_DE_COMECAR", 0)
    monkeypatch.setattr(studio_youtube, "_pendentes", [])
    monkeypatch.setattr(studio_youtube, "_trabalhando", False)
    monkeypatch.setattr(janela_do_robo, "mostrar", lambda _conexao: True)
    trabalhos: list = []
    monkeypatch.setattr(
        studio_youtube, "fire_and_forget", lambda coro, name=None: trabalhos.append(coro)
    )
    # O Studio em si fica de fora; o roteiro real fecha a aba dele quando dá certo.
    monkeypatch.setattr(studio_youtube, "_relacionar_todos", lambda _p, _t: [])
    monkeypatch.setattr(studio_youtube, "_pediu_login", lambda _p: False)

    async def rodar(*video_ids: str) -> None:
        for video_id in video_ids:
            studio_youtube.agendar(video_id)
        for trabalho in trabalhos:
            await trabalho

    return chrome, rodar


@pytest.mark.asyncio
async def test_lote_do_studio_do_youtube_nao_deixa_aba(studio, monkeypatch):
    """Três vídeos entram na fila do Studio; o robô trabalha e não deixa aba."""
    chrome, rodar = studio
    monkeypatch.setattr(studio_youtube, "_monetizar_tudo", lambda _p, _t: [])

    await rodar("v1", "v2", "v3")

    assert [aba.url for aba in chrome.abas] == []


@pytest.mark.asyncio
async def test_lote_do_studio_que_falhou_deixa_a_aba_para_o_operador(studio, monkeypatch):
    """Com falha a aba fica: é nela que o operador lê o motivo."""
    chrome, rodar = studio
    monkeypatch.setattr(studio_youtube, "_monetizar_tudo", lambda _p, _t: ["nao monetizou"])

    await rodar("v1", "v2")

    assert chrome.abas
