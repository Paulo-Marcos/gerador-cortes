"""O portão do npm audit barra alto e crítico, menos as exceções vigentes (D-872)."""

import importlib.util
from datetime import date
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "bin" / "npm_audit_gate.py"
_spec = importlib.util.spec_from_file_location("npm_audit_gate", _SCRIPT)
portao = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(portao)

HOJE = date(2026, 10, 3)
EXCECAO = {"GHSA-aceito": portao.Excecao(motivo="sem correção", rever_em=date(2027, 1, 3))}


def _aviso(ghsa, severidade, nome="pacote"):
    return {
        "name": nome,
        "severity": severidade,
        "title": f"falha em {nome}",
        "url": f"https://github.com/advisories/{ghsa}",
    }


def _relatorio(*avisos):
    """O formato do `npm audit --json`: cada pacote vulnerável e o seu `via`."""
    vulnerabilities = {a["name"]: {"via": [a]} for a in avisos}
    # Dependência que só herda a falha: o `via` traz o nome, não o aviso.
    vulnerabilities["quem-usa"] = {"via": [a["name"] for a in avisos]}
    return {"vulnerabilities": vulnerabilities}


def _barram(relatorio, hoje=HOJE):
    barram, _ = portao.separar(portao.alertas_do_relatorio(relatorio), hoje, EXCECAO)
    return [a.ghsa for a in barram]


def test_alto_sem_excecao_barra():
    assert _barram(_relatorio(_aviso("GHSA-novo", "high"))) == ["GHSA-novo"]


def test_critico_sem_excecao_barra():
    assert _barram(_relatorio(_aviso("GHSA-novo", "critical"))) == ["GHSA-novo"]


def test_moderado_nao_barra():
    assert _barram(_relatorio(_aviso("GHSA-novo", "moderate"))) == []


def test_excecao_vigente_aceita_so_o_proprio_ghsa():
    relatorio = _relatorio(_aviso("GHSA-aceito", "high", "braces"), _aviso("GHSA-novo", "high"))

    barram, aceitos = portao.separar(portao.alertas_do_relatorio(relatorio), HOJE, EXCECAO)

    assert [a.ghsa for a in barram] == ["GHSA-novo"]
    assert [a.ghsa for a in aceitos] == ["GHSA-aceito"]


def test_excecao_vencida_volta_a_barrar():
    relatorio = _relatorio(_aviso("GHSA-aceito", "high"))

    assert _barram(relatorio, hoje=date(2027, 1, 3)) == []
    assert _barram(relatorio, hoje=date(2027, 1, 4)) == ["GHSA-aceito"]


def test_main_sai_1_so_com_alerta_fora_das_excecoes(monkeypatch):
    aceito = next(iter(portao.EXCECOES))
    monkeypatch.setattr(portao, "rodar_npm_audit", lambda: _relatorio(_aviso(aceito, "high")))
    assert portao.main(HOJE) == 0

    monkeypatch.setattr(portao, "rodar_npm_audit", lambda: _relatorio(_aviso("GHSA-novo", "high")))
    assert portao.main(HOJE) == 1


def test_toda_excecao_tem_motivo_e_data_para_rever():
    for ghsa, excecao in portao.EXCECOES.items():
        assert ghsa.startswith("GHSA-")
        assert excecao.motivo.strip()
        assert isinstance(excecao.rever_em, date)
