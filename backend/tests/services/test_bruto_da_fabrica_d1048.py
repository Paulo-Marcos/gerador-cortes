"""O bruto que corria sem avisar: o da fábrica de shorts (D-1048).

Ele não grava `cortando`, então o clique em "Gerar cenas" passava com a salvaguarda
reescrevendo a transcrição: índice 7 em 14,0 s, com a fala em 8,0 s, sem aviso. E o fim
dele marcava `shorts=concluido` no progresso de um bruto novo, que abria a recusa desse
outro. Aqui rodam as funções reais: só a IA e o FFmpeg são dublês.
"""

from __future__ import annotations

import asyncio

import pytest
from app.domain.compartilhado.erros import PedidoInvalido
from app.models import Corte
from app.services import bruto_do_corte, fabrica_de_shorts
from app.services import corte as corte_module
from app.services import export as export_module
from app.services import shorts as shorts_module
from app.services.bruto_progress import BrutoProgress
from app.services.cenas_em_geracao import (
    esta_gerando,
    recusa_ao_bruto,
    reservar,
    reservar_ou_recusar,
)
from app.services.export import ExportService
from sqlalchemy import update

from tests.services.test_cenas_em_geracao_d1037 import (  # noqa: F401
    _LIMITE_SEG,
    _comecar,
    _em_geracao,
    _pedir,
    cliente,
    esteira,
    presa,
)

_SLEEP_REAL = asyncio.sleep


@pytest.fixture(autouse=True)
def _limpa(monkeypatch):
    async def nada(_corte_id):
        return None

    monkeypatch.setattr(bruto_do_corte, "_avaliar_bruto_gerado", nada)
    yield
    ExportService.set_tarefa_corte_status("c1", "pronto")
    BrutoProgress._store.pop("c1", None)


@pytest.fixture
def sem_bruto(esteira, monkeypatch):  # noqa: F811
    """O corte que leva a fábrica a regerar o bruto: o caminho desta demanda."""
    esteira.shorts.return_value = {"shorts": [], "descartes": []}

    async def elegivel(_corte_id):
        return {"elegivel": True, "tem_bruto": False}

    async def nada(_corte_id):
        return None

    monkeypatch.setattr(shorts_module, "elegibilidade", elegivel)
    monkeypatch.setattr(shorts_module, "exigir_video_da_live", nada)


def _status():
    return ExportService.get_tarefa_corte_status("c1")


def _passos():
    return {p["chave"]: p["status"] for p in BrutoProgress.get("c1")}


async def _ate(condicao, o_que="condição"):
    for _ in range(2000):
        if condicao():
            return
        await _SLEEP_REAL(0.002)
    raise AssertionError(f"timeout: {o_que}; status={_status()} passos={_passos()}")


async def _fire_no_banco():
    async with bruto_do_corte.AsyncSessionLocal() as db:
        await db.execute(update(Corte).where(Corte.id == "c1").values(is_fire=True))
        await db.commit()


def _preso_na_salvaguarda() -> tuple[asyncio.Event, asyncio.Event]:
    entrou, solta = asyncio.Event(), asyncio.Event()

    async def salvaguarda(*_a, **_k):
        entrou.set()
        await solta.wait()
        return {"status": "sucesso"}

    corte_module.CorteService.detectar_silencios_tecnico.side_effect = salvaguarda
    return entrou, solta


def _preso_nos_shorts(esteira, monkeypatch) -> tuple[asyncio.Event, asyncio.Event]:  # noqa: F811
    monkeypatch.setattr(export_module.settings, "claude_auto_shorts_no_bruto", True)
    monkeypatch.setattr(export_module.settings, "claude_auto_cenas_no_bruto", False)
    esteira.corte.is_fire = True
    entrou, solta = asyncio.Event(), asyncio.Event()

    async def preso(*_a, **_k):
        entrou.set()
        await solta.wait()
        return {"shorts": [], "descartes": []}

    esteira.shorts.side_effect = preso
    return entrou, solta


def _fabrica_em_voo() -> asyncio.Task:
    return asyncio.create_task(fabrica_de_shorts.gerar_shorts_do_corte("c1"))


# ─── 1. O fim de um bruto não fala pelo bruto seguinte ──────────────────────


@pytest.mark.asyncio
async def test_o_fim_do_bruto_da_fabrica_nao_abre_o_clique_do_bruto_da_tela(
    cliente,  # noqa: F811
    presa,  # noqa: F811
    esteira,  # noqa: F811
    sem_bruto,
    monkeypatch,
):
    """A marca tardia de `shorts` fazia a recusa ceder com a salvaguarda presa (400, depois 200)."""
    await _fire_no_banco()
    nos_shorts, solta_os_shorts = _preso_nos_shorts(esteira, monkeypatch)
    fabrica = _fabrica_em_voo()
    await asyncio.wait_for(nos_shorts.wait(), _LIMITE_SEG)

    na_salvaguarda, solta_a_salvaguarda = _preso_na_salvaguarda()
    resposta = await cliente.post("/api/cortes/c1/gerar-bruto", params={"refazer_cenas": False})
    assert resposta.status_code == 200, resposta.text
    await asyncio.wait_for(na_salvaguarda.wait(), _LIMITE_SEG)
    assert (await _pedir(cliente)).status_code == 400

    solta_os_shorts.set()
    await asyncio.wait_for(fabrica, _LIMITE_SEG)

    assert _passos()["shorts"] == "pendente"
    resposta = await _pedir(cliente)
    assert resposta.status_code == 400, resposta.text
    assert presa.chamadas == 0

    solta_a_salvaguarda.set()
    await _ate(lambda: _status() != "cortando", "fim do bruto da tela")


@pytest.mark.asyncio
async def test_cada_bruto_marca_so_o_proprio_progresso():
    iniciou, zerou = asyncio.Event(), asyncio.Event()

    async def bruto_antigo():
        BrutoProgress.iniciar("c1", incluir_shorts=True)
        iniciou.set()
        await zerou.wait()
        BrutoProgress.marcar("c1", "render", "concluido")
        BrutoProgress.marcar("c1", "shorts", "concluido")
        return BrutoProgress.deste_bruto("c1")

    antigo = asyncio.create_task(bruto_antigo())
    await iniciou.wait()
    BrutoProgress.iniciar("c1", incluir_shorts=True)
    zerou.set()
    do_antigo = await antigo

    assert _passos()["shorts"] == "pendente"
    assert _passos()["render"] == "pendente"
    assert BrutoProgress.chegou_aos_shorts("c1") is False
    assert {p["chave"]: p["status"] for p in do_antigo}["shorts"] == "concluido"


@pytest.mark.asyncio
async def test_a_fabrica_nao_paga_os_shorts_de_novo_se_a_tela_zerou_o_progresso(
    cliente,  # noqa: F811
    presa,  # noqa: F811
    esteira,  # noqa: F811
    sem_bruto,
    monkeypatch,
):
    """O passo de shorts que ela lê é o do bruto dela, não o do bruto que veio depois."""
    await _fire_no_banco()
    nos_shorts, solta_os_shorts = _preso_nos_shorts(esteira, monkeypatch)
    fabrica = _fabrica_em_voo()
    await asyncio.wait_for(nos_shorts.wait(), _LIMITE_SEG)

    na_salvaguarda, solta_a_salvaguarda = _preso_na_salvaguarda()
    assert (await cliente.post("/api/cortes/c1/gerar-bruto")).status_code == 200
    await asyncio.wait_for(na_salvaguarda.wait(), _LIMITE_SEG)

    solta_os_shorts.set()
    resultado = await asyncio.wait_for(fabrica, _LIMITE_SEG)

    assert esteira.shorts.await_count == 1
    assert resultado["bruto_regerado"] is True
    solta_a_salvaguarda.set()
    await _ate(lambda: _status() != "cortando", "fim do bruto da tela")


# ─── 2. A ordem do reinício: quem é recusado não zera nada ──────────────────


@pytest.mark.asyncio
async def test_ja_em_andamento_nao_zera_o_progresso_do_bruto_em_voo(
    cliente,  # noqa: F811
    presa,  # noqa: F811
    esteira,  # noqa: F811
    monkeypatch,
):
    """Zerar aqui fecharia de novo a janela dos shorts, para um pedido que nem começou."""
    await _fire_no_banco()
    nos_shorts, solta_os_shorts = _preso_nos_shorts(esteira, monkeypatch)
    presa.solta.set()
    assert (await cliente.post("/api/cortes/c1/gerar-bruto")).status_code == 200
    await asyncio.wait_for(nos_shorts.wait(), _LIMITE_SEG)
    antes = _passos()
    assert antes["shorts"] == "rodando"

    resposta = await cliente.post("/api/cortes/c1/gerar-bruto")

    assert "em andamento" in resposta.json()["message"]
    assert _passos() == antes
    assert (await _pedir(cliente)).status_code == 200, "o segundo POST não fecha a janela"
    solta_os_shorts.set()
    await _ate(lambda: _status() == "pronto", "fim do bruto")


@pytest.mark.asyncio
async def test_o_bruto_recusado_pelas_cenas_em_voo_nao_zera_o_progresso(cliente, presa):  # noqa: F811
    BrutoProgress.iniciar("c1", incluir_shorts=True)
    for chave in ("silencios", "render", "shorts"):
        BrutoProgress.marcar("c1", chave, "concluido")
    antes = _passos()
    clique = await _comecar(cliente, presa)

    resposta = await cliente.post("/api/cortes/c1/gerar-bruto")

    assert resposta.status_code == 400
    assert _passos() == antes
    assert _status() != "cortando"
    presa.solta.set()
    await clique


# ─── 3. O bruto da fábrica segura a marca ───────────────────────────────────


@pytest.mark.asyncio
async def test_o_clique_e_recusado_durante_o_bruto_da_fabrica(
    cliente,  # noqa: F811
    presa,  # noqa: F811
    esteira,  # noqa: F811
    sem_bruto,
):
    na_salvaguarda, solta = _preso_na_salvaguarda()
    fabrica = _fabrica_em_voo()
    await asyncio.wait_for(na_salvaguarda.wait(), _LIMITE_SEG)

    resposta = await _pedir(cliente)

    assert resposta.status_code == 400
    assert "bruto" in resposta.json()["detail"]
    assert presa.chamadas == 0

    solta.set()
    await asyncio.wait_for(fabrica, _LIMITE_SEG)
    presa.solta.set()
    assert (await _pedir(cliente)).status_code == 200, "acabou o bruto: o clique volta a passar"


@pytest.mark.asyncio
async def test_a_tela_nao_ve_cenas_em_geracao_durante_o_bruto_da_fabrica(
    cliente,  # noqa: F811
    esteira,  # noqa: F811
    sem_bruto,
):
    """A fábrica não gera cenas: a tela não pode dizer "gerando cenas" nem travar o botão."""
    na_salvaguarda, solta = _preso_na_salvaguarda()
    fabrica = _fabrica_em_voo()
    await asyncio.wait_for(na_salvaguarda.wait(), _LIMITE_SEG)

    assert await _em_geracao(cliente) is False
    status = await cliente.get("/api/export/projeto/p1/status")
    assert {c["corte_id"]: c["cenas_em_geracao"] for c in status.json()["cortes"]}["c1"] is False

    solta.set()
    await asyncio.wait_for(fabrica, _LIMITE_SEG)


@pytest.mark.asyncio
async def test_o_bruto_da_fabrica_nao_gera_cenas(esteira, presa, sem_bruto):  # noqa: F811
    """O `esteira` liga as cenas automáticas: a marca que ele segura não vira geração."""
    await asyncio.wait_for(fabrica_de_shorts.gerar_shorts_do_corte("c1"), _LIMITE_SEG)

    assert presa.chamadas == 0
    assert esta_gerando("c1") is False
    assert recusa_ao_bruto("c1") is None


@pytest.mark.asyncio
async def test_a_tela_espera_o_bruto_da_fabrica(cliente, esteira, sem_bruto):  # noqa: F811
    """A mensagem é a do bruto: nenhuma cena está sendo gerada ali."""
    na_salvaguarda, solta = _preso_na_salvaguarda()
    fabrica = _fabrica_em_voo()
    await asyncio.wait_for(na_salvaguarda.wait(), _LIMITE_SEG)
    antes = _passos()

    resposta = await cliente.post("/api/cortes/c1/gerar-bruto")

    assert resposta.status_code == 400
    assert "bruto" in resposta.json()["detail"]
    assert "cenas" not in resposta.json()["detail"]
    assert _status() != "cortando"
    assert _passos() == antes
    solta.set()
    await asyncio.wait_for(fabrica, _LIMITE_SEG)


@pytest.mark.asyncio
async def test_a_fabrica_nao_comeca_com_as_cenas_em_voo(cliente, presa, esteira, sem_bruto):  # noqa: F811
    clique = await _comecar(cliente, presa)

    with pytest.raises(ValueError, match="cenas"):
        await asyncio.wait_for(fabrica_de_shorts.gerar_shorts_do_corte("c1"), _LIMITE_SEG)

    assert corte_module.CorteService.detectar_silencios_tecnico.await_count == 0
    assert esta_gerando("c1") is True, "a fábrica recusada não solta a marca do clique"
    presa.solta.set()
    await clique


@pytest.mark.asyncio
async def test_a_fabrica_nao_corre_junto_com_o_bruto_da_tela(
    cliente,  # noqa: F811
    presa,  # noqa: F811
    esteira,  # noqa: F811
    sem_bruto,
    monkeypatch,
):
    """Sem cenas na cadeia, para valer a marca do bruto, e não a que a cadeia já segurava."""
    monkeypatch.setattr(export_module.settings, "claude_auto_cenas_no_bruto", False)
    na_salvaguarda, solta = _preso_na_salvaguarda()
    assert (await cliente.post("/api/cortes/c1/gerar-bruto")).status_code == 200
    await asyncio.wait_for(na_salvaguarda.wait(), _LIMITE_SEG)

    with pytest.raises(ValueError, match="já está sendo gerado"):
        await asyncio.wait_for(fabrica_de_shorts.gerar_shorts_do_corte("c1"), _LIMITE_SEG)

    assert _status() == "cortando"
    presa.solta.set()
    solta.set()
    await _ate(lambda: _status() != "cortando", "fim do bruto da tela")


@pytest.mark.asyncio
async def test_a_segunda_fabrica_do_mesmo_corte_nao_corre_junto(esteira, sem_bruto):  # noqa: F811
    na_salvaguarda, solta = _preso_na_salvaguarda()
    primeira = _fabrica_em_voo()
    await asyncio.wait_for(na_salvaguarda.wait(), _LIMITE_SEG)

    with pytest.raises(ValueError, match="já está sendo gerado"):
        await asyncio.wait_for(fabrica_de_shorts.gerar_shorts_do_corte("c1"), _LIMITE_SEG)

    assert corte_module.CorteService.detectar_silencios_tecnico.await_count == 1
    solta.set()
    await asyncio.wait_for(primeira, _LIMITE_SEG)


@pytest.mark.asyncio
async def test_nos_shorts_da_fabrica_o_clique_passa(
    cliente,  # noqa: F811
    presa,  # noqa: F811
    esteira,  # noqa: F811
    sem_bruto,
    monkeypatch,
):
    """Os shorts levam minutos e não mexem no texto: recusar ali não protegeria nada."""
    nos_shorts, solta = _preso_nos_shorts(esteira, monkeypatch)
    fabrica = _fabrica_em_voo()
    await asyncio.wait_for(nos_shorts.wait(), _LIMITE_SEG)
    presa.solta.set()

    assert (await _pedir(cliente)).status_code == 200

    solta.set()
    await asyncio.wait_for(fabrica, _LIMITE_SEG)


@pytest.mark.asyncio
async def test_o_bruto_da_fabrica_que_falha_nao_deixa_o_corte_preso(esteira, sem_bruto):  # noqa: F811
    esteira.tamanho_do_clip = 0

    with pytest.raises(ValueError, match="regerar o bruto"):
        await fabrica_de_shorts.gerar_shorts_do_corte("c1")

    assert recusa_ao_bruto("c1") is None


@pytest.mark.asyncio
async def test_o_bruto_da_fabrica_cancelado_nao_deixa_o_corte_preso(esteira, sem_bruto):  # noqa: F811
    na_salvaguarda, _solta = _preso_na_salvaguarda()
    fabrica = _fabrica_em_voo()
    await asyncio.wait_for(na_salvaguarda.wait(), _LIMITE_SEG)

    fabrica.cancel()
    with pytest.raises(asyncio.CancelledError):
        await fabrica

    assert recusa_ao_bruto("c1") is None


# ─── A marca: uma só, com o que ela está protegendo ─────────────────────────


def test_a_marca_de_um_bruto_recusa_mas_nao_diz_que_gera_cenas():
    reserva = reservar("c-bruto", gera_cenas=False)
    assert reserva is not None
    try:
        assert esta_gerando("c-bruto") is False
        assert reservar("c-bruto") is None
        assert "bruto" in (recusa_ao_bruto("c-bruto") or "")
        with pytest.raises(PedidoInvalido, match="bruto"):
            reservar_ou_recusar("c-bruto")
    finally:
        reserva.liberar()

    assert recusa_ao_bruto("c-bruto") is None


def test_a_marca_das_cenas_recusa_o_bruto_falando_das_cenas():
    reserva = reservar("c-cenas")
    assert reserva is not None
    try:
        assert esta_gerando("c-cenas") is True
        assert "cenas" in (recusa_ao_bruto("c-cenas") or "")
        with pytest.raises(PedidoInvalido, match="cenas deste corte já"):
            reservar_ou_recusar("c-cenas")
    finally:
        reserva.liberar()
