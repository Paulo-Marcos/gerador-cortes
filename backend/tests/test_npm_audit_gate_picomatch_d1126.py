"""O alerta do picomatch sem versão corrigida fica isento até a data de rever (D-1126).

Mesmo caso do braces na D-872: a exceção compra tempo, não esconde. No dia
seguinte ao `rever_em` o alerta volta a barrar o CI.
"""

import importlib.util
from datetime import date, timedelta
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "bin" / "npm_audit_gate.py"
_spec = importlib.util.spec_from_file_location("npm_audit_gate", _SCRIPT)
portao = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(portao)

PICOMATCH = "GHSA-fc5q-39xc-vjpf"
DIA_DO_ALERTA = date(2026, 11, 17)


def _relatorio_do_picomatch():
    """O que o `npm audit --json` do CI de a7056bfd trouxe, no essencial."""
    aviso = {
        "name": "picomatch",
        "severity": "high",
        "title": "picomatch vulnerable to ReDoS through single-branch repeated extglobs",
        "url": f"https://github.com/advisories/{PICOMATCH}",
    }
    return {
        "vulnerabilities": {
            "picomatch": {"via": [aviso]},
            "micromatch": {"via": ["picomatch"]},
        }
    }


def _barram(hoje):
    barram, _ = portao.separar(portao.alertas_do_relatorio(_relatorio_do_picomatch()), hoje)
    return [a.ghsa for a in barram]


def test_picomatch_tem_excecao_com_motivo_e_data_curta():
    excecao = portao.EXCECOES[PICOMATCH]

    assert "picomatch" in excecao.motivo
    assert excecao.rever_em == date(2027, 1, 3)


def test_picomatch_nao_barra_enquanto_a_excecao_vale():
    rever_em = portao.EXCECOES[PICOMATCH].rever_em

    assert _barram(DIA_DO_ALERTA) == []
    assert _barram(rever_em) == []


def test_picomatch_volta_a_barrar_no_dia_seguinte_ao_rever_em():
    vencida = portao.EXCECOES[PICOMATCH].rever_em + timedelta(days=1)

    assert _barram(vencida) == [PICOMATCH]


def test_main_passa_hoje_e_reprova_depois_de_vencer(monkeypatch):
    monkeypatch.setattr(portao, "rodar_npm_audit", _relatorio_do_picomatch)
    vencida = portao.EXCECOES[PICOMATCH].rever_em + timedelta(days=1)

    assert portao.main(DIA_DO_ALERTA) == 0
    assert portao.main(vencida) == 1
