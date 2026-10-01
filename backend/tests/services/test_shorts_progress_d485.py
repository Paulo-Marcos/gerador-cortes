"""D-485: o render do short deixa de ser uma caixa muda.

O que motivou: uma previa levou 5min30 entre o clique e o arquivo, sem NADA na
tela. O dev nao tinha como distinguir "rodando" de "morto" — e escreveu
exatamente isso: "eu nem sei se esta em execucao, ou se nao esta".

O bruto ja resolvia isso com o BrutoProgress. O render do short reusou o worker,
a fila e o gate de RAM, e esqueceu o instrumento que torna tudo legivel.
"""

import pytest
from app.services.shorts_progress import PASSOS_RENDER, LugarDoShort, ShortsProgress


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


# ── D-844: o render do short na fila global ────────────────────────────────


def test_short_sem_corte_anotado_fica_fora_da_fila():
    """A fila descartaria o job sem projeto nem número de corte para mostrar."""
    ShortsProgress.iniciar("s1", estagio="previa")

    assert ShortsProgress.listar_para_a_fila() == []


def _situacao_na_fila(preparar) -> tuple[str, int, str]:
    ShortsProgress.iniciar("s1", estagio="final")
    ShortsProgress.vincular("s1", LugarDoShort("p1", "c1", "s1", 3))
    preparar()
    (item,) = ShortsProgress.listar_para_a_fila()
    assert (item["short_id"], item["corte_id"]) == ("s1", "c1")
    return item["estado"], item["progresso"], item["etapa"]


@pytest.mark.parametrize(
    ("preparar", "esperado"),
    [
        (
            lambda: ShortsProgress.na_fila("s1", "Aguardando RAM"),
            ("aguardando", 0, "Short 3 (final): Aguardando RAM"),
        ),
        (
            lambda: ShortsProgress.marcar("s1", "recorte", "rodando"),
            ("rodando", 0, "Short 3 (final): Recortar 9:16"),
        ),
        (
            lambda: (
                ShortsProgress.marcar("s1", "recorte", "concluido"),
                ShortsProgress.marcar("s1", "camada", "rodando"),
            ),
            ("rodando", 33, "Short 3 (final): Desenhar legenda e cenas"),
        ),
        (
            lambda: ShortsProgress.falhar("s1", "worker caiu"),
            ("erro", 0, "Short 3 (final): Falha no render"),
        ),
        (lambda: ShortsProgress.concluir("s1"), ("concluido", 100, "Short 3 (final): Pronto")),
        (lambda: ShortsProgress.cancelar("s1"), ("cancelado", 0, "Short 3 (final): Cancelado")),
    ],
    ids=["na-fila", "recorte", "camada", "erro", "pronto", "cancelado"],
)
def test_fila_global_le_o_estado_do_render(preparar, esperado):
    assert _situacao_na_fila(preparar) == esperado


def test_cancelar_encerra_sem_erro_e_sem_passo_rodando():
    """Cancelado não é falha, e o passo parado não pode girar para sempre."""
    ShortsProgress.iniciar("s1", estagio="previa")
    ShortsProgress.marcar("s1", "recorte", "concluido")
    ShortsProgress.marcar("s1", "camada", "rodando")

    ShortsProgress.cancelar("s1")

    estado = ShortsProgress.get("s1")
    assert ShortsProgress.em_curso("s1") is False
    assert estado["erro"] is None
    assert [p["status"] for p in estado["passos"]] == ["concluido", "pendente", "pendente"]


@pytest.mark.parametrize(
    "terminar",
    [
        lambda: ShortsProgress.concluir("s1"),
        lambda: ShortsProgress.falhar("s1", "worker caiu"),
        lambda: ShortsProgress.cancelar("s1"),
    ],
    ids=["pronto", "erro", "cancelado"],
)
def test_o_cronometro_para_quando_o_render_termina(monkeypatch, terminar):
    """D-844: o card cancelado (ou com erro) seguia contando "49s, 50s…".

    O tempo é a resposta a "há quanto tempo está rodando?" — depois do fim ele
    tem de virar "quanto durou".
    """
    from app.services import shorts_progress

    agora = [100.0]
    monkeypatch.setattr(shorts_progress.time, "monotonic", lambda: agora[0])
    ShortsProgress.iniciar("s1", estagio="final")
    agora[0] = 112.0
    terminar()
    agora[0] = 500.0

    assert ShortsProgress.get("s1")["decorrido_seg"] == 12.0
