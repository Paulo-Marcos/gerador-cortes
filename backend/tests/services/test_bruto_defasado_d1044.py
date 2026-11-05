"""D-1044: o bruto ainda reflete os trechos do corte?

Riscar um trecho depois do bruto mudava o líquido na tela e não o vídeo, sem nada
avisar: medido no navegador na D-1019, líquido de 1:14 e vídeo de 68 s.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from app.infrastructure import trechos_do_bruto
from app.services.bruto_defasado import bruto_ficou_para_tras


def _corte(desvios=(), inicio=100.0, fim=200.0, arranjo=None):
    return SimpleNamespace(
        id="c1",
        inicio_seg=inicio,
        fim_seg=fim,
        arranjo_blocos=arranjo,
        desvios=json.dumps(
            [
                {"inicio_hms": i, "fim_hms": f, "motivo": "teste", "origem": "claude"}
                for i, f in desvios
            ]
        ),
    )


PROJETO = SimpleNamespace(duracao_segundos=600)
UM_DESVIO = [("00:02:00.000", "00:02:10.000")]  # 120 s a 130 s


def _bruto(tmp_path: Path, trechos: list[tuple[float, float]]) -> Path:
    bruto = tmp_path / "clip_raw.mkv"
    trechos_do_bruto.gravar(bruto, trechos)
    return bruto


def test_bruto_cortado_com_os_trechos_de_hoje_nao_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 120.0), (130.0, 200.0)])
    assert bruto_ficou_para_tras(_corte(UM_DESVIO), PROJETO, bruto) is False


def test_trecho_tirado_depois_do_bruto_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 200.0)])
    assert bruto_ficou_para_tras(_corte(UM_DESVIO), PROJETO, bruto) is True


def test_trecho_devolvido_depois_do_bruto_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 120.0), (130.0, 200.0)])
    assert bruto_ficou_para_tras(_corte(), PROJETO, bruto) is True


def test_intervalo_mudado_depois_do_bruto_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 200.0)])
    assert bruto_ficou_para_tras(_corte(inicio=105.0), PROJETO, bruto) is True


def test_borda_movida_com_o_mesmo_numero_de_trechos_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 120.0), (130.0, 200.0)])
    desvio = [("00:02:00.000", "00:02:12.000")]
    assert bruto_ficou_para_tras(_corte(desvio), PROJETO, bruto) is True


def test_arredondamento_do_registro_nao_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 120.004), (130.004, 200.0)])
    assert bruto_ficou_para_tras(_corte(UM_DESVIO), PROJETO, bruto) is False


def test_bruto_sem_registro_nao_da_alarme(tmp_path):
    assert bruto_ficou_para_tras(_corte(UM_DESVIO), PROJETO, tmp_path / "clip_raw.mkv") is False


def test_registro_antigo_so_com_duracoes_nao_da_alarme(tmp_path):
    bruto = tmp_path / "clip_raw.mkv"
    trechos_do_bruto.arquivo_do_registro(bruto).write_text(
        json.dumps({"duracoes": [20.0, 70.0]}), encoding="utf-8"
    )
    assert bruto_ficou_para_tras(_corte(UM_DESVIO), PROJETO, bruto) is False


def test_fim_alem_da_duracao_da_live_segue_a_mesma_conta_da_geracao(tmp_path):
    # A geração limita o corte à duração real; sem o mesmo limite aqui, daria falso alarme.
    bruto = _bruto(tmp_path, [(100.0, 150.0)])
    projeto = SimpleNamespace(duracao_segundos=150)
    assert bruto_ficou_para_tras(_corte(), projeto, bruto) is False
