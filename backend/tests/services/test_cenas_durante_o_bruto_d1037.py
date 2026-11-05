"""O clique nas cenas e o bruto, quando chegam juntos (D-1037, delta da auditoria).

A recusa do clique existe porque o bruto pode reescrever a transcrição que ele
leria. Daí duas pontas: ela não pode ser furada por quem entra enquanto a rota
espera, e não pode continuar valendo quando o bruto já não mexe no texto.
"""

from __future__ import annotations

import asyncio

import pytest
from app.routers import claude_ia
from app.services import bruto_do_corte
from app.services.bruto_progress import BrutoProgress
from app.services.export import ExportService

from tests.services.test_cenas_em_geracao_d1037 import (  # noqa: F401
    _LIMITE_SEG,
    _no_limite,
    _pedir,
    cliente,
    presa,
)


@pytest.fixture(autouse=True)
def _sem_status_de_outro_teste():
    yield
    ExportService.set_tarefa_corte_status("c1", "pronto")
    BrutoProgress._store.pop("c1", None)


@pytest.fixture
def bruto_preso(monkeypatch):
    """O bruto começa e fica, sem FFmpeg: só o que interessa é ele estar em voo."""
    solta = asyncio.Event()
    chamadas: list[str] = []

    async def gerar(corte_id, **_opcoes):
        chamadas.append(corte_id)
        await solta.wait()
        return {"status": "pronto", "clip_path": "x"}

    async def nada(_corte_id):
        return None

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", staticmethod(gerar))
    monkeypatch.setattr(bruto_do_corte, "_avaliar_bruto_gerado", nada)
    yield chamadas
    solta.set()


# ─── A corrida: o bruto entra enquanto a rota espera ───────────────────────


@pytest.mark.asyncio
async def test_o_bruto_que_entra_enquanto_a_rota_espera_recusa_o_clique(
    cliente,  # noqa: F811
    presa,  # noqa: F811
    monkeypatch,
):
    """A rota solta a transação antes de gerar. Quem olha `cortando` antes dessa espera
    decide com um status velho e roda junto com o bruto (77 de 150 pares, na auditoria)."""

    async def bruto_entra_aqui(_db):
        ExportService.set_tarefa_corte_status("c1", "cortando")

    monkeypatch.setattr(claude_ia, "_soltar_a_transacao", bruto_entra_aqui)

    resposta = await _pedir(cliente)

    assert resposta.status_code == 400
    assert "bruto" in resposta.json()["detail"]
    assert presa.chamadas == 0


@pytest.mark.parametrize("bruto_primeiro", [True, False])
@pytest.mark.asyncio
async def test_no_par_simultaneo_so_um_dos_dois_passa(
    cliente,  # noqa: F811
    presa,  # noqa: F811
    bruto_preso,
    bruto_primeiro,
):
    pedidos = [
        cliente.post("/api/cortes/c1/gerar-bruto"),
        cliente.post("/api/claude/corte/c1/gerar-cenas"),
    ]
    tarefas = [asyncio.ensure_future(p) for p in (pedidos if bruto_primeiro else pedidos[::-1])]

    await asyncio.wait(tarefas, timeout=_LIMITE_SEG, return_when="FIRST_COMPLETED")
    await asyncio.wait(tarefas, timeout=0.2)
    presa.solta.set()
    bruto, cenas = await asyncio.wait_for(
        asyncio.gather(*(tarefas if bruto_primeiro else tarefas[::-1])), _LIMITE_SEG
    )

    aceitos = [r for r in (bruto, cenas) if r.status_code == 200]
    assert len(aceitos) == 1, f"bruto {bruto.status_code}, cenas {cenas.status_code}"
    assert len(bruto_preso) + presa.chamadas == 1


# ─── A outra ponta: a recusa só enquanto protege ───────────────────────────


@pytest.mark.parametrize("status_dos_shorts", ["rodando", "concluido", "erro"])
@pytest.mark.asyncio
async def test_nos_shorts_o_clique_passa(cliente, presa, status_dos_shorts):  # noqa: F811
    """Os shorts vêm depois de tudo que mexe no texto e não geram cenas: recusar ali
    deixava o botão livre e o clique voltando 400, sem proteger nada."""
    ExportService.set_tarefa_corte_status("c1", "cortando")
    BrutoProgress.iniciar("c1", incluir_shorts=True)
    BrutoProgress.marcar("c1", "shorts", status_dos_shorts)

    pedido = asyncio.create_task(_pedir(cliente))
    await asyncio.wait_for(presa.comecou.wait(), _LIMITE_SEG)
    presa.solta.set()

    assert (await pedido).status_code == 200


@pytest.mark.asyncio
async def test_antes_dos_shorts_o_clique_segue_recusado(cliente, presa):  # noqa: F811
    ExportService.set_tarefa_corte_status("c1", "cortando")
    BrutoProgress.iniciar("c1", incluir_shorts=True)
    BrutoProgress.marcar("c1", "render", "rodando")

    assert (await _pedir(cliente)).status_code == 400
    assert presa.chamadas == 0


@pytest.mark.asyncio
async def test_o_passo_de_shorts_do_bruto_anterior_nao_abre_a_janela(
    cliente,  # noqa: F811
    presa,  # noqa: F811
    bruto_preso,
):
    """O bruto anterior deixou `shorts` concluído no progresso. O novo, recém-começado,
    ainda vai passar pela salvaguarda: o clique tem de ser recusado."""
    BrutoProgress.iniciar("c1", incluir_shorts=True)
    BrutoProgress.marcar("c1", "shorts", "concluido")

    assert (await cliente.post("/api/cortes/c1/gerar-bruto")).status_code == 200
    resposta = await _no_limite(cliente.post("/api/claude/corte/c1/gerar-cenas"))

    assert resposta.status_code == 400
    assert presa.chamadas == 0
