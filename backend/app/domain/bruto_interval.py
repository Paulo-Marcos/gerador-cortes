"""Cálculo do intervalo [inicio, fim] usado para gerar o vídeo bruto de um corte."""


def calcular_intervalo_bruto(
    inicio_seg: float,
    fim_seg: float,
    duracao_video: float | None,
) -> tuple[float, float]:
    """Retorna o intervalo exato do corte, clipado pela duração total do vídeo quando conhecida.

    O bruto reflete exatamente o intervalo do corte — sem padding. Quando
    ``duracao_video`` é informada, o fim é limitado para não ultrapassar o
    arquivo de origem.

    Exemplo:
        >>> calcular_intervalo_bruto(60.0, 300.0, 600.0)
        (60.0, 300.0)
        >>> calcular_intervalo_bruto(60.0, 700.0, 600.0)
        (60.0, 600.0)
        >>> calcular_intervalo_bruto(60.0, 300.0, None)
        (60.0, 300.0)
    """
    inicio = float(inicio_seg)
    fim = float(fim_seg)
    if duracao_video is not None:
        fim = min(fim, float(duracao_video))
    return inicio, fim
