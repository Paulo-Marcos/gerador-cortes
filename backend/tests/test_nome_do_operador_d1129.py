"""Nome do operador (D-1129, E-069 B-1).

Pedido → teste:
- GET sem nome → test_get_sem_nome_devolve_vazio
- PUT e depois GET → test_put_e_depois_get
- PUT vazio ou só espaços limpa → test_put_vazio_ou_so_espacos_limpa
- tamanho máximo com erro de domínio → test_nome_longo_demais_e_pedido_invalido / test_put_nome_longo_devolve_400
- não vaza entre canais → test_o_nome_e_da_aplicacao_nao_do_canal
"""

from __future__ import annotations

import sqlite3

import pytest
from app.core import channel_paths
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.compartilhado.nome_do_operador import TAMANHO_MAXIMO, normalizar_nome
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def banco(tmp_path, monkeypatch):
    db = tmp_path / "settings.db"
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: db)
    return db


@pytest.fixture
def client(banco):
    return TestClient(app)


def test_get_sem_nome_devolve_vazio(client):
    resposta = client.get("/api/operador")
    assert resposta.status_code == 200
    assert resposta.json() == {"nome": ""}


def test_put_e_depois_get(client):
    assert client.put("/api/operador", json={"nome": "  Paulo "}).json() == {"nome": "Paulo"}
    assert client.get("/api/operador").json() == {"nome": "Paulo"}
    client.put("/api/operador", json={"nome": "Ana"})
    assert client.get("/api/operador").json() == {"nome": "Ana"}


@pytest.mark.parametrize("vazio", ["", "   ", "\t\n"])
def test_put_vazio_ou_so_espacos_limpa(client, vazio):
    client.put("/api/operador", json={"nome": "Paulo"})
    assert client.put("/api/operador", json={"nome": vazio}).json() == {"nome": ""}
    assert client.get("/api/operador").json() == {"nome": ""}


def test_nome_longo_demais_e_pedido_invalido():
    assert normalizar_nome("x" * TAMANHO_MAXIMO) == "x" * TAMANHO_MAXIMO
    with pytest.raises(PedidoInvalido):
        normalizar_nome("x" * (TAMANHO_MAXIMO + 1))


def test_put_nome_longo_devolve_400_e_nao_grava(client):
    client.put("/api/operador", json={"nome": "Paulo"})
    resposta = client.put("/api/operador", json={"nome": "x" * (TAMANHO_MAXIMO + 1)})
    assert resposta.status_code == 400
    assert str(TAMANHO_MAXIMO) in resposta.json()["detail"]
    assert client.get("/api/operador").json() == {"nome": "Paulo"}


def test_o_nome_e_da_aplicacao_nao_do_canal(client, banco, tmp_path, monkeypatch):
    client.put("/api/operador", json={"nome": "Paulo"})
    # Troca o canal ativo: a pessoa é a mesma.
    outro = tmp_path / "instance" / "channels" / "outro"
    outro.mkdir(parents=True)
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: outro)
    assert client.get("/api/operador").json() == {"nome": "Paulo"}
    # A tabela não tem chave de canal.
    conn = sqlite3.connect(banco)
    try:
        colunas = [c[1] for c in conn.execute("PRAGMA table_info(operador)")]
    finally:
        conn.close()
    assert "channel_id" not in colunas
