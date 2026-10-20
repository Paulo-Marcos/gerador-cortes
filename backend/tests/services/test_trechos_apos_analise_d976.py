"""D-976: a análise da live termina com os trechos a remover dos cortes novos.

A análise (`cortador-expert`) propõe os cortes com 2 ou 3 desvios cada; o
operador tinha de clicar em "Gerar trechos" em toda live nova. Agora, ao fim da
análise, o backend roda a `trechos-expert` sozinho nos cortes que acabou de
criar, com o mesmo provedor, em segundo plano. Os cortes que já existiam não
são tocados.
"""

from __future__ import annotations

import asyncio
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


def _preparar_analise(monkeypatch, *, refez: bool = True, existentes: list | None = None):
    """Análise com IA, importação e refazer falsos; devolve o diário dos passos."""
    factory, projeto, _cortes, sess = _mock_db_factory()
    projeto.transcricao_raw = json.dumps([{"start": 0, "end": 4, "texto": "fala"}])
    projeto.duracao_segundos = 60
    projeto.falantes_map = None
    linhas = [(inicio,) for inicio in (existentes or [])]
    sess.execute.return_value.all = lambda: linhas
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)
    diario: list = []

    async def fake_gerar_cortes(_transcricao, _meta, provider="claude"):
        return {"cortes": [_corte_proposto("A", 0), _corte_proposto("B", 900)]}

    async def fake_importar(_projeto_id, cortes_data, *, descartados=None, origem="claude"):
        diario.append("importar")
        return [f"id-{c['titulo_proposto']}" for c in cortes_data]

    async def fake_refazer(_projeto_id):
        diario.append("refazer")
        return refez

    monkeypatch.setattr(ClaudeIaService, "gerar_cortes", staticmethod(fake_gerar_cortes))
    monkeypatch.setattr(AnaliseService, "importar_resultado", staticmethod(fake_importar))
    monkeypatch.setattr(AnaliseService, "_refazer_transcricao", staticmethod(fake_refazer))
    monkeypatch.setattr(
        depois_da_analise,
        "disparar_trechos_dos_cortes_novos",
        lambda projeto_id, corte_ids, provider: diario.append(("trechos", corte_ids, provider)),
    )
    return diario


@pytest.mark.asyncio
async def test_analise_dispara_os_trechos_dos_cortes_novos_com_o_mesmo_provedor(monkeypatch):
    diario = _preparar_analise(monkeypatch)

    await AnaliseService.analisar_via_claude("p1", provider="gemini")

    # Depois do refazer-transcrição: é ele que dá ao corte o texto que a skill lê.
    assert diario == ["importar", "refazer", ("trechos", ["id-A", "id-B"], "gemini")]


@pytest.mark.asyncio
async def test_corte_pulado_por_ja_existir_nao_ganha_trechos(monkeypatch):
    """O corte B cai no bucket de 30s de um corte que já existia: não é criado,
    e o corte antigo não é tocado."""
    diario = _preparar_analise(monkeypatch, existentes=[905])

    await AnaliseService.analisar_via_claude("p1")

    assert diario[-1] == ("trechos", ["id-A"], "claude")


@pytest.mark.asyncio
async def test_sem_refazer_transcricao_nao_ha_trechos(monkeypatch):
    """A trechos-expert lê a transcrição do corte, que nasce no refazer-transcrição:
    sem ele, não há o que mandar à IA."""
    diario = _preparar_analise(monkeypatch)

    await AnaliseService.analisar_via_claude("p1", encadear_transcricao=False)

    assert diario == ["importar"]


@pytest.mark.asyncio
async def test_refazer_pulado_por_falta_de_video_nao_dispara_trechos(monkeypatch):
    diario = _preparar_analise(monkeypatch, refez=False)

    await AnaliseService.analisar_via_claude("p1")

    assert diario == ["importar", "refazer"]


@pytest.mark.asyncio
async def test_trechos_rodam_em_cada_corte_e_uma_falha_nao_para_os_outros(monkeypatch):
    chamados: list = []

    async def fake_gerar_trechos(corte_id, provider="claude"):
        chamados.append((corte_id, provider))
        if corte_id == "c2":
            raise RuntimeError("cota do Gemini acabou")
        return {"total_desvios": 5, "novos": 3}

    monkeypatch.setattr(CorteService, "gerar_trechos_via_claude", staticmethod(fake_gerar_trechos))
    monkeypatch.setattr(depois_da_analise, "FOLGA_ENTRE_CORTES_SEG", 0)
    monkeypatch.setattr(
        depois_da_analise,
        "_pendentes",
        {"p1": [("c1", "gemini"), ("c2", "gemini"), ("c3", "gemini")]},
    )

    await depois_da_analise.gerar_trechos_dos_cortes_novos("p1")

    assert chamados == [("c1", "gemini"), ("c2", "gemini"), ("c3", "gemini")]
    assert depois_da_analise._pendentes == {}


@pytest.mark.asyncio
async def test_disparo_sem_cortes_novos_nao_agenda_nada(monkeypatch):
    agendados: list = []
    monkeypatch.setattr(depois_da_analise, "_pendentes", {})
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
        from unittest.mock import MagicMock

        coro.close()
        agendados.append(name)
        return MagicMock()

    monkeypatch.setattr(depois_da_analise, "_pendentes", {})
    monkeypatch.setattr(depois_da_analise, "fire_and_forget", fake_fire)

    depois_da_analise.disparar_trechos_dos_cortes_novos("abcdef123456", ["c1"], "claude")

    assert agendados == ["trechos-da-analise-abcdef12"]
    # O mapa das tarefas ativas reconhece o nome: sem ele, nada de indicador nem
    # de botão de cancelar na Fila.
    from app.core.tarefas_ativas import classificar_background

    assert classificar_background(agendados[0]) == (
        "trechos",
        "projeto",
        "Gerando trechos dos cortes novos",
        "abcdef12",
    )


@pytest.mark.asyncio
async def test_segunda_analise_soma_a_fila_da_primeira(monkeypatch):
    """Com as duas IAs (D-977), a análise termina duas vezes: os cortes do Gemini
    entram na fila que JÁ RODA, sem uma segunda tarefa em paralelo."""
    chamados: list = []
    primeira_na_ia = asyncio.Event()
    liberar = asyncio.Event()

    async def fake_gerar_trechos(corte_id, provider="claude"):
        chamados.append((corte_id, provider))
        primeira_na_ia.set()
        await liberar.wait()

    tarefas: list = []
    monkeypatch.setattr(CorteService, "gerar_trechos_via_claude", staticmethod(fake_gerar_trechos))
    monkeypatch.setattr(depois_da_analise, "FOLGA_ENTRE_CORTES_SEG", 0)
    monkeypatch.setattr(depois_da_analise, "_pendentes", {})
    monkeypatch.setattr(
        depois_da_analise,
        "fire_and_forget",
        lambda coro, name=None: tarefas.append(asyncio.ensure_future(coro)) or tarefas[-1],
    )

    depois_da_analise.disparar_trechos_dos_cortes_novos("p1", ["c-claude"], "claude")
    await asyncio.wait_for(primeira_na_ia.wait(), timeout=5)
    depois_da_analise.disparar_trechos_dos_cortes_novos("p1", ["c-gemini"], "gemini")
    liberar.set()
    await asyncio.wait_for(asyncio.gather(*tarefas), timeout=5)

    assert len(tarefas) == 1
    assert chamados == [("c-claude", "claude"), ("c-gemini", "gemini")]
    assert depois_da_analise._pendentes == {}


@pytest.mark.asyncio
async def test_tarefa_cancelada_antes_de_comecar_nao_prende_a_fila(monkeypatch):
    tarefas: list = []
    monkeypatch.setattr(depois_da_analise, "_pendentes", {})
    monkeypatch.setattr(
        depois_da_analise,
        "fire_and_forget",
        lambda coro, name=None: tarefas.append(asyncio.ensure_future(coro)) or tarefas[-1],
    )

    depois_da_analise.disparar_trechos_dos_cortes_novos("p1", ["c1"], "claude")
    tarefas[0].cancel()
    await asyncio.gather(*tarefas, return_exceptions=True)
    await asyncio.sleep(0)

    assert depois_da_analise._pendentes == {}


@pytest.mark.asyncio
async def test_fim_da_tarefa_antiga_nao_apaga_a_fila_de_uma_analise_nova(monkeypatch):
    """O fim de uma tarefa esquece só a fila DELA: se outra análise já abriu uma
    fila nova para a live, essa continua."""
    fila_velha = [("c-velho", "claude")]
    fila_nova = [("c-novo", "gemini")]
    monkeypatch.setattr(depois_da_analise, "_pendentes", {"p1": fila_nova})

    depois_da_analise._esquecer_fila("p1", fila_velha)

    assert depois_da_analise._pendentes == {"p1": fila_nova}


# ── Auditoria do PR #245: o lote roda sozinho enquanto o operador revisa ──────


def _desvio(inicio_seg: int, fim_seg: int, motivo: str) -> dict:
    return {"inicio_seg": inicio_seg, "fim_seg": fim_seg, "motivo": motivo}


def _sessao_do_corte(desvios: list):
    from unittest.mock import AsyncMock, MagicMock

    from app.models import Projeto

    corte = MagicMock()
    corte.transcricao_corte = json.dumps([{"start": 0, "end": 4, "texto": "fala"}])
    corte.desvios = json.dumps(desvios)
    corte.titulo_proposto = corte.tema_central = corte.inicio_hms = corte.fim_hms = ""
    corte.inicio_seg, corte.fim_seg = 0.0, 1800.0
    corte.projeto_id = "p1"
    corte.trechos_geracoes = 0
    corte.trechos_geracoes_log = "[]"
    projeto = MagicMock()
    projeto.falantes_map = "{}"
    projeto.transcricao_raw = None

    async def fake_get(model, _id):
        return projeto if model is Projeto else corte

    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.get = fake_get
    return (lambda: session), corte


@pytest.mark.asyncio
async def test_trecho_marcado_enquanto_a_ia_pensa_nao_some(monkeypatch):
    """A IA leva minutos; o que o operador marcou nesse meio-tempo continua lá:
    os novos somam ao que está gravado na hora de gravar, não ao lido antes."""
    from unittest.mock import AsyncMock

    factory, corte = _sessao_do_corte([_desvio(60, 70, "da análise")])
    monkeypatch.setattr("app.services.corte.AsyncSessionLocal", factory)

    async def fake_gerar_desvios(_t, _m, _existentes, _mapa=None, provider="claude"):
        # Enquanto a IA pensa, o operador marca um trecho à mão.
        corte.desvios = json.dumps(
            [_desvio(60, 70, "da análise"), _desvio(300, 320, "marcado à mão")]
        )
        return {"desvios": [_desvio(900, 930, "da trechos-expert")]}

    monkeypatch.setattr(ClaudeIaService, "gerar_desvios", staticmethod(fake_gerar_desvios))
    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(AsyncMock()))

    resultado = await CorteService.gerar_trechos_via_claude("c1")

    motivos = [d["motivo"] for d in json.loads(corte.desvios)]
    assert "marcado à mão" in motivos
    assert "da análise" in motivos
    assert any("da trechos-expert" in m for m in motivos)
    assert resultado == {"total_desvios": 3, "novos": 1}
