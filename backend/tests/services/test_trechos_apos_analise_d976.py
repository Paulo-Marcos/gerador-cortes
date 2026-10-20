"""D-976: a análise da live termina com os trechos a remover dos cortes novos.

A análise (`cortador-expert`) propõe os cortes com 2 ou 3 desvios cada; o
operador tinha de clicar em "Gerar trechos" em toda live nova. Agora, ao fim da
análise, o backend roda a `trechos-expert` sozinho nos cortes que acabou de
criar, com o mesmo provedor, em segundo plano. Os cortes que já existiam não
são tocados.
"""

from __future__ import annotations

import json

import pytest
from app.services import depois_da_analise
from app.services.analise import AnaliseService
from app.services.claude_ia import ClaudeIaService
from app.services.corte import CorteService

from tests.services.test_analise_audit_trail import _mock_db_factory


def _corte_proposto(titulo: str, inicio_seg: int) -> dict:
    return {
        "titulo_proposto": titulo,
        "inicio_seg": inicio_seg,
        "fim_seg": inicio_seg + 600,
        "inicio_hms": "00:00:00",
        "fim_hms": "00:10:00",
        "desvios": [],
    }


@pytest.mark.asyncio
async def test_importar_resultado_devolve_os_ids_dos_cortes_criados(monkeypatch):
    factory, _projeto, cortes, _sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    criados = await AnaliseService.importar_resultado(
        "p1", [_corte_proposto("A", 0), _corte_proposto("B", 900)]
    )

    assert criados == [c.id for c in cortes]
    assert len(criados) == 2


@pytest.mark.asyncio
async def test_analise_dispara_os_trechos_dos_cortes_novos_com_o_mesmo_provedor(monkeypatch):
    factory, projeto, _cortes, _sess = _mock_db_factory()
    projeto.transcricao_raw = json.dumps([{"start": 0, "end": 4, "texto": "fala"}])
    projeto.duracao_segundos = 60
    projeto.falantes_map = None
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    async def fake_gerar_cortes(_transcricao, _meta, provider="claude"):
        return {"cortes": [_corte_proposto("A", 0)], "descartados": []}

    async def fake_importar(_projeto_id, _cortes_data, *, descartados=None, origem="claude"):
        return ["c-novo-1", "c-novo-2"]

    async def fake_refazer(_projeto_id):
        return None

    disparos: list = []
    monkeypatch.setattr(ClaudeIaService, "gerar_cortes", staticmethod(fake_gerar_cortes))
    monkeypatch.setattr(AnaliseService, "importar_resultado", staticmethod(fake_importar))
    monkeypatch.setattr(AnaliseService, "_refazer_transcricao", staticmethod(fake_refazer))
    monkeypatch.setattr(
        depois_da_analise,
        "disparar_trechos_dos_cortes_novos",
        lambda projeto_id, corte_ids, provider: disparos.append((projeto_id, corte_ids, provider)),
    )

    await AnaliseService.analisar_via_claude("p1", provider="gemini")

    assert disparos == [("p1", ["c-novo-1", "c-novo-2"], "gemini")]


@pytest.mark.asyncio
async def test_sem_refazer_transcricao_nao_ha_trechos(monkeypatch):
    """A trechos-expert lê a transcrição do corte, que nasce no refazer-transcrição:
    sem ele, não há o que mandar à IA."""
    factory, projeto, _cortes, _sess = _mock_db_factory()
    projeto.transcricao_raw = json.dumps([{"start": 0, "end": 4, "texto": "fala"}])
    projeto.duracao_segundos = 60
    projeto.falantes_map = None
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    async def fake_gerar_cortes(_transcricao, _meta, provider="claude"):
        return {"cortes": [_corte_proposto("A", 0)], "descartados": []}

    async def fake_importar(_projeto_id, _cortes_data, *, descartados=None, origem="claude"):
        return ["c-novo-1"]

    disparos: list = []
    monkeypatch.setattr(ClaudeIaService, "gerar_cortes", staticmethod(fake_gerar_cortes))
    monkeypatch.setattr(AnaliseService, "importar_resultado", staticmethod(fake_importar))
    monkeypatch.setattr(
        depois_da_analise,
        "disparar_trechos_dos_cortes_novos",
        lambda *args: disparos.append(args),
    )

    await AnaliseService.analisar_via_claude("p1", encadear_transcricao=False)

    assert disparos == []


@pytest.mark.asyncio
async def test_trechos_rodam_em_cada_corte_e_uma_falha_nao_para_os_outros(monkeypatch):
    chamados: list = []

    async def fake_gerar_trechos(corte_id, provider="claude"):
        chamados.append((corte_id, provider))
        if corte_id == "c2":
            raise RuntimeError("cota do Gemini acabou")
        return {"total_desvios": 5, "novos": 3}

    monkeypatch.setattr(CorteService, "gerar_trechos_via_claude", staticmethod(fake_gerar_trechos))

    await depois_da_analise.gerar_trechos_dos_cortes_novos(["c1", "c2", "c3"], "gemini")

    assert chamados == [("c1", "gemini"), ("c2", "gemini"), ("c3", "gemini")]


@pytest.mark.asyncio
async def test_disparo_sem_cortes_novos_nao_agenda_nada(monkeypatch):
    agendados: list = []
    monkeypatch.setattr(
        depois_da_analise, "fire_and_forget", lambda coro, name=None: agendados.append(name)
    )

    depois_da_analise.disparar_trechos_dos_cortes_novos("p1", [], "claude")

    assert agendados == []


@pytest.mark.asyncio
async def test_disparo_aparece_como_geracao_de_trechos_do_projeto(monkeypatch):
    """O nome da tarefa é o da geração em lote: o indicador de tarefas ativas
    (`core/tarefas_ativas.py`) mostra "Gerando trechos" na live."""
    agendados: list = []

    def fake_fire(coro, name=None):
        coro.close()
        agendados.append(name)

    monkeypatch.setattr(depois_da_analise, "fire_and_forget", fake_fire)

    depois_da_analise.disparar_trechos_dos_cortes_novos("abcdef123456", ["c1"], "claude")

    assert agendados == ["desvios-todos-abcdef12"]
