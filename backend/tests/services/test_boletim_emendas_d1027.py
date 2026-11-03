"""D-1027: o serviço mede as emendas onde elas foram ACHADAS e conta as que não achou."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from app.infrastructure import trechos_do_bruto
from app.services import boletim_tecnico as servico


def _alvo(trechos, fonte, chave="corte:c1"):
    return servico._Alvo(chave, Path("v.mp4"), None, trechos, lambda t: t, None, fonte)


def test_emendas_medidas_nas_posicoes_achadas_e_nao_localizadas_contadas(monkeypatch, tmp_path):
    fonte = tmp_path / "video.mkv"
    fonte.write_bytes(b"x")
    chamadas = {}
    monkeypatch.setattr(
        servico.medicao,
        "localizar_emendas",
        lambda final, trechos, molde: [10.4, None, 33.9],
    )

    def medidas(amostras, instantes):
        chamadas["instantes"] = instantes
        return [(t, -20.0, -20.0, 0.1) for t in instantes]

    monkeypatch.setattr(servico.medicao, "medir_emendas", medidas)
    monkeypatch.setattr(servico.medicao, "p99_do_degrau_da_fala", lambda _a: 0.05)
    trechos = [(0.0, 10.0), (20.0, 30.0), (40.0, 50.0), (60.0, 70.0)]
    r = servico._emendas(_alvo(trechos, fonte), np.zeros(10, dtype=np.int16))
    assert chamadas["instantes"] == [10.4, 33.9]  # a não localizada fica fora da medida
    assert (r["total"], r["nao_localizadas"], r["com_som_dos_dois_lados"]) == (3, 1, 2)


def test_sem_a_live_no_disco_o_boletim_diz_por_que_em_vez_de_medir(tmp_path):
    trechos = [(0.0, 10.0), (20.0, 30.0)]
    assert "live" in servico._aviso_sem_fonte(_alvo(trechos, tmp_path / "nao-existe.mkv"))
    assert "live" in servico._aviso_sem_fonte(_alvo(trechos, None))
    assert "bruto" in servico._aviso_sem_fonte(_alvo(trechos, None, chave="short:s1")).lower()


def test_um_trecho_so_nao_precisa_de_fonte():
    assert servico._aviso_sem_fonte(_alvo([(0.0, 10.0)], None)) is None


def test_registro_guarda_inicio_e_fim_e_registro_antigo_nao_vale(tmp_path):
    bruto = tmp_path / "clip_raw_1.mkv"
    trechos_do_bruto.gravar(bruto, [(5.0, 35.0), (50.0, 90.0)])
    assert trechos_do_bruto.ler_trechos(bruto) == [(5.0, 35.0), (50.0, 90.0)]
    trechos_do_bruto.arquivo_do_registro(bruto).write_text('{"duracoes": [30.0, 40.0]}')
    assert trechos_do_bruto.ler_trechos(bruto) is None
