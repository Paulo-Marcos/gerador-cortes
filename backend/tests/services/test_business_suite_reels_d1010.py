"""O robô que agenda Reels no Meta Business Suite (D-1010).

Cada dublê responde como a página real respondeu na medição de 02/11/2026.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from app.domain.publicacao.agendamento import Agendamento
from app.domain.publicacao.business_suite_reels import Passo, RoteiroInterrompido
from app.domain.publicacao.instagram_reels import Passo as PassoDoInstagram
from app.domain.publicacao.instagram_reels import RoteiroInterrompido as RoteiroDoInstagram
from app.services import business_suite_reels as robo
from app.services import destinos_assistidos, instagram_reels, publicacao_lote

EstadoItem = publicacao_lote.EstadoItem
QUANDO = Agendamento.de_texto("2026-11-09T19:35")


class PaginaFalsa:
    def __init__(self, **opcoes) -> None:
        self.url = "https://business.facebook.com/latest/reels_composer?asset_id=1"
        self.conta = opcoes.get("conta", "ateu.informa.cortes")
        self.ausentes = set(opcoes.get("ausentes", ()))
        self.data_mostrada = opcoes.get("data_mostrada", "Nov 9, 2026")
        self.periodo = opcoes.get("periodo", "PM")
        self.confirma = opcoes.get("confirma", True)
        self.etapas_ate_agendar = opcoes.get("etapas", 2)
        self.gestos: list[tuple] = []
        self.legenda = ""

    def abrir(self, url, *, segundos):
        self.gestos.append(("abrir", url))

    def url_atual(self):
        return self.url

    def existe(self, alvo, *, segundos, visivel=True):
        if alvo == "opcao_agendar":
            return self.etapas_ate_agendar == 0
        return alvo not in self.ausentes

    def texto_de(self, alvo):
        return self.conta if alvo == "conta_do_compositor" else self.legenda

    def enviar_pelo_seletor(self, alvo, caminho, *, segundos):
        self.gestos.append(("arquivo", alvo, caminho))

    def escrever(self, alvo, texto, *, segundos):
        self.gestos.append(("escrever", alvo, texto))
        if alvo == "editor_da_legenda":
            self.legenda = texto

    def clicar(self, alvo, *, segundos):
        self.gestos.append(("clicar", alvo))
        if alvo == "botao_agendar" and self.confirma:
            self.url = "https://business.facebook.com/latest/posts/scheduled_posts?asset_id=1"

    def substituir(self, alvo, texto, *, segundos):
        self.gestos.append(("substituir", alvo, texto))

    def clicar_ultimo(self, alvo, *, segundos):
        self.gestos.append(("clicar_ultimo", alvo))
        self.etapas_ate_agendar -= 1

    def digitar(self, alvo, texto, *, segundos):
        self.gestos.append(("digitar", alvo, texto))

    def apertar(self, tecla):
        self.gestos.append(("apertar", tecla))

    def valor_de(self, alvo):
        return self.data_mostrada

    def atributo_de(self, alvo, atributo):
        return {
            "campo_da_hora": "7",
            "campo_do_minuto": "35",
            "campo_do_periodo": self.periodo,
        }[alvo]

    def esperar_habilitado(self, alvo, *, segundos):
        self.gestos.append(("habilitado", alvo))

    def marcar(self, nome):
        self.gestos.append(("marcar", nome))


@pytest.fixture
def contas(monkeypatch):
    vistas: list = []
    monkeypatch.setattr(
        robo.conta_do_destino,
        "conferir_conta",
        lambda destino, conta: vistas.append((destino, conta.id)),
    )
    monkeypatch.setattr(robo, "SEGUNDOS_PARA_CONFIRMAR", 0.05)
    monkeypatch.setattr(robo, "INTERVALO_DA_CONFIRMACAO", 0.01)
    return vistas


@pytest.fixture
def arquivos(tmp_path) -> tuple[Path, Path]:
    video, capa = tmp_path / "reel.mp4", tmp_path / "capa.jpg"
    video.write_bytes(b"v")
    capa.write_bytes(b"c")
    return video, capa


def _rodar(pagina, arquivos, **opcoes):
    video, capa = arquivos
    return robo.executar_roteiro(
        pagina,
        video=video,
        legenda="legenda #d1010",
        capa=opcoes.pop("capa", capa),
        agendamento=QUANDO,
        **opcoes,
    )


def test_marca_dia_e_hora_e_para_antes_de_agendar(contas, arquivos):
    pagina = PaginaFalsa()

    relatorio = _rodar(pagina, arquivos, marca="m1")

    assert ("substituir", "campo_da_data", "11/09/2026") in pagina.gestos
    assert ("digitar", "campo_da_hora", "07") in pagina.gestos
    assert ("digitar", "campo_do_minuto", "35") in pagina.gestos
    assert ("digitar", "campo_do_periodo", "PM") in pagina.gestos
    assert ("marcar", "m1") in pagina.gestos
    assert ("clicar", "botao_agendar") not in pagina.gestos
    assert relatorio["publicado"] is False
    assert relatorio["capa_aplicada"] is True
    assert relatorio["agendado_para"] == "09/11/2026 as 19:35"


def test_a_data_e_conferida_depois_de_tirar_o_foco(contas, arquivos):
    """Medido: antes de sair do campo ele mostra 11/9/2026, e só depois vira Nov 9, 2026."""
    pagina = PaginaFalsa()

    _rodar(pagina, arquivos)

    assert pagina.gestos.index(("clicar", "titulo_do_agendamento")) > pagina.gestos.index(
        ("digitar", "campo_do_periodo", "PM")
    )


def test_publicar_sozinho_clica_e_exige_a_lista_de_agendados(contas, arquivos):
    pagina = PaginaFalsa()

    relatorio = _rodar(pagina, arquivos, publicar_sozinho=True)

    assert ("clicar", "botao_agendar") in pagina.gestos
    assert relatorio["publicado"] is True
    assert Passo.PUBLICAR.value in relatorio["passos"]


def test_sem_a_lista_de_agendados_nao_declara_agendado(contas, arquivos):
    with pytest.raises(RoteiroInterrompido) as erro:
        _rodar(PaginaFalsa(confirma=False), arquivos, publicar_sozinho=True)

    assert erro.value.passo is Passo.PUBLICAR


def test_capa_que_nao_entrou_segura_o_publicar_sozinho(contas, arquivos):
    """RN-26: sem a capa confirmada, a aba fica pronta e nada é agendado sozinho."""
    pagina = PaginaFalsa(ausentes={"capa_trocada"})

    relatorio = _rodar(pagina, arquivos, publicar_sozinho=True)

    assert ("clicar", "botao_agendar") not in pagina.gestos
    assert relatorio["publicado"] is False
    assert any("Troque a capa" in aviso for aviso in relatorio["avisos"])


@pytest.mark.parametrize(
    ("opcoes", "trecho"),
    [
        ({"data_mostrada": "Nov 10, 2026"}, "pedi 2026-11-09"),
        ({"periodo": "AM"}, "pedi 07:35 PM"),
    ],
)
def test_data_ou_hora_diferentes_nao_chegam_ao_botao(contas, arquivos, opcoes, trecho):
    pagina = PaginaFalsa(**opcoes)

    with pytest.raises(RoteiroInterrompido, match=trecho) as erro:
        _rodar(pagina, arquivos, publicar_sozinho=True)

    assert erro.value.passo is Passo.AGENDAMENTO
    assert ("clicar", "botao_agendar") not in pagina.gestos


def test_a_conta_do_compositor_passa_pela_conferencia_do_canal(contas, arquivos):
    """RN-31: é o nome no seletor "Share to" que vai para a regra de sempre."""
    _rodar(PaginaFalsa(conta="\u200b\nateu.informa.cortes\n\u200b"), arquivos)

    assert contas == [("instagram_business", "ateu.informa.cortes")]


def test_sem_sessao_manda_entrar_no_business_suite(contas, arquivos):
    pagina = PaginaFalsa(ausentes={"botao_do_video"})
    pagina.url = "https://business.facebook.com/business/loginpage/?next=x"

    with pytest.raises(RoteiroInterrompido, match="Continuar") as erro:
        _rodar(pagina, arquivos)

    assert erro.value.passo is Passo.SESSAO


def test_avanca_pelo_ultimo_next_ate_a_opcao_de_agendar(contas, arquivos):
    """Medido: com o carrossel de miniaturas há dois "Next", e o do rodapé é o último."""
    pagina = PaginaFalsa(etapas=2)

    _rodar(pagina, arquivos)

    assert pagina.gestos.count(("clicar_ultimo", "botao_avancar")) == 2


def test_com_data_o_destino_usa_o_business_suite():
    destino = destinos_assistidos.DestinoInstagramReelsAssistido(agendamento=QUANDO)

    assert destino.agenda_sozinho is True
    assert destino._robo().__name__.endswith("business_suite_reels")


def test_sem_data_o_destino_continua_no_instagram_com():
    destino = destinos_assistidos.DestinoInstagramReelsAssistido()

    assert destino._robo().__name__.endswith("instagram_reels")


@pytest.mark.asyncio
async def test_clique_sem_confirmacao_vira_conferir_na_aba(monkeypatch):
    """O Reel pode ter sido agendado: a raia vigia a aba, em vez de declarar erro."""

    async def pacote_pronto(self, pacote):
        return {"plataforma": "instagram_reels", "video": "reel.mp4", "capa": "capa.jpg"}

    async def subir(self, pronto, marca, publicar_sozinho):
        raise RoteiroInterrompido(Passo.PUBLICAR, "sem lista")

    monkeypatch.setattr(destinos_assistidos.DestinoManual, "publicar", pacote_pronto)
    monkeypatch.setattr(destinos_assistidos.DestinoInstagramReelsAssistido, "_subir", subir)
    destino = destinos_assistidos.DestinoInstagramReelsAssistido(agendamento=QUANDO)

    with pytest.raises(destinos_assistidos.ConferirNaAba):
        await destino.publicar(None)


@pytest.mark.asyncio
async def test_a_faxina_so_fecha_a_aba_do_que_ja_foi_agendado(monkeypatch):
    perguntas = {}

    def fechar(perfil, fica):
        perguntas["agendado"] = fica(
            SimpleNamespace(url="https://business.facebook.com/latest/posts/scheduled_posts")
        )
        perguntas["compositor"] = fica(
            SimpleNamespace(url="https://business.facebook.com/latest/reels_composer")
        )
        return 1

    monkeypatch.setattr(destinos_assistidos.abas_do_robo, "fechar_abas_que_sobraram", fechar)
    monkeypatch.setattr(instagram_reels, "perfil_do_chrome", lambda: Path("perfil"))

    assert await destinos_assistidos.DestinoInstagramReelsAssistido.fechar_abas() == 1
    assert perguntas == {"agendado": False, "compositor": True}


@pytest.mark.asyncio
async def test_erro_do_robo_traz_a_janela_para_a_tela():
    """A orientação de login manda agir numa janela que nasce fora da tela."""

    class Destino(destinos_assistidos.DestinoInstagramReelsAssistido):
        mostradas = 0

        async def mostrar_janela(self):
            type(self).mostradas += 1
            return True

    await publicacao_lote._mostrar_se_for_a_vez(
        [SimpleNamespace(estado=EstadoItem.ERRO)], Destino()
    )

    assert Destino.mostradas == 1


def test_legenda_nao_confirmada_segura_o_clique(contas, arquivos):
    class LegendaQueNaoFica(PaginaFalsa):
        def texto_de(self, alvo):
            return self.conta if alvo == "conta_do_compositor" else "outro texto"

    pagina = LegendaQueNaoFica()

    relatorio = _rodar(pagina, arquivos, publicar_sozinho=True)

    assert ("clicar", "botao_agendar") not in pagina.gestos
    assert relatorio["publicado"] is False


def test_conta_que_nao_se_le_chega_vazia_na_regra(contas, arquivos):
    """RN-31: é a regra de sempre que recusa, com a mensagem de conta ilegível."""
    _rodar(PaginaFalsa(ausentes={"conta_do_compositor"}), arquivos)

    assert contas == [("instagram_business", "")]


@pytest.mark.asyncio
async def test_clique_sem_confirmacao_no_instagram_com_tambem_vira_conferir(monkeypatch):
    """O post pode ter saído; ERRO convidaria a subir de novo e duplicar (D-894)."""

    async def pacote_pronto(self, pacote):
        return {"plataforma": "instagram_reels", "video": "reel.mp4", "capa": "capa.jpg"}

    async def subir(self, pronto, marca, publicar_sozinho):
        raise RoteiroDoInstagram(PassoDoInstagram.PUBLICAR, "sem confirmacao")

    monkeypatch.setattr(destinos_assistidos.DestinoManual, "publicar", pacote_pronto)
    monkeypatch.setattr(destinos_assistidos.DestinoInstagramReelsAssistido, "_subir", subir)

    with pytest.raises(destinos_assistidos.ConferirNaAba):
        await destinos_assistidos.DestinoInstagramReelsAssistido().publicar(None)
