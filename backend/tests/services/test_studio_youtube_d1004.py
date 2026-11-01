"""Timeouts ao ligar a monetização pelo robô do Studio (D-1004).

A causa foi inferida pelo código, não por log: a PROD não grava o console do
robô em arquivo desde 29/09. Duas esperas tinham prazo menor do que parecia:

- o aviso "N of M updated": o laço de `_esperar_aviso` tem 300 s, mas cada volta
  lia o texto com `inner_text()`, que espera o padrão de 30 s do Playwright pelo
  aviso e levanta se ele ainda não está na página — o lote maior que a D-959
  trouxe (até 3 vídeos a mais por aba, ~12 s cada) passa disso;
- a caixa da linha: 5 s para o Studio montar o componente, e um estouro numa
  única linha derrubava o lote inteiro, das duas abas.

Pedido → teste:
  - a espera que estoura, reproduzida → `test_aviso_que_demora_mais_que_o_padrao_*`,
    `test_caixa_da_linha_lenta_*`
  - o erro diz qual etapa falhou → `test_falha_numa_etapa_diz_a_aba_e_a_etapa`,
    `test_linha_que_nao_responde_diz_o_video_e_a_etapa`
  - não derruba o resto do lote → `test_linha_que_nao_responde_*`,
    `test_uma_aba_que_falha_nao_impede_a_outra`
"""

import pytest
from app.domain.publicacao.studio_youtube import TarefaNoStudio
from app.services import studio_youtube

from tests.services.test_studio_youtube_d895 import PaginaFalsa

CORTE = "corteLongo1"
OUTRO = "outroVideo1"
SHORT = "shortCurto1"
ESTOURO_DO_PADRAO = "Locator.inner_text: Timeout 30000ms exceeded."


class AvisoQueDemora(PaginaFalsa):
    """O aviso só entra na página depois de algumas conferências, como num lote grande.

    Antes disso, ler o texto dele faz o que o Playwright faz com um elemento
    ausente: espera o padrão de 30 s e levanta.
    """

    def __init__(self, *, conferencias_ate_o_aviso=3, **kwargs):
        super().__init__(**kwargs)
        self.faltam = conferencias_ate_o_aviso

    def aguardar(self, segundos):
        super().aguardar(segundos)
        self.faltam -= 1

    def existe(self, alvo, *, segundos, visivel=True):
        if alvo == "aviso":
            return self.faltam <= 0
        return super().existe(alvo, segundos=segundos, visivel=visivel)

    def texto_de(self, alvo):
        if alvo == "aviso" and self.faltam > 0:
            raise RuntimeError(ESTOURO_DO_PADRAO)
        return super().texto_de(alvo)


def test_aviso_que_demora_mais_que_o_padrao_nao_derruba_a_monetizacao(monkeypatch):
    monkeypatch.setattr(studio_youtube, "PRAZO_DA_ATUALIZACAO", 5)
    pagina = AvisoQueDemora()

    falhas = studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(CORTE, monetizar=True)])

    assert falhas == []
    assert pagina.fechada


class LinhaQueNaoResponde(PaginaFalsa):
    """A caixa de uma linha estoura o prazo — o Playwright levanta, não devolve `False`."""

    def __init__(self, *, travada, **kwargs):
        super().__init__(**kwargs)
        self.travada = travada

    def marcar_video(self, alvo, video_id, *, segundos):
        if video_id == self.travada:
            raise RuntimeError("Locator.click: Timeout 5000ms exceeded.")
        return super().marcar_video(alvo, video_id, segundos=segundos)


def test_linha_que_nao_responde_nao_derruba_o_lote():
    pagina = LinhaQueNaoResponde(travada=OUTRO, aviso="1 of 1 video successfully updated")

    falhas = studio_youtube.executar_roteiro(
        pagina, [TarefaNoStudio(CORTE, monetizar=True), TarefaNoStudio(OUTRO, monetizar=True)]
    )

    assert ("marcar", CORTE) in pagina.passos
    assert ("clicar", "confirmar") in pagina.passos, "o resto do lote foi monetizado"
    assert len(falhas) == 1


def test_linha_que_nao_responde_diz_o_video_e_a_etapa():
    falhas = studio_youtube.executar_roteiro(
        LinhaQueNaoResponde(travada=OUTRO),
        [TarefaNoStudio(CORTE, monetizar=True), TarefaNoStudio(OUTRO, monetizar=True)],
    )

    assert OUTRO in falhas[0]
    assert "marcar a linha" in falhas[0]
    assert "Timeout 5000ms" in falhas[0]


class EtapaQueEstoura(PaginaFalsa):
    """Um clique da edição em massa que estoura só na aba Vídeos."""

    def __init__(self, *, etapa, **kwargs):
        super().__init__(**kwargs)
        self.etapa = etapa

    def clicar(self, alvo, *, segundos):
        if alvo == self.etapa and self.url.endswith("/upload"):
            raise RuntimeError("Locator.click: Timeout 30000ms exceeded.")
        super().clicar(alvo, segundos=segundos)


def test_uma_aba_que_falha_nao_impede_a_outra():
    pagina = EtapaQueEstoura(etapa="editar_em_massa")

    falhas = studio_youtube.executar_roteiro(
        pagina,
        [TarefaNoStudio(CORTE, monetizar=True), TarefaNoStudio(SHORT, monetizar=True, short=True)],
    )

    assert ("marcar", SHORT) in pagina.passos
    assert pagina.passos.count(("clicar", "confirmar")) == 1, "a aba Shorts foi até o fim"
    assert len(falhas) == 1


@pytest.mark.parametrize(
    ("etapa", "nome"),
    [
        ("editar_em_massa", "abrir o Editar"),
        ("item_monetizacao", "escolher Monetização"),
        ("atualizar_videos", "Update videos"),
        ("entendo", "I understand"),
        ("confirmar", "confirmar"),
    ],
)
def test_falha_numa_etapa_diz_a_aba_e_a_etapa(etapa, nome):
    falhas = studio_youtube.executar_roteiro(
        EtapaQueEstoura(etapa=etapa), [TarefaNoStudio(CORTE, monetizar=True)]
    )

    assert falhas[0].startswith("monetização na aba Vídeos")
    assert nome in falhas[0]
    assert "Timeout 30000ms" in falhas[0]


# --------------------------------------------------------------------------- #
# A caixa da linha, no Playwright
# --------------------------------------------------------------------------- #


class LocalizadorLento:
    """Um `Locator` do Playwright que só responde com prazo de pelo menos `pronto_ms`.

    Sem `timeout`, vale o padrão do Playwright (30 s), como na biblioteca.
    """

    def __init__(self, pronto_ms, estado):
        self.pronto_ms = pronto_ms
        self.estado = estado

    @property
    def first(self):
        return self

    def locator(self, _css):
        return self

    def _esperar(self, timeout):
        prazo = 30_000 if timeout is None else timeout
        if prazo < self.pronto_ms:
            raise RuntimeError(f"Locator: Timeout {prazo:.0f}ms exceeded.")

    def wait_for(self, *, state, timeout=None):
        self.estado["linha"] = True

    def get_attribute(self, nome, *, timeout=None):
        self._esperar(timeout)
        return "true" if self.estado.get("marcada") else "false"

    def click(self, *, timeout=None):
        self._esperar(timeout)
        self.estado["marcada"] = True


class PaginaDoPlaywrightLenta:
    def __init__(self, pronto_ms):
        self.estado: dict = {}
        self._localizador = LocalizadorLento(pronto_ms, self.estado)

    def locator(self, _css):
        return self._localizador


def test_caixa_da_linha_lenta_ainda_e_marcada():
    """O Studio mostra a linha e leva 8 s para montar a caixa: 5 s não bastavam."""
    playwright = PaginaDoPlaywrightLenta(pronto_ms=8_000)
    pagina = studio_youtube.PaginaDoPlaywrightNoStudio(playwright, studio_youtube.SELETORES)

    marcou = pagina.marcar_video("linha_do_video", CORTE, segundos=studio_youtube.PRAZO_POR_LINHA)

    assert marcou is True
    assert playwright.estado["marcada"] is True
