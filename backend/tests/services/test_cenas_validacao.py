"""Testes do endpoint POST /cortes/{corte_id}/cenas-remotion/validar.

Garante o contrato da feature F-015:

- Sem corpo (ou {"validado": true}), marca `cenas_validadas=1` e grava timestamp.
- Com {"validado": false}, desfaz a marca e limpa o timestamp.
- Recusa validar quando ainda nao ha cenas salvas.
- 404 quando o corte nao existe.
- Ao salvar `cenas_remotion` com payload diferente, a marca de validacao e reset
  para forcar revalidacao consciente.
"""

import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.routers import cortes as cortes_router
from app.routers.cortes import AtualizarCorteRequest, ValidarCenasRequest
from fastapi import HTTPException


def _corte_estavel(*, cenas_remotion="[]", cenas_validadas=0):
    """Constroi um Corte-like com os atributos necessarios para _corte_to_dict.

    Usa MagicMock + lista explicita de colunas para nao precisar carregar o
    metadata do SQLAlchemy. Mantem `cenas_remotion` como JSON serializado para
    espelhar o que o banco devolveria.
    """
    corte = MagicMock()
    corte.id = "corte-1"
    corte.projeto_id = "projeto-1"
    corte.numero = 1
    corte.titulo_proposto = "Titulo"
    corte.resumo = ""
    corte.tema_central = ""
    corte.inicio_hms = "00:00:00"
    corte.fim_hms = "00:00:30"
    corte.inicio_seg = 0.0
    corte.fim_seg = 30.0
    corte.desvios = "[]"
    corte.status = "aprovado"
    corte.arquivo_clip_path = ""
    corte.duracao_clip_seg = 0.0
    corte.youtube_video_id = ""
    corte.youtube_url_publicado = ""
    corte.youtube_scheduled_at = ""
    corte.is_leitura = 0
    corte.autor_leitura = ""
    corte.parte_leitura = 1
    corte.transcricao_corte = "[]"
    corte.transcricao_final = "[]"
    corte.transcricao_final_texto = ""
    corte.cenas_remotion = cenas_remotion
    corte.cenas_validadas = cenas_validadas
    corte.cenas_validadas_em = None
    corte.is_pos_producao = 0
    corte.sugestoes_ia_raw = ""
    corte.criado_em = datetime(2026, 5, 24, 12, 0, 0)
    corte.atualizado_em = datetime(2026, 5, 24, 12, 0, 0)
    corte.metadado = None
    # _corte_to_dict itera por corte.__table__.columns.keys()
    columns = [
        "id",
        "projeto_id",
        "numero",
        "titulo_proposto",
        "resumo",
        "tema_central",
        "inicio_hms",
        "fim_hms",
        "inicio_seg",
        "fim_seg",
        "desvios",
        "status",
        "arquivo_clip_path",
        "duracao_clip_seg",
        "youtube_video_id",
        "youtube_url_publicado",
        "youtube_scheduled_at",
        "is_leitura",
        "autor_leitura",
        "parte_leitura",
        "transcricao_corte",
        "transcricao_final",
        "transcricao_final_texto",
        "cenas_remotion",
        "cenas_validadas",
        "cenas_validadas_em",
        "is_pos_producao",
        "sugestoes_ia_raw",
        "criado_em",
        "atualizado_em",
    ]
    keys_mock = MagicMock()
    keys_mock.keys.return_value = columns
    corte.__table__ = MagicMock()
    corte.__table__.columns = keys_mock
    return corte


def _db_que_retorna(corte):
    db = AsyncMock()

    async def fake_execute(_stmt):
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=corte)
        return result

    db.execute = fake_execute
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_validar_sem_body_marca_validado_e_grava_timestamp():
    corte = _corte_estavel(
        cenas_remotion=json.dumps([{"tipo": "tela_cheia", "inicio": 0, "fim": 5}]),
        cenas_validadas=0,
    )
    db = _db_que_retorna(corte)

    resposta = await cortes_router.validar_cenas_remotion("corte-1", body=None, db=db)

    assert corte.cenas_validadas == 1
    assert corte.cenas_validadas_em is not None
    assert resposta["cenas_validadas"] == 1
    assert resposta["cenas_validadas_em"] is not None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_validar_com_validado_false_desfaz_a_marca():
    corte = _corte_estavel(
        cenas_remotion=json.dumps([{"tipo": "tela_cheia", "inicio": 0, "fim": 5}]),
        cenas_validadas=1,
    )
    corte.cenas_validadas_em = datetime(2026, 5, 23, 10, 0, 0)
    db = _db_que_retorna(corte)

    resposta = await cortes_router.validar_cenas_remotion(
        "corte-1",
        body=ValidarCenasRequest(validado=False),
        db=db,
    )

    assert corte.cenas_validadas == 0
    assert corte.cenas_validadas_em is None
    assert resposta["cenas_validadas"] == 0
    assert resposta["cenas_validadas_em"] is None


@pytest.mark.asyncio
async def test_validar_recusa_quando_nao_ha_cenas_salvas():
    corte = _corte_estavel(cenas_remotion="[]", cenas_validadas=0)
    db = _db_que_retorna(corte)

    with pytest.raises(HTTPException) as exc:
        await cortes_router.validar_cenas_remotion(
            "corte-1",
            body=ValidarCenasRequest(validado=True),
            db=db,
        )

    assert exc.value.status_code == 400
    assert "Nao ha cenas" in exc.value.detail
    db.commit.assert_not_called()
    # nao alterou a flag
    assert corte.cenas_validadas == 0


@pytest.mark.asyncio
async def test_validar_404_quando_corte_inexistente():
    db = _db_que_retorna(None)

    with pytest.raises(HTTPException) as exc:
        await cortes_router.validar_cenas_remotion(
            "nao-existe",
            body=ValidarCenasRequest(validado=True),
            db=db,
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_atualizar_corte_invalida_marca_quando_cenas_mudam():
    """Salvar cenas_remotion diferentes precisa resetar cenas_validadas."""
    cenas_originais = [{"tipo": "tela_cheia", "inicio": 0, "fim": 5}]
    corte = _corte_estavel(
        cenas_remotion=json.dumps(cenas_originais),
        cenas_validadas=1,
    )
    corte.cenas_validadas_em = datetime(2026, 5, 23, 10, 0, 0)
    db = _db_que_retorna(corte)

    novas_cenas = [{"tipo": "tela_cheia", "inicio": 0, "fim": 7}]  # fim diferente
    body = AtualizarCorteRequest(cenas_remotion=novas_cenas)

    await cortes_router.atualizar_corte("corte-1", body=body, db=db)

    assert corte.cenas_validadas == 0
    assert corte.cenas_validadas_em is None


@pytest.mark.asyncio
async def test_atualizar_corte_preserva_marca_quando_cenas_iguais():
    """Salvar exatamente as mesmas cenas preserva a validacao (idempotente)."""
    cenas = [
        {
            "tipo": "tela_cheia",
            "inicio": 0.0,
            "fim": 5.0,
            "inicio_seg": 0.0,
            "fim_seg": 5.0,
        }
    ]
    corte = _corte_estavel(
        cenas_remotion=json.dumps(cenas, ensure_ascii=False),
        cenas_validadas=1,
    )
    timestamp = datetime(2026, 5, 23, 10, 0, 0)
    corte.cenas_validadas_em = timestamp
    db = _db_que_retorna(corte)

    body = AtualizarCorteRequest(cenas_remotion=cenas)

    await cortes_router.atualizar_corte("corte-1", body=body, db=db)

    assert corte.cenas_validadas == 1
    assert corte.cenas_validadas_em == timestamp
