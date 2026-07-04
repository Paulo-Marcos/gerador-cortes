import pytest
from app.routers import export as export_router
from fastapi import HTTPException


class _FakeDb:
    """Substituto vazio para AsyncSession — endpoint nao usa o `db` injetado."""


@pytest.mark.asyncio
async def test_marcar_corte_publicado_url_valida_retorna_payload(monkeypatch):
    payload_servico = {
        "status": "ok",
        "video_id": "ZcvZLOResPc",
        "url": "https://youtu.be/ZcvZLOResPc",
        "titulo": "Corte do dia",
        "privacy_status": "public",
        "upload_status": "processed",
        "scheduled_at": "",
        "mensagem": "Video confirmado no YouTube e marcado no banco.",
    }

    chamada: dict = {}

    async def fake_marcar(corte_id, youtube_url):
        chamada["corte_id"] = corte_id
        chamada["youtube_url"] = youtube_url
        return payload_servico

    monkeypatch.setattr(export_router.YouTubeService, "marcar_corte_publicado", fake_marcar)

    body = export_router.MarcarPublicadoRequest(youtube_url="https://youtu.be/ZcvZLOResPc")
    resposta = await export_router.marcar_corte_publicado("corte-1", body, db=_FakeDb())

    assert resposta == payload_servico
    assert chamada == {"corte_id": "corte-1", "youtube_url": "https://youtu.be/ZcvZLOResPc"}


@pytest.mark.asyncio
async def test_marcar_corte_publicado_url_invalida_retorna_400(monkeypatch):
    async def fake_marcar(corte_id, youtube_url):
        return {
            "status": "erro",
            "mensagem": "URL ou ID do YouTube vazio; informe um video_id de 11 caracteres.",
        }

    monkeypatch.setattr(export_router.YouTubeService, "marcar_corte_publicado", fake_marcar)

    body = export_router.MarcarPublicadoRequest(youtube_url="")

    with pytest.raises(HTTPException) as exc_info:
        await export_router.marcar_corte_publicado("corte-1", body, db=_FakeDb())

    assert exc_info.value.status_code == 400
    assert "youtube" in exc_info.value.detail.lower() or "vazio" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_marcar_corte_publicado_corte_inexistente_retorna_404(monkeypatch):
    async def fake_marcar(corte_id, youtube_url):
        return {"status": "erro", "mensagem": "Corte não encontrado"}

    monkeypatch.setattr(export_router.YouTubeService, "marcar_corte_publicado", fake_marcar)

    body = export_router.MarcarPublicadoRequest(youtube_url="https://youtu.be/ZcvZLOResPc")

    with pytest.raises(HTTPException) as exc_info:
        await export_router.marcar_corte_publicado("corte-inexistente", body, db=_FakeDb())

    assert exc_info.value.status_code == 404
    assert "não encontrado" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_marcar_corte_publicado_video_de_outro_canal_retorna_400(monkeypatch):
    async def fake_marcar(corte_id, youtube_url):
        return {
            "status": "erro",
            "mensagem": "Vídeo ZcvZLOResPc existe, mas não pertence ao canal autenticado.",
        }

    monkeypatch.setattr(export_router.YouTubeService, "marcar_corte_publicado", fake_marcar)

    body = export_router.MarcarPublicadoRequest(youtube_url="https://youtu.be/ZcvZLOResPc")

    with pytest.raises(HTTPException) as exc_info:
        await export_router.marcar_corte_publicado("corte-1", body, db=_FakeDb())

    # "vídeo ... não pertence" tem "não" mas o assert busca "não encontrado" especificamente
    # → cai no 400 (regra genérica de erro de validacao do servico).
    assert exc_info.value.status_code == 400
