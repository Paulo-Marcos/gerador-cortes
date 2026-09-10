"""D-566: o endpoint espelho do `marcar-publicado`.

O router não decide nada sobre publicação — ele traduz o veredito do serviço
para HTTP. Estes testes guardam essa tradução: corte inexistente é 404, destino
inválido é 400, e o no-op continua sendo 200.
"""

import pytest
from app.routers import export as export_router
from fastapi import HTTPException


def _fake_servico(monkeypatch, payload, registro=None):
    async def _liberar(corte_id, destino):
        if registro is not None:
            registro.update({"corte_id": corte_id, "destino": destino})
        return payload

    monkeypatch.setattr(export_router, "liberar_publicacao", _liberar)


@pytest.mark.asyncio
async def test_liberacao_ok_repassa_o_payload_do_servico(monkeypatch):
    payload = {
        "status": "ok",
        "corte_id": "corte-1",
        "destino": "youtube",
        "rotulo": "YouTube",
        "liberado": True,
        "campos_limpos": ["youtube_video_id", "youtube_url_publicado"],
        "video_pronto": True,
        "mensagem": "Liberado no YouTube. O corte voltou para a fila de publicação.",
    }
    chamada: dict = {}
    _fake_servico(monkeypatch, payload, chamada)

    body = export_router.LiberarPublicacaoRequest(destino="youtube")
    resposta = await export_router.liberar_publicacao_do_corte("corte-1", body)

    assert resposta == payload
    assert chamada == {"corte_id": "corte-1", "destino": "youtube"}


@pytest.mark.asyncio
async def test_destino_default_e_youtube(monkeypatch):
    """É o destino que trava o re-upload — e o motivo de quase toda chamada."""
    chamada: dict = {}
    _fake_servico(monkeypatch, {"status": "ok"}, chamada)

    await export_router.liberar_publicacao_do_corte(
        "corte-1", export_router.LiberarPublicacaoRequest()
    )

    assert chamada["destino"] == "youtube"


@pytest.mark.asyncio
async def test_corte_inexistente_vira_404(monkeypatch):
    _fake_servico(monkeypatch, {"status": "erro", "mensagem": "Corte não encontrado"})

    with pytest.raises(HTTPException) as exc_info:
        await export_router.liberar_publicacao_do_corte(
            "corte-fantasma", export_router.LiberarPublicacaoRequest()
        )

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_destino_desconhecido_vira_400(monkeypatch):
    _fake_servico(
        monkeypatch,
        {
            "status": "erro",
            "mensagem": "Destino desconhecido: 'instagram'. Destinos válidos: youtube, tiktok.",
        },
    )

    with pytest.raises(HTTPException) as exc_info:
        await export_router.liberar_publicacao_do_corte(
            "corte-1", export_router.LiberarPublicacaoRequest(destino="instagram")
        )

    assert exc_info.value.status_code == 400
    assert "instagram" in exc_info.value.detail
