"""D-1027: a busca da emenda parte da posição da emenda anterior, e não da soma."""

from __future__ import annotations

import numpy as np
from app.infrastructure import boletim_midia as m

TAXA = m.TAXA_DO_AUDIO


def _fala(segundos: float, semente: int) -> np.ndarray:
    rng = np.random.default_rng(semente)
    return (rng.standard_normal(int(segundos * TAXA)) * 4000).astype(np.int16)


def test_a_deriva_se_acumula_e_a_busca_acompanha_ela():
    # 1,5 s a mais por trecho: na 3ª emenda o erro da soma (3 s) passa da janela de
    # busca (2 s). Só acha quem parte da posição da emenda anterior.
    live = _fala(200.0, 8)
    trechos = [(0.0, 10.0), (30.0, 40.0), (60.0, 70.0), (90.0, 100.0)]
    partes = []
    for i, (inicio, fim) in enumerate(trechos):
        partes.append(_fala(1.5 if i else 0.0, 900 + i))
        partes.append(live[int(inicio * TAXA) : int(fim * TAXA)])
    final = np.concatenate(partes)

    def molde(inicio, duracao):
        return live[int(inicio * TAXA) : int((inicio + duracao) * TAXA)]

    assert m.localizar_emendas(final, trechos, molde) == [10.0, 21.5, 33.0]
