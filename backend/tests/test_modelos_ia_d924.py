"""Modelos de IA por faixa, configuráveis por canal (D-924).

O pedido: trocar de modelo é só ir na configuração. Então a faixa tem padrão,
a configuração do canal sobrescreve só o que difere, cada provedor lista o que
oferece, e nenhum arquivo do backend volta a escrever o nome de um modelo.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.compartilhado.modelos_ia import (
    PADRAO,
    Faixa,
    completar,
    faixa_de,
    so_o_que_difere,
)
from app.infrastructure import antigravity_cli_client, gemini_client, modelos_ia_store
from app.routers import editorial_skills as router_mod
from app.services.canal import modelos_ia
from fastapi import FastAPI
from fastapi.testclient import TestClient

_CANAL = "canal-teste"
_APP = Path(__file__).resolve().parents[1] / "app"


# --------------------------------------------------------------------------- #
# Domínio
# --------------------------------------------------------------------------- #


def test_o_gemini_de_qualidade_e_o_flash_high_que_substituiu_o_pro():
    """O 3.1 Pro saiu do Antigravity: nenhuma faixa pode apontar para ele."""
    modelos = completar({})

    assert modelos.gemini(Faixa.PESADO) == "gemini-3.8-flash-high"
    assert "gemini-3.1-pro-high" not in PADRAO.values()


def test_completar_ignora_papel_desconhecido_e_valor_vazio():
    modelos = completar({"claude_pesado": " claude-opus-5-5 ", "claude_medio": "", "xpto": "x"})

    assert modelos.claude(Faixa.PESADO) == "claude-opus-5-5"
    assert modelos.claude(Faixa.MEDIO) == PADRAO["claude_medio"]
    assert "xpto" not in modelos.escolhas


def test_so_se_grava_o_que_foge_do_padrao():
    gravar = so_o_que_difere({"claude_pesado": PADRAO["claude_pesado"], "claude_rapido": "x"})

    assert gravar == {"claude_rapido": "x"}


@pytest.mark.parametrize(
    ("legado", "faixa"),
    [
        ("opus", Faixa.PESADO),
        ("claude-opus-5-5", Faixa.PESADO),
        ("sonnet", Faixa.MEDIO),
        ("haiku", Faixa.RAPIDO),
        ("claude-haiku-5-5", Faixa.RAPIDO),
    ],
)
def test_a_familia_do_modelo_legado_diz_a_faixa(legado: str, faixa: Faixa):
    assert faixa_de(None, modelo_legado=legado, padrao=Faixa.MEDIO) is faixa


def test_faixa_gravada_vence_o_modelo_legado_e_sem_nada_vale_o_padrao():
    assert faixa_de("rapido", modelo_legado="opus", padrao=Faixa.MEDIO) is Faixa.RAPIDO
    assert faixa_de(None, padrao=Faixa.MEDIO) is Faixa.MEDIO


# --------------------------------------------------------------------------- #
# Service
# --------------------------------------------------------------------------- #


def test_definir_e_ler_de_volta(tmp_path: Path):
    db = tmp_path / "settings.db"

    modelos_ia.definir_modelos(
        {"gemini_medio": "gemini-3.8-flash-medium"}, db_path=db, channel_id=_CANAL
    )

    lidos = modelos_ia.ler_modelos(db_path=db, channel_id=_CANAL)
    assert lidos.gemini(Faixa.MEDIO) == "gemini-3.8-flash-medium"
    assert lidos.claude(Faixa.PESADO) == PADRAO["claude_pesado"]


def test_valor_vazio_volta_ao_padrao_e_nao_fica_gravado(tmp_path: Path):
    db = tmp_path / "settings.db"
    modelos_ia.definir_modelos({"claude_pesado": "claude-fable-5-1"}, db_path=db, channel_id=_CANAL)

    modelos_ia.definir_modelos({"claude_pesado": ""}, db_path=db, channel_id=_CANAL)

    assert modelos_ia_store.ler(db, _CANAL) == {}


def test_papel_desconhecido_e_recusado(tmp_path: Path):
    with pytest.raises(PedidoInvalido):
        modelos_ia.definir_modelos({"openai": "gpt"}, db_path=tmp_path / "s.db", channel_id=_CANAL)


def test_a_lista_do_gemini_fica_so_com_o_gemini(monkeypatch):
    """O `agy` também roda Claude e GPT; o botão Gemini não."""
    monkeypatch.setattr(
        antigravity_cli_client,
        "listar_modelos",
        lambda: [
            ("gemini-3.8-flash-high", "Gemini 3.8 Flash (High)"),
            ("claude-opus-5-5-high", "Claude Opus 5.5 (High)"),
            ("gpt-oss-120b-medium", "GPT-OSS 120B (Medium)"),
        ],
    )
    monkeypatch.setattr(gemini_client, "listar_modelos", lambda: [])

    disponiveis = modelos_ia.listar_disponiveis()

    assert disponiveis["gemini"] == [("gemini-3.8-flash-high", "Gemini 3.8 Flash (High)")]
    assert ("opus", "Opus (sempre o mais novo)") in disponiveis["claude"]


def test_sem_chave_a_api_do_gemini_lista_vazio_sem_chamar_a_rede(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(gemini_client.settings, "gemini_api_key", "")
    monkeypatch.setattr(gemini_client, "_get_client", lambda: pytest.fail("chamou a API"))

    assert gemini_client.listar_modelos() == []


# --------------------------------------------------------------------------- #
# Router
# --------------------------------------------------------------------------- #


@pytest.fixture()
def client(tmp_path: Path, monkeypatch) -> TestClient:
    canal = tmp_path / _CANAL
    canal.mkdir()
    monkeypatch.setattr(
        modelos_ia.channel_paths, "settings_db_path", lambda: tmp_path / "settings.db"
    )
    monkeypatch.setattr(modelos_ia.channel_paths, "active_channel_root", lambda: canal)
    app = FastAPI()
    app.include_router(router_mod.router, prefix="/editorial-skills")
    return TestClient(app)


def test_get_mostra_os_oito_papeis_com_valor_e_padrao(client: TestClient):
    papeis = client.get("/editorial-skills/modelos-ia").json()["papeis"]

    assert [p["key"] for p in papeis] == list(PADRAO)
    assert all(p["valor"] == p["padrao"] for p in papeis)


def test_put_troca_o_modelo_e_o_get_reflete(client: TestClient):
    resposta = client.put(
        "/editorial-skills/modelos-ia", json={"escolhas": {"claude_rapido": "claude-haiku-5-5"}}
    )

    assert resposta.status_code == 200
    papeis = {p["key"]: p for p in client.get("/editorial-skills/modelos-ia").json()["papeis"]}
    assert papeis["claude_rapido"]["valor"] == "claude-haiku-5-5"


# --------------------------------------------------------------------------- #
# Portão: nome de modelo só na configuração
# --------------------------------------------------------------------------- #

_NOME_DE_MODELO = re.compile(
    r"[\"'](opus|sonnet|haiku|fable|gemini-\d[\w.-]*|claude-(opus|sonnet|haiku|fable)[\w.-]*)[\"']"
)
# Os padrões e o catálogo moram na configuração; a tabela alias → id é a
# tradução da API da Anthropic, não uma escolha de modelo.
_ONDE_PODE = {
    "domain/compartilhado/modelos_ia.py",
    "services/canal/modelos_ia.py",
    "infrastructure/anthropic_api_client.py",
}


def test_nenhum_arquivo_do_backend_escreve_o_nome_de_um_modelo():
    fixos = [
        f"{caminho.relative_to(_APP).as_posix()}:{n}"
        for caminho in _APP.rglob("*.py")
        if caminho.relative_to(_APP).as_posix() not in _ONDE_PODE
        for n, linha in enumerate(caminho.read_text(encoding="utf-8").splitlines(), 1)
        if _NOME_DE_MODELO.search(linha) and ">>>" not in linha
    ]

    assert not fixos, f"Peça o modelo pela faixa (modelos_ia), não pelo nome: {fixos}"
