"""Qual capa 9:16 representa o corte na lista de Shorts (D-1170)."""

from collections.abc import Callable, Iterable


def escolher_capa_do_fire(
    dos_prontos: Iterable[str], vertical_do_corte: str, existe: Callable[[str], bool]
) -> str:
    """A primeira capa que ainda existe: a dos shorts prontos, depois a do corte.

    `dos_prontos` vem na ordem do número do short. A reserva é só a capa VERTICAL
    do corte: a 16:9 do YouTube viraria uma faixa fina no quadro 9:16 (D-522).
    Caminho morto conta como ausente, e `""` quer dizer "sem capa".

    >>> escolher_capa_do_fire(["", "b.jpg"], "corte.png", lambda c: True)
    'b.jpg'
    >>> escolher_capa_do_fire([], "corte.png", lambda c: False)
    ''
    """
    return next((c for c in [*dos_prontos, vertical_do_corte] if c and existe(c)), "")
