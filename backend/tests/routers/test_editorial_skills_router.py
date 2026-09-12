"""Testes de integração do endpoint de skills editoriais por canal (E-021).

Monta só o router numa app FastAPI nova e isola o estado (banco + editorial +
channel_id) num `tmp_path`, apontando os resolvedores de `channel_paths` para lá.
Cobre GET (lista as 5 com default+atual), PUT (edita e reflete) e reset.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app import editorial_skills
from app.routers import editorial_skills as router_mod
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path, monkeypatch) -> TestClient:
    canal = tmp_path / "canal-teste"
    (canal / "editorial").mkdir(parents=True)
    monkeypatch.setattr(
        editorial_skills.channel_paths, "settings_db_path", lambda: tmp_path / "settings.db"
    )
    monkeypatch.setattr(editorial_skills.channel_paths, "active_channel_root", lambda: canal)
    monkeypatch.setattr(editorial_skills, "editorial_dir", lambda: canal / "editorial")
    app = FastAPI()
    app.include_router(router_mod.router, prefix="/editorial-skills")
    return TestClient(app)


def test_get_lista_o_catalogo_com_default_e_atual(client: TestClient):
    resp = client.get("/editorial-skills")
    assert resp.status_code == 200
    skills = resp.json()["skills"]
    assert [s["key"] for s in skills] == [
        "cortador-expert",
        "trechos-expert",
        "cenas-expert",
        "metadados-expert",
        "thumbnail-prompt-expert",
        "avaliador-bruto",
        "shorts-expert",
        # D-520: a etiqueta da capa do TikTok entra antes das cenas do short, na
        # ordem do catalogo.
        "capa-tiktok-expert",
        "capa-tiktok-imagem-expert",
        # D-581: o capista da capa do SHORT, vizinho do TikTok e oposto dele num
        # ponto — la a imagem sai sem texto (o sistema desenha por cima), aqui o
        # texto nasce dentro da arte.
        "capa-short-imagem-expert",
        "cenas-short-expert",
        "gancho-short-expert",
        "metadados-short-expert",
    ]
    cortador = skills[0]
    assert set(cortador["params"]) == {"modelo", "thinking_tokens", "timeout"}
    assert "corpo_default" in cortador and "params_default" in cortador
    assert cortador["descricao"]  # explicação funcional presente


def test_put_edita_corpo_e_params_e_reflete(client: TestClient):
    payload = {
        "corpo": "NOVO CORPO DO CANAL",
        "params": {"modelo": "haiku", "thinking_tokens": 4000, "timeout": 90.0},
    }
    resp = client.put("/editorial-skills/cortador-expert", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["corpo"] == "NOVO CORPO DO CANAL"
    assert body["params"]["modelo"] == "haiku"

    # Releitura reflete o persistido.
    depois = client.get("/editorial-skills").json()["skills"][0]
    assert depois["corpo"] == "NOVO CORPO DO CANAL"
    assert depois["params"]["thinking_tokens"] == 4000


def test_put_lentes_por_canal(client: TestClient):
    resp = client.put(
        "/editorial-skills/cortador-expert", json={"lentes": ["Ângulo X", "Ângulo Y"]}
    )
    assert resp.status_code == 200
    assert resp.json()["lentes"] == ["Ângulo X", "Ângulo Y"]


def test_reset_corpo_volta_ao_default(client: TestClient):
    client.put("/editorial-skills/cortador-expert", json={"corpo": "CUSTOMIZADO"})
    resp = client.post("/editorial-skills/cortador-expert/reset", json={"campos": ["corpo"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["corpo"] == body["corpo_default"]
    assert body["corpo"] != "CUSTOMIZADO"


def test_skill_desconhecida_da_404(client: TestClient):
    assert client.put("/editorial-skills/inexistente", json={"corpo": "x"}).status_code == 404


def test_reset_campo_invalido_da_422(client: TestClient):
    resp = client.post("/editorial-skills/cortador-expert/reset", json={"campos": ["xyz"]})
    assert resp.status_code == 422


# --------------------------------------------------------------------------- #
# Histórico de versões (D-312): listar e reverter via HTTP
# --------------------------------------------------------------------------- #


def test_get_versoes_lista_historico_com_resumo(client: TestClient):
    # v1 (seed no GET) + v2 (edição do corpo).
    client.get("/editorial-skills")
    client.put("/editorial-skills/cortador-expert", json={"corpo": "NOVO"})

    resp = client.get("/editorial-skills/cortador-expert/versoes")
    assert resp.status_code == 200
    versoes = resp.json()["versoes"]
    assert [v["versao"] for v in versoes] == [2, 1]
    assert versoes[0]["vigente"] is True
    assert versoes[1]["resumo"] == "Versão inicial"
    assert versoes[0]["mudancas"] == ["corpo"]


def test_post_reverter_volta_ao_conteudo_da_versao(client: TestClient):
    client.get("/editorial-skills")  # seed v1
    client.put("/editorial-skills/cortador-expert", json={"corpo": "CUSTOMIZADO"})  # v2

    resp = client.post("/editorial-skills/cortador-expert/reverter", json={"versao": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert body["corpo"] == body["corpo_default"]  # a v1 é o seed = default do canal
    assert body["corpo"] != "CUSTOMIZADO"

    # Append-only: virou a v3 vigente.
    versoes = client.get("/editorial-skills/cortador-expert/versoes").json()["versoes"]
    assert versoes[0]["versao"] == 3 and versoes[0]["vigente"] is True


def test_reverter_versao_inexistente_da_404(client: TestClient):
    client.get("/editorial-skills")  # seed
    resp = client.post("/editorial-skills/cortador-expert/reverter", json={"versao": 99})
    assert resp.status_code == 404


def test_versoes_de_skill_desconhecida_da_404(client: TestClient):
    assert client.get("/editorial-skills/inexistente/versoes").status_code == 404


# --------------------------------------------------------------------------- #
# Pesos do ranking (D-374): rota de segmento único não pode ser engolida pela
# rota genérica `/{skill_key}` — regressão só aparece com o app montado de
# verdade (ordem de registro do Starlette), não testando a função isolada.
# --------------------------------------------------------------------------- #


def test_put_ranking_pesos_nao_cai_no_404_da_rota_generica(client: TestClient):
    atuais = client.get("/editorial-skills/ranking-pesos").json()["criterios"]
    payload = {c["key"]: c["valor"] for c in atuais if c["eh_peso"]}
    payload["meia_vida_dias"] = next(c["valor"] for c in atuais if not c["eh_peso"])
    payload["views"] = 0.5

    resp = client.put("/editorial-skills/ranking-pesos", json=payload)

    assert resp.status_code == 200
    criterios = {c["key"]: c["valor"] for c in resp.json()["criterios"]}
    assert criterios["views"] == 0.5


def test_get_ranking_pesos_reset_funciona(client: TestClient):
    resp = client.get("/editorial-skills/ranking-pesos/reset")
    assert resp.status_code == 200
    assert "criterios" in resp.json()
