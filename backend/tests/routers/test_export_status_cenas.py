"""Testes do payload de status_export (F-015) com foco em cenas_geradas / cenas_validadas.

Cobre o helper puro `_contar_cenas_remotion` e o caminho do endpoint
`GET /export/projeto/{projeto_id}/status` quando o corte tem cenas geradas e
validadas. Os caminhos de filesystem (graded/upload_ready) sao isolados por
`tmp_path` + monkeypatch em `projetos_dir()` (resolver vivo do canal).
"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.routers import export as export_router

# ─── Helper puro ────────────────────────────────────────────────────────────


class TestContarCenasRemotion:
    def test_lista_pura_com_duas_cenas(self):
        payload = json.dumps(
            [
                {"tipo": "tela_cheia", "inicio": 0, "fim": 5},
                {"tipo": "barra_inferior", "inicio": 5, "fim": 10},
            ]
        )
        assert export_router._contar_cenas_remotion(payload) == 2

    def test_objeto_com_chave_cenas(self):
        payload = json.dumps(
            {
                "formato": "9:16",
                "cenas": [{"tipo": "tela_cheia", "inicio": 0, "fim": 5}],
            }
        )
        assert export_router._contar_cenas_remotion(payload) == 1

    def test_objeto_sem_lista_de_cenas(self):
        assert export_router._contar_cenas_remotion(json.dumps({"formato": "9:16"})) == 0

    def test_payload_vazio_ou_nulo(self):
        assert export_router._contar_cenas_remotion(None) == 0
        assert export_router._contar_cenas_remotion("") == 0
        assert export_router._contar_cenas_remotion("[]") == 0

    def test_json_invalido_nao_quebra(self):
        assert export_router._contar_cenas_remotion("{nao-e-json}") == 0


# ─── Integracao do endpoint ─────────────────────────────────────────────────


def _corte_estavel(
    *,
    corte_id="corte-1",
    projeto_id="projeto-1",
    cenas_remotion="[]",
    cenas_validadas=0,
    arquivo_clip_path="",
    youtube_video_id="",
    youtube_url_publicado="",
    youtube_scheduled_at="",
):
    corte = MagicMock()
    corte.id = corte_id
    corte.projeto_id = projeto_id
    corte.numero = 1
    corte.titulo_proposto = "Titulo do corte"
    corte.cenas_remotion = cenas_remotion
    corte.cenas_validadas = cenas_validadas
    corte.arquivo_clip_path = arquivo_clip_path
    corte.youtube_video_id = youtube_video_id
    corte.youtube_url_publicado = youtube_url_publicado
    corte.youtube_scheduled_at = youtube_scheduled_at
    return corte


def _db_mock(cortes, meta=None):
    """Retorna um AsyncMock de db cujos execute() devolvem `cortes` e depois
    `meta` (metadado) repetidamente, na ordem dos awaits do endpoint."""
    db = AsyncMock()

    chamadas = {"i": 0}

    async def fake_execute(_stmt):
        result = MagicMock()
        chamadas["i"] += 1
        if chamadas["i"] == 1:
            scalars_mock = MagicMock()
            scalars_mock.all = MagicMock(return_value=cortes)
            result.scalars = MagicMock(return_value=scalars_mock)
        else:
            result.scalar_one_or_none = MagicMock(return_value=meta)
        return result

    db.execute = fake_execute
    return db


@pytest.mark.asyncio
async def test_status_export_devolve_cenas_geradas_true_e_validadas_false(monkeypatch, tmp_path):
    monkeypatch.setattr(export_router, "projetos_dir", lambda: tmp_path)
    cenas_payload = json.dumps([{"tipo": "tela_cheia", "inicio": 0, "fim": 5}])
    corte = _corte_estavel(cenas_remotion=cenas_payload, cenas_validadas=0)
    db = _db_mock([corte], meta=None)

    resposta = await export_router.status_export("projeto-1", db=db)

    items = resposta["cortes"]
    assert len(items) == 1
    assert items[0]["cenas_geradas"] is True
    assert items[0]["cenas_validadas"] is False


@pytest.mark.asyncio
async def test_status_export_devolve_cenas_validadas_true_quando_marcado(monkeypatch, tmp_path):
    monkeypatch.setattr(export_router, "projetos_dir", lambda: tmp_path)
    cenas_payload = json.dumps([{"tipo": "tela_cheia", "inicio": 0, "fim": 5}])
    corte = _corte_estavel(cenas_remotion=cenas_payload, cenas_validadas=1)
    db = _db_mock([corte], meta=None)

    resposta = await export_router.status_export("projeto-1", db=db)

    item = resposta["cortes"][0]
    assert item["cenas_geradas"] is True
    assert item["cenas_validadas"] is True


@pytest.mark.asyncio
async def test_status_export_sem_cenas_marca_geradas_false(monkeypatch, tmp_path):
    monkeypatch.setattr(export_router, "projetos_dir", lambda: tmp_path)
    corte = _corte_estavel(cenas_remotion="[]", cenas_validadas=0)
    db = _db_mock([corte], meta=None)

    resposta = await export_router.status_export("projeto-1", db=db)

    item = resposta["cortes"][0]
    assert item["cenas_geradas"] is False
    assert item["cenas_validadas"] is False


@pytest.mark.asyncio
async def test_status_export_graded_pronta_quando_clip_graded_existe(monkeypatch, tmp_path):
    """Quando upload_ready ainda nao existe mas graded existe, grade_pronta=True
    e video_pronto=False. Essa combinacao corresponde a etapa intermediaria
    "Graded" da nova pill no menu de cortes."""
    monkeypatch.setattr(export_router, "projetos_dir", lambda: tmp_path)
    graded_dir = tmp_path / "projeto-1" / "cortes" / "corte-1" / "graded"
    graded_dir.mkdir(parents=True)
    (graded_dir / "clip_graded.mp4").write_bytes(b"\x00")

    corte = _corte_estavel(cenas_remotion="[]", cenas_validadas=0)
    db = _db_mock([corte], meta=None)

    resposta = await export_router.status_export("projeto-1", db=db)

    item = resposta["cortes"][0]
    assert item["grade_pronta"] is True
    assert item["video_pronto"] is False
