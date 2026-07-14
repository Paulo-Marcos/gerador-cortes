"""Testes do enriquecimento do payload do ranking com o painel de embasamento (D-356).

`_serializar` (serviço) lê o breakdown detalhado persistido em `componentes_pontuacao`
e devolve, além do mapa plano de contribuições (compat), o `embasamento` por critério
ENRIQUECIDO com o rótulo do `ranking_settings` (rótulo é presentação — mora no serviço,
não no domínio puro), mais as `sentimento_destaques`.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from app.models import LiveCandidata
from app.services import ranking_lives

_DETALHES = [
    {
        "criterio": "views",
        "valor_bruto": 1_000.0,
        "valor_normalizado": 0.5,
        "peso": 0.08,
        "contribuicao": 4.0,
    },
    {
        "criterio": "sentimento",
        "valor_bruto": 8.0,
        "valor_normalizado": 0.8,
        "peso": 0.30,
        "contribuicao": 24.0,
    },
    {
        "criterio": "vph",
        "valor_bruto": 42.0,
        "valor_normalizado": 0.6,
        "peso": 0.10,
        "contribuicao": 6.0,
    },
]


def _candidata(componentes_json: str, destaques: list[str]) -> LiveCandidata:
    return LiveCandidata(
        id="id-1",
        video_id="v1",
        titulo="Live de teste",
        canal_origem="Canal",
        thumbnail_url="",
        duracao_iso="PT1H",
        data_publicacao=datetime(2026, 6, 1, tzinfo=UTC),
        views=1_000,
        likes=50,
        comentarios=10,
        sentimento_score=8.0,
        sentimento_destaques=json.dumps(destaques, ensure_ascii=False),
        pontuacao_total=34.0,
        componentes_pontuacao=componentes_json,
        status="pendente",
        fetched_at=datetime(2026, 6, 7, tzinfo=UTC),
    )


def test_payload_traz_embasamento_com_rotulo_e_destaques():
    destaques = ["Aula excelente", "Melhor live do ano"]
    c = _candidata(json.dumps(_DETALHES), destaques)

    payload = ranking_lives._serializar(c)

    assert payload["sentimento_destaques"] == destaques
    embasamento = payload["embasamento"]
    assert len(embasamento) == 3
    sentimento = next(item for item in embasamento if item["criterio"] == "sentimento")
    assert "positividade" in sentimento["rotulo"].lower()  # rótulo do catálogo
    assert sentimento["valor_bruto"] == 8.0
    assert sentimento["contribuicao"] == 24.0


def test_embasamento_ordenado_pela_filosofia_do_catalogo():
    # sentimento vem antes de vph, que vem antes de views (ordem do catálogo D-356).
    c = _candidata(json.dumps(_DETALHES), [])
    ordem = [item["criterio"] for item in ranking_lives._serializar(c)["embasamento"]]
    assert ordem.index("sentimento") < ordem.index("vph") < ordem.index("views")


def test_mapa_plano_de_componentes_mantem_compat():
    c = _candidata(json.dumps(_DETALHES), [])
    componentes = ranking_lives._serializar(c)["componentes_pontuacao"]
    assert componentes == {"views": 4.0, "sentimento": 24.0, "vph": 6.0}


def test_tolera_formato_legado_mapa_plano():
    # Linhas gravadas antes do D-356 guardam um mapa plano criterio→contribuição.
    c = _candidata(json.dumps({"views": 5.0, "sentimento": 20.0}), [])
    payload = ranking_lives._serializar(c)
    assert payload["embasamento"] == []
    assert payload["componentes_pontuacao"] == {"views": 5.0, "sentimento": 20.0}
