"""D-485: o render do short deixa de ser uma caixa muda.

O que motivou: uma previa levou 5min30 entre o clique e o arquivo, sem NADA na
tela. O dev nao tinha como distinguir "rodando" de "morto" — e escreveu
exatamente isso: "eu nem sei se esta em execucao, ou se nao esta".

O bruto ja resolvia isso com o BrutoProgress. O render do short reusou o worker,
a fila e o gate de RAM, e esqueceu o instrumento que torna tudo legivel.
"""

import pytest
from app.services.shorts_progress import PASSOS_RENDER, ShortsProgress


@pytest.fixture(autouse=True)
def _store_limpo():
    ShortsProgress._store.clear()
    yield
    ShortsProgress._store.clear()


def test_sem_render_nao_inventa_estado():
    """`None` e diferente de "tudo pendente": a tela precisa saber a diferenca."""
    assert ShortsProgress.get("nunca-rodou") is None


def test_iniciar_deixa_os_tres_passos_pendentes():
    ShortsProgress.iniciar("s1", estagio="previa")

    estado = ShortsProgress.get("s1")

    assert estado["estagio"] == "previa"
    assert [p["chave"] for p in estado["passos"]] == [c for c, _ in PASSOS_RENDER]
    assert {p["status"] for p in estado["passos"]} == {"pendente"}


def test_o_tempo_decorrido_anda():
    """E a resposta para "ha quanto tempo?", que a lista de passos nao da."""
    import time

    ShortsProgress.iniciar("s1", estagio="final")
    time.sleep(0.05)

    assert ShortsProgress.get("s1")["decorrido_seg"] > 0


def test_marcar_move_so_o_passo_pedido():
    ShortsProgress.iniciar("s1", estagio="previa")
    ShortsProgress.marcar("s1", "camada", "rodando")

    passos = {p["chave"]: p["status"] for p in ShortsProgress.get("s1")["passos"]}

    assert passos == {"recorte": "pendente", "camada": "rodando", "composicao": "pendente"}


def test_marcar_sem_sessao_nao_quebra():
    """Reload do uvicorn limpa o store; o render em voo nao pode derrubar nada."""
    ShortsProgress.marcar("fantasma", "recorte", "rodando")  # nao levanta


def test_em_curso_distingue_rodando_de_terminado():
    ShortsProgress.iniciar("s1", estagio="previa")
    assert ShortsProgress.em_curso("s1") is True

    ShortsProgress.concluir("s1")
    assert ShortsProgress.em_curso("s1") is False


def test_em_curso_e_falso_para_short_que_nunca_rodou():
    assert ShortsProgress.em_curso("nunca") is False


def test_falha_fica_no_store_porque_nao_volta_mais_pelo_http():
    """O render virou assincrono: o POST ja respondeu quando o erro acontece.

    Sem isto a tela ficaria em "rodando" para sempre — pior que o silencio que
    esta demanda veio resolver.
    """
    ShortsProgress.iniciar("s1", estagio="previa")
    ShortsProgress.marcar("s1", "recorte", "concluido")
    ShortsProgress.marcar("s1", "camada", "rodando")

    ShortsProgress.falhar("s1", "Exit code: 4294967274")

    estado = ShortsProgress.get("s1")
    passos = {p["chave"]: p["status"] for p in estado["passos"]}

    assert estado["erro"] == "Exit code: 4294967274"
    assert estado["concluido"] is True, "falha tem de encerrar, senao a tela gira eterno"
    assert passos["camada"] == "erro", "o passo que estava rodando e o que falhou"
    assert passos["recorte"] == "concluido", "o que ja passou nao vira erro"


def test_o_estado_devolvido_nao_e_o_interno():
    """Mutar a leitura nao pode corromper o store."""
    ShortsProgress.iniciar("s1", estagio="previa")

    ShortsProgress.get("s1")["passos"][0]["status"] = "mexido"

    assert ShortsProgress.get("s1")["passos"][0]["status"] == "pendente"
