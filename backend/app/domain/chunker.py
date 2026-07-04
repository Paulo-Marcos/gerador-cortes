def fatiar_transcricao(
    transcricao: list[dict],
    chunk_tamanho_seg: float = 2400.0,
    overlap_seg: float = 300.0,
    min_last_chunk_seg: float = 1200.0,
) -> list[list[dict]]:
    """
    Fatia a transcrição em blocos de tempo menores.

    :param transcricao: Lista de segmentos de legenda (com "inicio" e "fim")
    :param chunk_tamanho_seg: Tamanho ideal de cada bloco (ex: 2400s = 40min)
    :param overlap_seg: Tempo de sobreposição entre blocos para não perder contexto (ex: 300s = 5min)
    :param min_last_chunk_seg: Se o tempo restante for menor que isso, anexa ao chunk atual.
    :return: Lista de listas de segmentos de legenda
    """
    if not transcricao:
        return []

    from app.domain.time_convert import to_seg

    # Pega o primeiro e o último timestamp
    primeiro_seg = None
    ultimo_seg = None

    for seg in transcricao:
        t_inicio = to_seg(seg.get("inicio") or seg.get("start"))
        t_fim = to_seg(seg.get("fim") or seg.get("end"))

        if primeiro_seg is None or t_inicio < primeiro_seg:
            primeiro_seg = t_inicio
        if ultimo_seg is None or t_fim > ultimo_seg:
            ultimo_seg = t_fim

    if primeiro_seg is None or ultimo_seg is None:
        return [transcricao]

    chunks = []
    cursor_inicio = primeiro_seg

    while cursor_inicio < ultimo_seg - 0.1:
        cursor_fim = cursor_inicio + chunk_tamanho_seg

        # Se o que sobrar depois deste chunk for menor que o limite (20min),
        # esticamos este chunk até o fim.
        tempo_restante = ultimo_seg - cursor_fim
        if tempo_restante < min_last_chunk_seg:
            cursor_fim = ultimo_seg + 1.0  # Garante pegar tudo

        chunk_atual = []
        for seg in transcricao:
            t_ini = to_seg(seg.get("inicio") or seg.get("start"))
            if cursor_inicio <= t_ini < cursor_fim:
                chunk_atual.append(seg)

        if chunk_atual:
            chunks.append(chunk_atual)

        if cursor_fim >= ultimo_seg:
            break

        cursor_inicio = cursor_fim - overlap_seg

    return [c for c in chunks if c]
