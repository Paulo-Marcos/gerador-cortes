"""D-911: os endpoints dos componentes do palco por canal.

Monta só o router de canais numa app nova, com a instância, o banco de settings,
as pastas de assets e o cache do palco redirecionados para o `tmp_path` — os
endpoints exercitam o filesystem inteiro sem tocar o `instance/` real.
"""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from app.core import channel_paths
from app.infrastructure import channel_assets_sync
from app.routers import channels as channels_router
from app.routers.errors import registrar_tratadores
from app.services import channels as svc
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image


def _png(cor: str = "red") -> bytes:
    saida = io.BytesIO()
    Image.new("RGB", (4, 4), cor).save(saida, format="PNG")
    return saida.getvalue()


MINHA = _png()

EXEMPLO_YAML = """config_version: 1
handle: "@seucanal"
nome: "Seu Canal"
credito: "@seucanal"
"""


@pytest.fixture()
def client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setattr(svc, "_REPO_ROOT", tmp_path)
    canal = tmp_path / "instance" / "channels" / "default"
    canal.mkdir(parents=True)
    (canal / "channel.yaml").write_text(EXEMPLO_YAML, encoding="utf-8")
    (tmp_path / "instance" / "active-channel").write_text("default\n", encoding="utf-8")

    mascote = tmp_path / "mascote"
    mascote.mkdir()
    (mascote / "apresentador.png").write_bytes(b"POSE")
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(channel_paths, "palco_assets_dir", lambda: canal / "assets" / "palco")
    monkeypatch.setattr(channel_paths, "palco_cache_dir", lambda: tmp_path / "_palco_cache")
    monkeypatch.setattr(channel_paths, "mascot_pngs_dir", lambda: mascote)
    monkeypatch.setattr(channel_assets_sync, "RENDERER_PUBLIC", tmp_path / "renderer" / "public")

    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(channels_router.router, prefix="/api/channels")
    return TestClient(app)


def test_get_devolve_o_padrao_com_a_identidade_herdada(client: TestClient):
    resp = client.get("/api/channels/default/palco")
    assert resp.status_code == 200
    body = resp.json()
    assert body["estilo"] == "atual"
    assert body["estilos"] == ["atual", "limpo"]
    assert body["fundo"] == "reticula-aurora"
    assert "linho" in body["fundos"]
    assert body["cabecalho"]["nome"] == ""
    assert body["cabecalho"]["nome_efetivo"] == "Seu Canal"
    assert body["cabecalho"]["handle_efetivo"] == "@seucanal"
    assert body["cabecalho"]["imagem"] == ""
    assert body["cabecalho"]["imagem_url"].startswith("/api/channels/default/palco/imagem?v=")
    assert body["placa"]["ativo"] is True


def test_put_edita_parcialmente(client: TestClient):
    resp = client.put(
        "/api/channels/default/palco",
        json={"estilo": "limpo", "cabecalho": {"nome": "Pedro", "handle": "pedroivosa"}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["estilo"] == "limpo"
    assert body["cabecalho"]["nome_efetivo"] == "Pedro"
    assert body["cabecalho"]["handle_efetivo"] == "@pedroivosa"

    resp = client.put("/api/channels/default/palco", json={"placa": {"ativo": False}})
    body = resp.json()
    assert body["estilo"] == "limpo"
    assert body["placa"]["ativo"] is False


def test_put_troca_o_fundo(client: TestClient):
    resp = client.put("/api/channels/default/palco", json={"fundo": "aurora"})
    assert resp.status_code == 200
    assert resp.json()["fundo"] == "aurora"
    assert client.put("/api/channels/default/palco", json={"fundo": "neon"}).status_code == 422


def test_put_estilo_desconhecido_e_422(client: TestClient):
    resp = client.put("/api/channels/default/palco", json={"estilo": "neon"})
    assert resp.status_code == 422


def test_canal_inexistente_e_404(client: TestClient):
    assert client.get("/api/channels/nao-existe/palco").status_code == 404
    assert client.put("/api/channels/nao-existe/palco", json={}).status_code == 404


def test_imagem_padrao_e_o_mascote(client: TestClient):
    resp = client.get("/api/channels/default/palco/imagem")
    assert resp.status_code == 200
    assert resp.content == b"POSE"


def test_enviar_e_remover_a_imagem_do_cabecalho(client: TestClient, tmp_path: Path):
    resp = client.post(
        "/api/channels/default/palco/imagem",
        files={"arquivo": ("logo.png", MINHA, "image/png")},
    )
    assert resp.status_code == 200
    assert resp.json()["cabecalho"]["imagem"] == "cabecalho.png"
    assert client.get("/api/channels/default/palco/imagem").content == MINHA
    assert (tmp_path / "renderer" / "public" / "palco" / "cabecalho.png").read_bytes() == MINHA

    resp = client.delete("/api/channels/default/palco/imagem")
    assert resp.status_code == 200
    assert resp.json()["cabecalho"]["imagem"] == ""
    assert client.get("/api/channels/default/palco/imagem").content == b"POSE"


def test_imagem_em_formato_recusado_e_400(client: TestClient):
    resp = client.post(
        "/api/channels/default/palco/imagem",
        files={"arquivo": ("logo.gif", b"GIF", "image/gif")},
    )
    assert resp.status_code == 400


def test_arquivo_que_nao_e_imagem_e_400_e_nao_grava(client: TestClient, tmp_path: Path):
    resp = client.post(
        "/api/channels/default/palco/imagem",
        files={"arquivo": ("logo.png", b"<script>nada de imagem</script>", "image/png")},
    )
    assert resp.status_code == 400
    assert not (tmp_path / "instance" / "channels" / "default" / "assets" / "palco").exists()


def test_canal_que_nao_e_o_ativo_e_409_e_nao_mexe_no_ativo(client: TestClient, tmp_path: Path):
    outro = tmp_path / "instance" / "channels" / "outro"
    outro.mkdir()
    (outro / "channel.yaml").write_text(EXEMPLO_YAML, encoding="utf-8")
    client.post(
        "/api/channels/default/palco/imagem",
        files={"arquivo": ("logo.png", MINHA, "image/png")},
    )

    assert client.get("/api/channels/outro/palco").status_code == 409
    assert client.put("/api/channels/outro/palco", json={"estilo": "limpo"}).status_code == 409
    resp = client.post(
        "/api/channels/outro/palco/imagem",
        files={"arquivo": ("logo.png", _png("blue"), "image/png")},
    )
    assert resp.status_code == 409
    # O cabeçalho do ativo continua o dele.
    assert client.get("/api/channels/default/palco/imagem").content == MINHA
    assert client.get("/api/channels/default/palco").json()["estilo"] == "atual"


def test_put_escolhe_eco_e_legenda_com_sombra(client: TestClient):
    resp = client.put(
        "/api/channels/default/palco",
        json={"fundo_short": "eco", "estilo_da_legenda": "sombra"},
    )
    assert resp.status_code == 200
    corpo = resp.json()
    assert (corpo["fundo_short"], corpo["estilo_da_legenda"]) == ("eco", "sombra")
    assert corpo["fundos_do_short"] == ["palco", "eco"]
    assert corpo["estilos_da_legenda"] == ["contorno", "sombra"]
    assert (
        client.put("/api/channels/default/palco", json={"fundo_short": "neon"}).status_code == 422
    )


def test_put_esconde_tipos_e_ajusta_os_cards_d916(client: TestClient):
    resp = client.put(
        "/api/channels/default/palco",
        json={
            "cards": {
                "ocultos": ["pergunta_chat"],
                "escala": 1.2,
                "posicao": {"automatica": False, "x": 1300, "y": 90},
            }
        },
    )
    assert resp.status_code == 200
    corpo = resp.json()
    assert corpo["cards"]["ocultos"] == ["pergunta_chat"]
    assert corpo["cards"]["posicao"] == {"automatica": False, "x": 1300, "y": 90}
    assert {"id": "pergunta_chat", "nome": "Pergunta do chat"} in corpo["tipos_de_cena"]
    recusado = client.put("/api/channels/default/palco", json={"cards": {"ocultos": ["neon"]}})
    assert recusado.status_code == 400


def test_palco_do_escopo_troca_so_o_corte_do_tipo_d923(client: TestClient):
    url = "/api/channels/default/palco/do-escopo"
    consulta = {"projeto_id": "p1", "corte_id": "c1", "tipo": "horizontal"}
    assert client.get(url, params=consulta).json()["origem"] == "canal"
    corpo = {"escopo": "corte", "projeto_id": "p1", "corte_id": "c1", "tipo": "horizontal"}
    so_imagem = {"estilo": "limpo", "cabecalho": {"mostrar_nome": False, "mostrar_handle": False}}
    resp = client.put(url, json={**corpo, "componentes": so_imagem})
    assert resp.status_code == 200
    efetivo = resp.json()["efetivo"]
    assert (efetivo["estilo"], resp.json()["origem"]) == ("limpo", "corte")
    assert efetivo["cabecalho"]["mostrar_nome"] is False
    assert efetivo["cabecalho"]["nome_efetivo"] == "Seu Canal"
    assert client.get(url, params={**consulta, "tipo": "short"}).json()["origem"] == "canal"
    assert client.get("/api/channels/default/palco").json()["estilo"] == "atual"
    volta = client.put(url, json={**corpo, "componentes": None})
    assert volta.json()["origem"] == "canal"
    sem_corte = client.put(url, json={**corpo, "corte_id": None, "componentes": so_imagem})
    assert sem_corte.status_code == 422
