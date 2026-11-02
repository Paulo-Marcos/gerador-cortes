"""O robô do Studio não deixa aba para trás quando o lote falha (D-1007).

Medido na PROD em 01/11/2026: três lotes de shorts, três falhas "o Studio atualizou
0 de 3 na aba Shorts" e três abas paradas na edição do último short de cada lote.
O motivo estava num aviso da lista, e a aba que sobrava era a de outra tela.

Pedido → teste:
  - falha na monetização não deixa a aba → `test_falha_na_monetizacao_fecha_a_aba`
  - falha no relacionado não deixa a aba → `test_falha_no_relacionado_fecha_a_aba`
  - login pedido deixa a aba → `test_login_pedido_deixa_a_aba`
  - a janela só aparece para o login → `test_janela_so_aparece_quando_pede_login`
  - fim do lote com falha → `test_lote_que_falhou_nao_deixa_aba` e
    `test_lote_que_pediu_login_deixa_so_a_aba_do_login` (em `test_abas_do_robo_d1003.py`)
  - o texto do aviso chega ao log → `test_aviso_incompleto_vai_inteiro_para_o_log`
"""

import logging
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from app.domain.publicacao.studio_youtube import TarefaNoStudio
from app.services import navegador_assistido, studio_youtube

from tests.services.test_studio_youtube_d895 import PaginaFalsa

CORTE = "corteLongo1"
SHORT = "shortCurto1"
AVISO_INCOMPLETO = "0 of 3 videos successfully updated"
URL_DO_LOGIN = "https://accounts.google.com/x"


def test_falha_na_monetizacao_fecha_a_aba():
    pagina = PaginaFalsa(aviso=AVISO_INCOMPLETO)

    falhas = studio_youtube.executar_roteiro(
        pagina,
        [TarefaNoStudio(SHORT, monetizar=True, relacionado=CORTE, short=True)],
    )

    assert falhas == ["o Studio atualizou 0 de 3 na aba Shorts"]
    assert pagina.fechada, "o motivo está no log; a edição do short não o mostra"


def test_falha_no_relacionado_fecha_a_aba():
    pagina = PaginaFalsa(sem=("video_relacionado",))

    falhas = studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(SHORT, relacionado=CORTE)])

    assert len(falhas) == 1
    assert pagina.fechada


def test_login_pedido_deixa_a_aba():
    pagina = PaginaFalsa(login=True)

    falhas = studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(CORTE, monetizar=True)])

    assert "login" in falhas[0]
    assert not pagina.fechada, "é nessa aba que o operador entra na conta"


@pytest.mark.parametrize(
    ("url_final", "mostradas_esperadas"),
    [("https://studio.youtube.com/video/x/edit", 0), (URL_DO_LOGIN, 1)],
)
def test_janela_so_aparece_quando_pede_login(monkeypatch, tmp_path, url_final, mostradas_esperadas):
    aba = SimpleNamespace(url=url_final)
    contexto = SimpleNamespace(new_page=lambda: aba)

    @contextmanager
    def sessao(*_a, **_k):
        yield SimpleNamespace(contexts=[contexto]), False

    mostradas: list = []
    monkeypatch.setattr(navegador_assistido, "sessao_no_chrome", sessao)
    monkeypatch.setattr(
        studio_youtube.navegador_do_robo, "perfil_da_plataforma", lambda _p: tmp_path
    )
    monkeypatch.setattr(studio_youtube.navegador_do_robo, "executavel_escolhido", lambda: None)
    monkeypatch.setattr(studio_youtube.janela_do_robo, "mostrar", mostradas.append)
    monkeypatch.setattr(studio_youtube, "executar_roteiro", lambda _p, _t: ["falhou"])

    falhas = studio_youtube._no_navegador([TarefaNoStudio(CORTE, monetizar=True)])

    assert falhas == ["falhou"]
    assert len(mostradas) == mostradas_esperadas


def test_aviso_incompleto_vai_inteiro_para_o_log(caplog):
    """A contagem sozinha não diz por que o Studio recusou; o texto do aviso pode dizer."""
    pagina = PaginaFalsa(aviso=AVISO_INCOMPLETO)

    with caplog.at_level(logging.WARNING, logger=studio_youtube.__name__):
        studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(CORTE, monetizar=True)])

    assert AVISO_INCOMPLETO in caplog.text
