"""D-934: a agenda do lote do YouTube longo sai pelo MESMO endpoint da dos shorts.

O modal de "Publicar em massa" pede `/api/shorts/lote/agenda` com os cortes e o
destino `youtube`, e recebe as linhas que a janela do canal propõe. Publicar
continua sendo do upload do YouTube: o lote de shorts não aceita esse destino.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.core import channel_paths
from app.routers import errors, shorts_lote
from app.services import escalonamento_do_lote
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: tmp_path / "canal-teste")

    app = FastAPI()
    errors.registrar_tratadores(app)
    app.include_router(shorts_lote.router, prefix="/api/shorts")
    return TestClient(app)


def test_agenda_do_youtube_longo_vem_da_janela_do_canal(client, monkeypatch):
    pedidos = []

    async def _prever_youtube(alvos, *, agora=None):
        pedidos.append(alvos)
        return [
            escalonamento_do_lote.LinhaDaAgenda(t, a, "youtube", "2030-01-07T12:00", "medio", "")
            for t, a in alvos
        ]

    monkeypatch.setattr(escalonamento_do_lote, "prever_youtube", _prever_youtube, raising=False)

    resposta = client.post(
        "/api/shorts/lote/agenda",
        json={"alvos": ["corte:c1", "corte:c2"], "plataformas": ["youtube"]},
    )

    assert resposta.status_code == 200
    assert pedidos == [[("corte", "c1"), ("corte", "c2")]]
    itens = resposta.json()["itens"]
    assert [(i["alvo_id"], i["plataforma"]) for i in itens] == [
        ("c1", "youtube"),
        ("c2", "youtube"),
    ]


def test_o_lote_de_shorts_nao_publica_no_youtube_longo(client):
    resposta = client.post(
        "/api/shorts/lote", json={"alvos": ["corte:c1"], "plataformas": ["youtube"]}
    )

    assert resposta.status_code == 404


class _DbComCorte:
    async def get(self, modelo, corte_id):
        return object()


@pytest.mark.asyncio
@pytest.mark.parametrize("falha", [False, True])
async def test_envio_avulso_segura_a_vaga_enquanto_sobe(monkeypatch, falha):
    """Pr-audit do #199: o upload só grava a data no corte ao terminar; até lá,
    a agenda do próximo envio precisa ver o horário prometido."""
    from app.routers import export as export_router
    from app.services import agenda_youtube_em_voo

    monkeypatch.setattr(agenda_youtube_em_voo, "_reservas", {})
    vista_durante = []

    async def upload(corte_id, scheduled_at=None):
        vista_durante.append(agenda_youtube_em_voo.ultima())
        if falha:
            raise RuntimeError("rede caiu")
        return {"status": "ok", "video_id": "v1", "url": "u", "scheduled_at": scheduled_at}

    monkeypatch.setattr(export_router.YouTubeService, "upload_video", upload)
    pedido = export_router.YouTubeUploadRequest(scheduled_at="2030-01-07T15:00:00.000Z")

    try:
        await export_router.upload_to_youtube("c1", pedido, db=_DbComCorte())
    except Exception:  # noqa: BLE001 — a falha vira 500; aqui importa só a reserva
        assert falha

    assert vista_durante[0] is not None
    assert vista_durante[0].isoformat().startswith("2030-01-07")
    assert agenda_youtube_em_voo.ultima() is None
