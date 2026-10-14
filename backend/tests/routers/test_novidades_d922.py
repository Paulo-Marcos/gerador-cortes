"""D-922: os endpoints das novidades — listar, traduzir, marcar como vistas.

O repositório (CHANGELOG + changelog.d) e o settings.db moram numa pasta do
teste; a IA é trocada por uma resposta montada a partir do pedido.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from app.core import channel_paths
from app.infrastructure import claude_cli_client
from app.routers import errors, novidades
from fastapi import FastAPI
from fastapi.testclient import TestClient

CHANGELOG = """# Changelog

## [Unreleased]

### Added
- **Spread a batch.** Batch modal (D-908).

## [0.6.0] - 2026-10-07

### Added
- **Covers can star the host.** Canais → "Estilo das capas" (D-909).
"""


@pytest.fixture()
def repo(tmp_path: Path, monkeypatch) -> Path:
    raiz = tmp_path / "repo"
    (raiz / "changelog.d").mkdir(parents=True)
    (raiz / "CHANGELOG.md").write_text(CHANGELOG, encoding="utf-8")
    monkeypatch.setattr(channel_paths, "repo_root", lambda: raiz)
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    return raiz


@pytest.fixture()
def client(repo) -> TestClient:
    app = FastAPI()
    errors.registrar_tratadores(app)
    app.include_router(novidades.router, prefix="/api/novidades")
    return TestClient(app)


@pytest.fixture()
def ia(monkeypatch) -> list[str]:
    """Traduz cada entrada pedida para "PT: <chave>" e guarda os pedidos."""
    pedidos: list[str] = []

    async def gerar(prompt: str, **_kwargs) -> dict:
        pedidos.append(prompt)
        itens = json.loads(prompt.split("Entradas:\n", 1)[1])
        return {
            "traducoes": [
                {
                    "chave": i["chave"],
                    "titulo": f"PT: {i['chave']}",
                    "resumo": "O que mudou.",
                    "como_usar": "Abra Canais.",
                }
                for i in itens
            ]
        }

    monkeypatch.setattr(claude_cli_client, "generate_json", gerar)
    return pedidos


def test_primeira_visita_so_o_que_nao_tem_versao_e_novo(client):
    versoes = client.get("/api/novidades").json()

    assert [v["versao"] for v in versoes] == ["Unreleased", "0.6.0"]
    assert [n["nova"] for n in versoes[0]["novidades"]] == [True]
    assert [n["nova"] for n in versoes[1]["novidades"]] == [False]
    assert versoes[1]["data"] == "2026-10-07"
    assert versoes[1]["novidades"][0]["traducao"] is None
    assert client.get("/api/novidades/resumo").json() == {"novas": 1}


def test_marcar_vistas_apaga_o_ponto_e_fragmento_novo_acende_de_novo(client, repo):
    client.get("/api/novidades")

    assert client.post("/api/novidades/vistas").status_code == 204
    assert client.get("/api/novidades/resumo").json() == {"novas": 0}

    (repo / "changelog.d" / "D-930.fixed.md").write_text("- **Fix.** y (D-930).\n", "utf-8")

    versoes = client.get("/api/novidades").json()
    assert versoes[0]["novidades"][0]["titulo_original"] == "Fix."
    assert versoes[0]["novidades"][0]["nova"] is True
    assert client.get("/api/novidades/resumo").json() == {"novas": 1}


def test_traduzir_grava_e_a_lista_devolve_a_traducao(client, ia):
    resposta = client.post("/api/novidades/traduzir", json={"versao": "0.6.0"})

    assert resposta.json() == {"traduzidas": 1, "pendentes": 0}
    novidade = client.get("/api/novidades").json()[1]["novidades"][0]
    assert novidade["traducao"] == {
        "titulo": f"PT: {novidade['chave']}",
        "resumo": "O que mudou.",
        "como_usar": "Abra Canais.",
    }
    # Já traduzida: o segundo pedido não chama a IA.
    assert client.post("/api/novidades/traduzir", json={"versao": "0.6.0"}).json() == {
        "traduzidas": 0,
        "pendentes": 0,
    }
    assert len(ia) == 1


def test_traduzir_vai_em_lotes(client, repo, ia):
    itens = "".join(f"- **Item {i}.** texto {i}\n" for i in range(11))
    (repo / "CHANGELOG.md").write_text(f"## [0.7.0] - 2026-10-20\n### Added\n{itens}", "utf-8")

    primeira = client.post("/api/novidades/traduzir", json={"versao": "0.7.0"}).json()
    segunda = client.post("/api/novidades/traduzir", json={"versao": "0.7.0"}).json()

    assert primeira == {"traduzidas": 8, "pendentes": 3}
    assert segunda == {"traduzidas": 3, "pendentes": 0}
    assert [len(re.findall('"chave"', p)) for p in ia] == [8 + 1, 3 + 1]


def test_versao_desconhecida_e_404(client):
    assert client.post("/api/novidades/traduzir", json={"versao": "9.9.9"}).status_code == 404


def test_falha_da_ia_vira_502_e_nada_e_gravado(client, monkeypatch):
    async def falhar(*_a, **_k):
        raise claude_cli_client.ClaudeCliError("fora do ar")

    monkeypatch.setattr(claude_cli_client, "generate_json", falhar)

    assert client.post("/api/novidades/traduzir", json={"versao": "0.6.0"}).status_code == 502
    assert client.get("/api/novidades").json()[1]["novidades"][0]["traducao"] is None


def test_sem_changelog_a_lista_e_vazia(client, repo):
    (repo / "CHANGELOG.md").unlink()

    assert client.get("/api/novidades").json() == []
