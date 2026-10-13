"""D-908: os endpoints da configuração por canal e da agenda do lote.

Monta só os routers numa app nova (sem o lifespan real) e aponta o banco de
settings para um `tmp_path`, no padrão de `test_channels_router`.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pytest
from app.core import channel_paths
from app.routers import editorial_skills, errors, shorts_lote
from app.services import escalonamento_do_lote
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: tmp_path / "canal-teste")

    app = FastAPI()
    errors.registrar_tratadores(app)
    app.include_router(editorial_skills.router, prefix="/api/editorial-skills")
    app.include_router(shorts_lote.router, prefix="/api/shorts")
    return TestClient(app)


def test_get_devolve_o_padrao_e_diz_que_e_o_padrao(client):
    resposta = client.get("/api/editorial-skills/escalonamento")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["publico_personalizado"] is False
    assert corpo["dias_da_semana"][0] == "segunda"
    assert len(corpo["faixas"]) == len(corpo["faixas_padrao"]) == 28
    assert [d["destino"] for d in corpo["destinos"]] == ["youtube", "youtube_shorts", "tiktok"]
    assert corpo["destinos"][0]["parametros"]["blocos"] == ["12:00", "18:00"]


def test_put_destino_grava_e_reset_volta(client):
    novo = {
        "blocos": ["17:00", "21:00"],
        "itens_por_bloco": 2,
        "teto_por_dia": 4,
        "intervalo_minimo_min": 60,
        "dias_ativos": [0, 2, 4],
    }

    resposta = client.put("/api/editorial-skills/escalonamento/destinos/youtube_shorts", json=novo)

    assert resposta.status_code == 200
    shorts = resposta.json()["destinos"][1]
    assert shorts["personalizado"] is True
    assert shorts["parametros"] == novo

    volta = client.post("/api/editorial-skills/escalonamento/reset/youtube_shorts")
    assert volta.status_code == 200
    assert volta.json()["destinos"][1]["personalizado"] is False


def test_put_publico_grava_faixas(client):
    faixas = [{"dia": 6, "inicio": 14, "fim": 22, "intensidade": "forte"}]

    resposta = client.put("/api/editorial-skills/escalonamento/publico", json={"faixas": faixas})

    assert resposta.status_code == 200
    assert resposta.json()["faixas"] == faixas
    assert resposta.json()["publico_personalizado"] is True


def test_parametros_invalidos_viram_400_com_a_frase(client):
    ruim = {
        "blocos": ["18:03"],
        "itens_por_bloco": 1,
        "teto_por_dia": 3,
        "intervalo_minimo_min": 180,
        "dias_ativos": [0],
    }

    resposta = client.put("/api/editorial-skills/escalonamento/destinos/tiktok", json=ruim)

    assert resposta.status_code == 400
    assert "5 em 5 minutos" in resposta.json()["detail"]


def test_sugestao_de_blocos(client):
    resposta = client.get("/api/editorial-skills/escalonamento/destinos/youtube/sugestao")

    assert resposta.status_code == 200
    assert resposta.json() == {"blocos": ["15:00", "19:00"]}


def test_prever_agenda_devolve_uma_linha_por_alvo_e_rede(client, monkeypatch):
    async def _prever(alvos, plataformas, *, agora=None):
        return [
            escalonamento_do_lote.LinhaDaAgenda(t, a, p.value, "2030-01-07T16:00", "forte", "")
            for p in plataformas
            for t, a in alvos
        ]

    monkeypatch.setattr(escalonamento_do_lote, "prever", _prever)

    resposta = client.post(
        "/api/shorts/lote/agenda",
        json={"alvos": ["short:s1", "corte:c1"], "plataformas": ["tiktok", "youtube_shorts"]},
    )

    assert resposta.status_code == 200
    itens = resposta.json()["itens"]
    assert [(i["alvo_tipo"], i["alvo_id"], i["plataforma"]) for i in itens] == [
        ("short", "s1", "tiktok"),
        ("corte", "c1", "tiktok"),
        ("short", "s1", "youtube_shorts"),
        ("corte", "c1", "youtube_shorts"),
    ]
    assert itens[0]["agendar_para"] == "2030-01-07T16:00"
    assert itens[0]["intensidade"] == "forte"


def test_prever_agenda_recusa_plataforma_desconhecida(client):
    resposta = client.post(
        "/api/shorts/lote/agenda", json={"alvos": ["short:s1"], "plataformas": ["orkut"]}
    )

    assert resposta.status_code == 404


def test_lote_com_agenda_valida_cada_data_contra_a_sua_rede(client):
    """14:03 serve ao YouTube e não ao TikTok: a recusa é por linha, com a frase."""
    # Dentro do horizonte de 10 dias do TikTok, para a grade ser o único defeito.
    fora_da_grade = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%dT14:03")

    resposta = client.post(
        "/api/shorts/lote",
        json={
            "alvos": ["short:s1"],
            "plataformas": ["tiktok"],
            "agenda": [{"alvo": "short:s1", "plataforma": "tiktok", "agendar_para": fora_da_grade}],
        },
    )

    assert resposta.status_code == 422
    assert "5 em 5 minutos" in resposta.json()["detail"]
