"""D-1027: a emenda é ACHADA no vídeo final, não calculada pela soma das durações.

A D-1017 mediu 8 cortes: o cálculo antigo acusava 25,8% das emendas com som dos
dois lados, contra 1,7% na posição real. Aqui o vídeo final é montado com uma
deriva conhecida (o render alonga o vídeo) e a emenda tem de aparecer onde ela
está de verdade.
"""

from __future__ import annotations

import numpy as np
from app.infrastructure import boletim_midia as m

TAXA = m.TAXA_DO_AUDIO


def _fala(segundos: float, semente: int) -> np.ndarray:
    """Ruído alto e determinístico: cada trecho tem uma 'voz' própria."""
    rng = np.random.default_rng(semente)
    return (rng.standard_normal(int(segundos * TAXA)) * 4000).astype(np.int16)


def _montar(live: np.ndarray, trechos, folgas):
    """O vídeo final: cada trecho da live precedido de uma folga (a deriva do render)."""
    partes = []
    for (inicio, fim), folga in zip(trechos, folgas, strict=True):
        partes.append(_fala(folga, 900 + len(partes)))
        partes.append(live[int(inicio * TAXA) : int(fim * TAXA)])
    return np.concatenate(partes)


def _molde_da(live):
    return lambda inicio, dur: live[int(inicio * TAXA) : int((inicio + dur) * TAXA)]


def test_acha_a_emenda_onde_ela_esta_mesmo_com_deriva_acumulada():
    live = _fala(120.0, 1)
    trechos = [(0.0, 10.0), (30.0, 42.0), (60.0, 75.0)]
    final = _montar(live, trechos, folgas=[0.0, 0.8, 1.1])
    achadas = m.localizar_emendas(final, trechos, _molde_da(live))
    # Posição real: 10,0 e 10,0 + 0,8 + 12,0 = 22,8; a soma das durações daria 22,0,
    # 0,8 s fora, bem mais que a janela de 50 ms em que o boletim mede o som.
    assert achadas == [10.0, 22.8]


def test_molde_mudo_nao_chuta_posicao():
    live = np.zeros(int(60 * TAXA), dtype=np.int16)
    live[: 10 * TAXA] = _fala(10.0, 2)  # o trecho 1 termina em silêncio
    trechos = [(0.0, 20.0), (30.0, 50.0)]
    final = np.concatenate([live[: 20 * TAXA], _fala(20.0, 3)])
    assert m.localizar_emendas(final, trechos, _molde_da(live)) == [None]


def test_molde_que_nao_aparece_no_final_nao_chuta_posicao():
    live = _fala(60.0, 4)
    trechos = [(0.0, 10.0), (30.0, 40.0)]
    final = _fala(20.0, 5)  # nada do que a live tem
    assert m.localizar_emendas(final, trechos, _molde_da(live)) == [None]


def test_uma_emenda_perdida_nao_derruba_a_seguinte():
    live = _fala(120.0, 6)
    live[8 * TAXA : 10 * TAXA] = 0  # o fim do trecho 1 é mudo: não dá para achar
    trechos = [(0.0, 10.0), (30.0, 42.0), (60.0, 75.0)]
    final = _montar(live, trechos, folgas=[0.0, 0.5, 0.5])
    achadas = m.localizar_emendas(final, trechos, _molde_da(live))
    assert achadas[0] is None
    assert achadas[1] == 22.5


def test_um_trecho_so_nao_tem_emenda():
    live = _fala(20.0, 7)
    assert m.localizar_emendas(live, [(0.0, 20.0)], _molde_da(live)) == []
