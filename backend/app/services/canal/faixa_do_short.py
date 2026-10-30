"""A faixa de duração dos shorts do canal ativo (D-997).

O shorts-expert propõe candidatos dentro desta faixa, e o domínio descarta o que
sai dela. Vive no `settings.db`, por canal, editável na tela de Canais
(ADR-0012): na D-989, 25 de 28 shorts acima de 90 s foram aceitos pelo operador,
sinal de que o teto fixo não servia a todo canal.
"""

from __future__ import annotations

from pathlib import Path

from app.core import channel_paths
from app.domain.short.shorts import (
    DURACAO_MAX_PADRAO_SEG,
    DURACAO_MIN_PADRAO_SEG,
    FaixaShort,
    faixa_de_duracao_valida,
)
from app.infrastructure import faixa_do_short_store


def _banco_e_canal() -> tuple[Path, str]:
    return channel_paths.settings_db_path(), channel_paths.active_channel_root().name


def ler_faixa() -> dict:
    """O que a tela de Canais mostra; o canal nunca configurado sai com o padrão."""
    gravada = faixa_do_short_store.ler(*_banco_e_canal())
    return {
        "duracao_min_seg": gravada["duracao_min_seg"] if gravada else DURACAO_MIN_PADRAO_SEG,
        "duracao_max_seg": gravada["duracao_max_seg"] if gravada else DURACAO_MAX_PADRAO_SEG,
        "padrao_min_seg": DURACAO_MIN_PADRAO_SEG,
        "padrao_max_seg": DURACAO_MAX_PADRAO_SEG,
    }


def gravar_faixa(duracao_min_seg: float, duracao_max_seg: float) -> dict:
    minimo, maximo = faixa_de_duracao_valida(duracao_min_seg, duracao_max_seg)
    faixa_do_short_store.gravar(*_banco_e_canal(), duracao_min_seg=minimo, duracao_max_seg=maximo)
    return ler_faixa()


def faixa_do_canal(*, quantidade_min: int, quantidade_max: int) -> FaixaShort:
    """A faixa que o shorts-expert recebe: a duração do canal e a quantidade do config."""
    faixa = ler_faixa()
    return FaixaShort(
        duracao_min_seg=faixa["duracao_min_seg"],
        duracao_max_seg=faixa["duracao_max_seg"],
        quantidade_min=quantidade_min,
        quantidade_max=quantidade_max,
    )
