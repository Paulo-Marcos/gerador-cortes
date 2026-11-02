"""A falha do robô do Studio não manda olhar a aba que já fechou (D-1007).

Achado da auditoria do PR: com a aba fechando na falha, três mensagens ainda
mandavam conferir "na janela do robô".

Pedido → teste:
  - Salvar e monetização → `test_falha_nao_manda_olhar_a_aba_que_fechou`
  - canal que não abre → `test_canal_que_nao_abre_nao_manda_olhar_a_aba_que_fechou`
"""

import pytest
from app.domain.publicacao.studio_youtube import TarefaNoStudio
from app.services import studio_youtube

from tests.services.test_studio_youtube_d895 import PaginaFalsa

CORTE = "corteLongo1"
SHORT = "shortCurto1"


@pytest.mark.parametrize(
    ("pagina", "tarefa"),
    [
        (PaginaFalsa(salva=False), TarefaNoStudio(SHORT, relacionado=CORTE)),
        (PaginaFalsa(aviso="Updating videos."), TarefaNoStudio(CORTE, monetizar=True)),
    ],
    ids=["salvar", "monetizacao"],
)
def test_falha_nao_manda_olhar_a_aba_que_fechou(monkeypatch, pagina, tarefa):
    monkeypatch.setattr(studio_youtube, "PRAZO_PARA_SALVAR", 0.05)
    monkeypatch.setattr(studio_youtube, "PRAZO_DA_ATUALIZACAO", 0.05)
    monkeypatch.setattr(studio_youtube, "INTERVALO_DE_CONFERENCIA", 0.01)

    falhas = studio_youtube.executar_roteiro(pagina, [tarefa])

    assert "não confirmou" in falhas[0]
    assert "janela do robô" not in falhas[0]
    assert pagina.fechada


def test_canal_que_nao_abre_nao_manda_olhar_a_aba_que_fechou(monkeypatch):
    class SemCanal(PaginaFalsa):
        def aguardar(self, segundos):
            return None

    monkeypatch.setattr(studio_youtube, "PRAZO_PARA_ABRIR", 0.05)
    pagina = SemCanal()

    falhas = studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(CORTE, monetizar=True)])

    assert "não abriu o canal" in falhas[0]
    assert "janela do robô" not in falhas[0]
    assert pagina.fechada
