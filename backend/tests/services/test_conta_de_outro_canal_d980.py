"""Sem conta gravada, a conta que já é de outro canal barra (RN-31, D-980).

Achado da auditoria do #250: aprender no 1º envio não cobria o token único do
Instagram no `.env`, nem o login do canal A feito na janela do canal B antes
do primeiro envio — o segundo canal aprenderia a conta do primeiro.
"""

import pytest
from app.core import channel_paths
from app.domain.publicacao.conta_do_destino import Conta, ContaDivergente, ContaIlegivel, conferir
from app.services import conta_do_destino


@pytest.fixture
def canal(monkeypatch, tmp_path):
    raiz = {"canal": tmp_path / "canal-a"}
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: raiz["canal"])
    return raiz


def _conta_gravada(destino: str) -> str:
    linha = next(c for c in conta_do_destino.contas_do_canal() if c["destino"] == destino)
    return linha["conta_id"]


def test_a_regra_nao_aprende_a_conta_de_outro_canal():
    with pytest.raises(ContaDivergente, match="canal canal-a"):
        conferir("instagram", None, Conta("1784", "@a"), dono_da_logada="canal-a")


def test_o_segundo_canal_nao_aprende_a_conta_do_primeiro(canal, tmp_path):
    conta_do_destino.conferir_conta("instagram", Conta("1784", "@canal-a"))
    canal["canal"] = tmp_path / "canal-b"

    with pytest.raises(ContaDivergente, match="canal canal-a"):
        conta_do_destino.conferir_conta("instagram", Conta("1784", "@canal-a"))
    assert _conta_gravada("instagram") == ""


def test_esquecida_no_primeiro_canal_o_segundo_pode_aprender(canal, tmp_path):
    """Passar a conta de um canal para outro é esquecer lá e enviar daqui."""
    conta_do_destino.conferir_conta("tiktok", Conta("71"))
    conta_do_destino.esquecer_conta("tiktok")
    canal["canal"] = tmp_path / "canal-b"

    conta_do_destino.conferir_conta("tiktok", Conta("71"))

    assert _conta_gravada("tiktok") == "71"


def test_conta_ilegivel_diz_para_entrar_na_janela_do_robo():
    """O passo de sessão dizia "faça login na janela"; a conferência, que agora
    chega antes dele, diz o mesmo."""
    with pytest.raises(ContaIlegivel, match="pedir login"):
        conferir("tiktok", None, Conta(""))
