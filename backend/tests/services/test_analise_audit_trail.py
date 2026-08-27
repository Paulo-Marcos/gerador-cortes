"""I-034: audit trail da análise IA.

Cobre:
  - `AnaliseService.importar_resultado` persiste `justificativa` por corte.
  - `AnaliseService.importar_resultado` persiste `descartados` em
    `projeto.descartados_analise` (lista vazia também é persistida; None
    é ignorado para retrocompatibilidade).
  - `analisar_transcricao` (via Claude) propaga `descartados` da geração.

Estes testes mockam `AsyncSessionLocal` — não tocam banco real, mas capturam
o que entra em `db.add(Corte(...))` e o que é atribuído a `projeto.*`.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.models import Corte
from app.services.analise import AnaliseService


def _mock_db_factory(max_numero: int = 0):
    """Devolve (factory, projeto_mock, cortes_capturados, session_mock).

    A factory imita `AsyncSessionLocal` (context manager assíncrono).
    `projeto_mock` é o objeto retornado por `db.get(Projeto, ...)`.
    `cortes_capturados` recebe cada `Corte` passado a `db.add`; os
    `CorteSnapshot` (D-303) vão para `session.snapshots_capturados`.
    `max_numero` é o valor de `MAX(Corte.numero)` (0 = projeto sem cortes).
    """
    cortes_capturados: list = []
    snapshots_capturados: list = []
    projeto_mock = MagicMock()
    projeto_mock.status = None
    projeto_mock.ultima_analise_em = None
    projeto_mock.descartados_analise = "[]"

    def _capturar(obj):
        if isinstance(obj, Corte):
            cortes_capturados.append(obj)
        else:
            snapshots_capturados.append(obj)

    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    # MAX(Corte.numero) → max_numero; .all() → [] (iterável vazio p/ outros callers)
    exec_result = MagicMock()
    exec_result.scalar = lambda: max_numero
    exec_result.all = lambda: []
    session.execute = AsyncMock(return_value=exec_result)
    session.get = AsyncMock(return_value=projeto_mock)
    session.commit = AsyncMock()
    session.add = MagicMock(side_effect=_capturar)
    session.snapshots_capturados = snapshots_capturados

    def factory():
        return session

    return factory, projeto_mock, cortes_capturados, session


@pytest.mark.asyncio
async def test_importar_resultado_persiste_justificativa_por_corte(monkeypatch):
    """A justificativa que veio da skill é salva em Corte.justificativa."""
    factory, _projeto, cortes, _sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    cortes_data = [
        {
            "titulo_proposto": "A",
            "resumo": "...",
            "tema_central": "ttese",
            "justificativa": "Arco fechado tese→desenvolvimento→conclusão (15 min).",
            "inicio_hms": "00:05:00",
            "fim_hms": "00:20:00",
            "inicio_seg": 300,
            "fim_seg": 1200,
            "desvios": [],
        },
        {
            "titulo_proposto": "B",
            "resumo": "...",
            "tema_central": "outra",
            # justificativa ausente — deve virar string vazia
            "inicio_hms": "00:25:00",
            "fim_hms": "00:40:00",
            "inicio_seg": 1500,
            "fim_seg": 2400,
            "desvios": [],
        },
    ]

    await AnaliseService.importar_resultado("p-123", cortes_data)

    assert len(cortes) == 2
    assert cortes[0].justificativa == ("Arco fechado tese→desenvolvimento→conclusão (15 min).")
    assert cortes[1].justificativa == "", "justificativa ausente deve virar ''"


@pytest.mark.asyncio
async def test_importar_resultado_normaliza_justificativa_strip(monkeypatch):
    """Whitespace em volta da justificativa deve ser cortado."""
    factory, _projeto, cortes, _sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-strip",
        [
            {
                "titulo_proposto": "A",
                "justificativa": "   \n  com espaços em volta  \n  ",
                "inicio_hms": "00:00:00",
                "fim_hms": "00:10:00",
                "inicio_seg": 0,
                "fim_seg": 600,
            }
        ],
    )

    assert cortes[0].justificativa == "com espaços em volta"


@pytest.mark.asyncio
async def test_importar_resultado_numera_a_partir_do_maximo_existente(monkeypatch):
    """D-298: a numeração continua do MAIOR número já usado (não da contagem),
    então os cortes existentes são preservados e os novos seguem a sequência —
    robusto mesmo se o editor tiver apagado cortes do meio."""
    factory, _projeto, cortes, _sess = _mock_db_factory(max_numero=2)
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-num",
        [
            {
                "titulo_proposto": "novo 1",
                "inicio_hms": "00:30:00",
                "fim_hms": "00:40:00",
                "inicio_seg": 1800,
                "fim_seg": 2400,
            },
            {
                "titulo_proposto": "novo 2",
                "inicio_hms": "00:45:00",
                "fim_hms": "00:55:00",
                "inicio_seg": 2700,
                "fim_seg": 3300,
            },
        ],
    )

    assert [c.numero for c in cortes] == [3, 4], "novos devem seguir de MAX(numero)+1"


@pytest.mark.asyncio
async def test_importar_resultado_persiste_descartados_no_projeto(monkeypatch):
    """Quando `descartados` é informado, vai pro campo `descartados_analise`."""
    factory, projeto, _cortes, _sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    descartados = [
        {"tema": "treta com chat", "motivo": "fora do tom intelectual"},
        {"tema": "desabafo de saúde", "motivo": "NÃO_RECOMENDADO"},
    ]

    await AnaliseService.importar_resultado(
        "p-desc",
        [
            {
                "titulo_proposto": "x",
                "inicio_hms": "00:00:00",
                "fim_hms": "00:10:00",
                "inicio_seg": 0,
                "fim_seg": 600,
            }
        ],
        descartados=descartados,
    )

    salvo = json.loads(projeto.descartados_analise)
    assert salvo == descartados


@pytest.mark.asyncio
async def test_importar_resultado_descartados_lista_vazia_zera(monkeypatch):
    """Lista vazia explícita → o projeto fica com `[]` (zera análise anterior)."""
    factory, projeto, _cortes, _sess = _mock_db_factory()
    projeto.descartados_analise = '[{"tema":"velho","motivo":"limpar"}]'
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-zera",
        [
            {
                "titulo_proposto": "x",
                "inicio_hms": "00:00:00",
                "fim_hms": "00:10:00",
                "inicio_seg": 0,
                "fim_seg": 600,
            }
        ],
        descartados=[],
    )

    assert json.loads(projeto.descartados_analise) == []


@pytest.mark.asyncio
async def test_importar_resultado_descartados_none_preserva(monkeypatch):
    """`descartados=None` (default) NÃO mexe no valor já salvo no projeto.

    Retrocompatibilidade: callers que não conhecem o parâmetro não devem
    apagar uma auditoria anterior.
    """
    factory, projeto, _cortes, _sess = _mock_db_factory()
    pre = '[{"tema":"antigo","motivo":"foi mantido"}]'
    projeto.descartados_analise = pre
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-preserva",
        [
            {
                "titulo_proposto": "x",
                "inicio_hms": "00:00:00",
                "fim_hms": "00:10:00",
                "inicio_seg": 0,
                "fim_seg": 600,
            }
        ],
        # descartados omitido → default None → NÃO sobrescreve
    )

    assert projeto.descartados_analise == pre


@pytest.mark.asyncio
async def test_analisar_transcricao_repassa_descartados_via_claude(monkeypatch):
    """`analisar_transcricao` (agora via Claude) deve extrair `descartados`
    do resultado da geração e repassar pro importador (audit trail editorial).
    """
    from app.services.claude_ia import ClaudeIaService

    repasse: dict = {}

    async def fake_importar(projeto_id, cortes_data, *, descartados=None):
        repasse["projeto_id"] = projeto_id
        repasse["cortes_data"] = cortes_data
        repasse["descartados"] = descartados

    monkeypatch.setattr(AnaliseService, "importar_resultado", staticmethod(fake_importar))

    factory, projeto, _, _ = _mock_db_factory()
    projeto.transcricao_raw = json.dumps([{"start": 0, "end": 4, "texto": "fala"}])
    projeto.youtube_url = "http://x"
    projeto.titulo_live = "L"
    projeto.duracao_segundos = 60
    # O caminho Claude abre a própria sessão (módulo distinto de analise).
    monkeypatch.setattr("app.services.claude_ia.AsyncSessionLocal", factory)

    claude_payload = {
        "cortes": [{"titulo_proposto": "A", "inicio_hms": "00:00:00", "fim_hms": "00:01:00"}],
        "descartados": [{"tema": "x", "motivo": "y"}],
    }

    async def fake_gerar_cortes(_transcricao, _meta):
        return claude_payload

    monkeypatch.setattr(ClaudeIaService, "_gerar_cortes", staticmethod(fake_gerar_cortes))

    # Sem vídeo no fluxo de teste: neutraliza o encadeamento de refazer-transcrição.
    async def fake_refazer(_projeto_id):
        return None

    monkeypatch.setattr(ClaudeIaService, "_refazer_transcricao", staticmethod(fake_refazer))

    await AnaliseService.analisar_transcricao("p-claude")

    assert repasse["descartados"] == [{"tema": "x", "motivo": "y"}]


# ── D-299: falantes_map na análise de intervalo ────────────────────────────


def _transcricao_intervalo_json() -> str:
    return json.dumps(
        [
            {"inicio": "00:00:00", "fim": "00:00:04", "texto": "fala 1"},
            {"inicio": "00:05:00", "fim": "00:05:04", "texto": "fala 2"},
        ]
    )


@pytest.mark.asyncio
async def test_analisar_intervalo_injeta_falantes_map_quando_diarizado(monkeypatch):
    """D-299: projeto diarizado → `meta["falantes_map"]` chega no `_gerar_cortes`
    igual ao que `analisar_via_claude` (D-286) já injeta na análise completa.
    """
    from app.services.claude_ia import ClaudeIaService

    factory, projeto, _cortes, _sess = _mock_db_factory()
    projeto.transcricao_raw = _transcricao_intervalo_json()
    projeto.titulo_live = "L"
    projeto.youtube_url = "http://x"
    projeto.duracao_segundos = 600
    mapa_falantes = {
        "SPEAKER_00": {"nome": "Pedro", "is_canal": True},
        "SPEAKER_01": {"nome": "", "is_canal": False},
    }
    projeto.falantes_map = json.dumps(mapa_falantes)
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    capturado: dict = {}

    async def fake_gerar_cortes(transcricao, meta):
        capturado["transcricao"] = transcricao
        capturado["meta"] = meta
        return {
            "cortes": [
                {
                    "titulo_proposto": "A",
                    "inicio_hms": "00:00:00",
                    "fim_hms": "00:05:04",
                    "inicio_seg": 0,
                    "fim_seg": 304,
                    "desvios": [],
                }
            ]
        }

    monkeypatch.setattr(ClaudeIaService, "_gerar_cortes", staticmethod(fake_gerar_cortes))

    await AnaliseService.analisar_intervalo("p-intervalo-diarizado", 0, 600)

    assert capturado["meta"]["falantes_map"] == mapa_falantes


@pytest.mark.asyncio
async def test_analisar_intervalo_sem_diarizacao_falantes_map_none(monkeypatch):
    """Sem diarização (`falantes_map` vazio) o `meta["falantes_map"]` sai `None`
    — mesmo valor que `meta.get("falantes_map")` retornava quando a chave nem
    existia, então o prompt formatado fica idêntico ao comportamento anterior.
    """
    from app.services.claude_ia import ClaudeIaService

    factory, projeto, _cortes, _sess = _mock_db_factory()
    projeto.transcricao_raw = _transcricao_intervalo_json()
    projeto.titulo_live = "L"
    projeto.youtube_url = "http://x"
    projeto.duracao_segundos = 600
    projeto.falantes_map = "{}"  # projeto nunca diarizado (default do modelo)
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    capturado: dict = {}

    async def fake_gerar_cortes(transcricao, meta):
        capturado["meta"] = meta
        return {
            "cortes": [
                {
                    "titulo_proposto": "A",
                    "inicio_hms": "00:00:00",
                    "fim_hms": "00:05:04",
                    "inicio_seg": 0,
                    "fim_seg": 304,
                    "desvios": [],
                }
            ]
        }

    monkeypatch.setattr(ClaudeIaService, "_gerar_cortes", staticmethod(fake_gerar_cortes))

    await AnaliseService.analisar_intervalo("p-intervalo-sem-diarizacao", 0, 600)

    assert capturado["meta"]["falantes_map"] is None


# ── D-302: campos v2 da proposta (frase_gancho, contextualizacao, score) ────


@pytest.mark.asyncio
async def test_importar_resultado_persiste_campos_v2_no_corte_e_no_snapshot(monkeypatch):
    """Proposta v2 completa → frase_gancho/contextualizacao/score chegam ao
    Corte e são congelados no CorteSnapshot (telemetria mede a proposta v2)."""
    factory, _projeto, cortes, sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-v2",
        [
            {
                "titulo_proposto": "A",
                "inicio_hms": "00:05:00",
                "fim_hms": "00:20:00",
                "frase_gancho": {"hms": "00:05:12", "texto": "a frase mais forte"},
                "contextualizacao": "Sobre o último jogo do Flamengo…",
                "score": {"hook": 8, "flow": 7, "value": 9, "total": 24},
            }
        ],
    )

    corte = cortes[0]
    assert corte.frase_gancho_hms == "00:05:12"
    assert corte.frase_gancho_texto == "a frase mais forte"
    assert corte.contextualizacao == "Sobre o último jogo do Flamengo…"
    assert json.loads(corte.score_json) == {"hook": 8, "flow": 7, "value": 9, "total": 24}

    snap = sess.snapshots_capturados[0]
    assert snap.frase_gancho_hms == "00:05:12"
    assert snap.frase_gancho_texto == "a frase mais forte"
    assert snap.contextualizacao == "Sobre o último jogo do Flamengo…"
    assert json.loads(snap.score_json) == {"hook": 8, "flow": 7, "value": 9, "total": 24}


@pytest.mark.asyncio
async def test_importar_resultado_tolera_ausencia_dos_campos_v2(monkeypatch):
    """Back-compat: skill anterior à v2 (sem os campos novos, ou com
    contextualizacao=null) importa normalmente com defaults vazios."""
    factory, _projeto, cortes, sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-v1",
        [
            {
                "titulo_proposto": "A",
                "inicio_hms": "00:05:00",
                "fim_hms": "00:20:00",
                "contextualizacao": None,  # v2 explícito: sem contextualização
            },
            {
                "titulo_proposto": "B",
                "inicio_hms": "00:25:00",
                "fim_hms": "00:40:00",
                "frase_gancho": "string errada",  # tipo inesperado → ignora
                "score": [1, 2, 3],  # tipo inesperado → ignora
            },
        ],
    )

    for corte in cortes:
        assert corte.frase_gancho_hms == ""
        assert corte.frase_gancho_texto == ""
        assert corte.contextualizacao == ""
        assert corte.score_json == "{}"
    assert sess.snapshots_capturados[0].score_json == "{}"


@pytest.mark.asyncio
async def test_importar_resultado_rotula_desvios_da_analise_claude(monkeypatch):
    """D-302: desvio proposto pela análise interna (origem='claude') herda
    origem='claude' — pré-requisito do merge revisável da 2ª passada. Desvio
    que já traz origem própria é respeitado."""
    factory, _projeto, cortes, _sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-origem",
        [
            {
                "titulo_proposto": "A",
                "inicio_hms": "00:05:00",
                "fim_hms": "00:20:00",
                "desvios": [
                    {"inicio_hms": "00:06:00", "fim_hms": "00:06:30", "motivo": "vinheta"},
                    {
                        "inicio_hms": "00:08:00",
                        "fim_hms": "00:08:20",
                        "motivo": "silêncio",
                        "origem": "tecnico",
                    },
                ],
            }
        ],
    )

    desvios = json.loads(cortes[0].desvios)
    assert desvios[0]["origem"] == "claude"
    assert desvios[1]["origem"] == "tecnico", "origem própria do desvio é respeitada"


@pytest.mark.asyncio
async def test_importar_resultado_manual_nao_rotula_desvios(monkeypatch):
    """Import manual (paste de IA externa): o editor assume a proveniência —
    desvios ficam SEM origem (contam como manuais e protegidos de revisão)."""
    factory, _projeto, cortes, _sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-manual",
        [
            {
                "titulo_proposto": "A",
                "inicio_hms": "00:05:00",
                "fim_hms": "00:20:00",
                "desvios": [{"inicio_hms": "00:06:00", "fim_hms": "00:06:30", "motivo": "vinheta"}],
            }
        ],
        origem="manual",
    )

    assert "origem" not in json.loads(cortes[0].desvios)[0]


# ── D-303: snapshot imutável da proposta da IA ──────────────────────────────


@pytest.mark.asyncio
async def test_importar_resultado_congela_um_snapshot_por_corte(monkeypatch):
    """Cada corte importado ganha um CorteSnapshot espelhando a proposta."""
    factory, _projeto, cortes, sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-snap",
        [
            {
                "titulo_proposto": "A",
                "tema_central": "t",
                "resumo": "r",
                "justificativa": "j",
                "inicio_hms": "00:10:00",
                "fim_hms": "00:25:00",
                "desvios": [{"inicio_hms": "00:12:00", "fim_hms": "00:12:30", "motivo": "chat"}],
            }
        ],
    )

    assert len(cortes) == 1
    assert len(sess.snapshots_capturados) == 1
    snap = sess.snapshots_capturados[0]
    assert snap.corte_id == cortes[0].id
    assert snap.titulo_proposto == "A"
    assert snap.justificativa == "j"
    assert snap.inicio_seg == 600.0
    assert snap.fim_seg == 1500.0
    assert snap.origem_analise == "claude"  # default: único caller interno
    assert json.loads(snap.desvios)[0]["motivo"] == "chat"


@pytest.mark.asyncio
async def test_importar_resultado_snapshot_registra_origem_manual(monkeypatch):
    """Endpoints de paste passam origem='manual' — fica gravado no snapshot."""
    factory, _projeto, _cortes, sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-snap-manual",
        [{"titulo_proposto": "A", "inicio_hms": "00:00:10", "fim_hms": "00:01:00"}],
        origem="manual",
    )

    assert sess.snapshots_capturados[0].origem_analise == "manual"


@pytest.mark.asyncio
async def test_analisar_intervalo_tambem_congela_snapshot(monkeypatch):
    """A análise de intervalo cria cortes fora do importar_resultado — o
    snapshot precisa nascer lá também (origem claude)."""
    from app.services.claude_ia import ClaudeIaService

    factory, projeto, cortes, sess = _mock_db_factory()
    projeto.transcricao_raw = _transcricao_intervalo_json()
    projeto.titulo_live = "L"
    projeto.youtube_url = "http://x"
    projeto.duracao_segundos = 600
    projeto.falantes_map = "{}"
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    async def fake_gerar_cortes(_transcricao, _meta):
        return {
            "cortes": [
                {
                    "titulo_proposto": "A",
                    "inicio_hms": "00:00:00",
                    "fim_hms": "00:05:04",
                    "inicio_seg": 0,
                    "fim_seg": 304,
                    "desvios": [],
                }
            ]
        }

    monkeypatch.setattr(ClaudeIaService, "_gerar_cortes", staticmethod(fake_gerar_cortes))

    await AnaliseService.analisar_intervalo("p-intervalo-snap", 0, 600)

    assert len(cortes) == 1
    assert len(sess.snapshots_capturados) == 1
    snap = sess.snapshots_capturados[0]
    assert snap.corte_id == cortes[0].id
    assert snap.origem_analise == "claude"
    assert snap.fim_seg == 304.0
