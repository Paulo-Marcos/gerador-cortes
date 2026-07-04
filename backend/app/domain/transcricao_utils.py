from app.domain.time_convert import hms_to_seg


def dividir_segmentos_longos(
    transcricao: list[dict], max_duracao: float = 4.0, max_palavras: int = 10
) -> list[dict]:
    """
    Divide segmentos de transcrição que sejam muito longos em tempo ou palavras.
    Isso aumenta a granularidade para a IA escolher pontos de corte/cena.
    """

    def _to_seg(val) -> float:
        if isinstance(val, (int, float)):
            return float(val)
        try:
            return float(val)
        except (ValueError, TypeError):
            return hms_to_seg(str(val))

    nova_trans = []

    for item in transcricao:
        texto = item.get("texto", "").strip()
        if not texto:
            continue

        start = _to_seg(item.get("start", item.get("inicio", 0)))
        end = _to_seg(item.get("end", item.get("fim", start + 1)))
        duracao = end - start

        palavras = texto.split()

        # Se o segmento já é pequeno, mantém
        if duracao <= max_duracao and len(palavras) <= max_palavras:
            nova_trans.append(item)
            continue

        # Caso contrário, divide proporcionalmente
        num_partes_tempo = int(duracao // max_duracao) + 1
        num_partes_palavras = int(len(palavras) // max_palavras) + 1
        num_partes = max(num_partes_tempo, num_partes_palavras)

        # Divide as palavras em partes iguais
        palavras_por_parte = len(palavras) // num_partes
        if palavras_por_parte == 0:
            palavras_por_parte = 1

        duracao_por_parte = duracao / num_partes

        for p_idx in range(num_partes):
            idx_inicio = p_idx * palavras_por_parte
            # Na última parte pega o resto
            if p_idx == num_partes - 1:
                idx_fim = len(palavras)
            else:
                idx_fim = (p_idx + 1) * palavras_por_parte

            sub_texto = " ".join(palavras[idx_inicio:idx_fim])
            if not sub_texto:
                continue

            p_start = start + (p_idx * duracao_por_parte)
            p_end = start + ((p_idx + 1) * duracao_por_parte)

            # Garante que não ultrapasse o fim original
            p_end = min(p_end, end)

            nova_trans.append(
                {
                    "start": round(p_start, 3),
                    "end": round(p_end, 3),
                    "inicio": round(p_start, 3),
                    "fim": round(p_end, 3),
                    "texto": sub_texto,
                }
            )

    return nova_trans


def limpar_e_ordenar_transcricao(transcricao: list[dict]) -> list[dict]:
    """
    Garante que a transcrição esteja:
    1. Ordenada cronologicamente pelo tempo de início.
    2. Sem sobreposições (ajusta o fim do segmento anterior se necessário).
    3. Sem segmentos duplicados ou vazios.
    """
    if not transcricao:
        return []

    def _to_seg(val) -> float:
        if isinstance(val, (int, float)):
            return float(val)
        try:
            return float(val)
        except (ValueError, TypeError):
            return hms_to_seg(str(val))

    # 1. Normaliza e Ordena
    normalizada = []
    for item in transcricao:
        inicio = _to_seg(item.get("start", item.get("inicio", 0)))
        fim = _to_seg(item.get("end", item.get("fim", inicio + 0.1)))
        texto = item.get("texto", item.get("text", "")).strip()
        if texto:
            normalizada.append({"start": inicio, "end": max(inicio + 0.05, fim), "texto": texto})

    # Ordenação estável por início
    normalizada.sort(key=lambda x: x["start"])

    # 2. Corrige sobreposições
    limpa = []
    for i in range(len(normalizada)):
        curr = normalizada[i].copy()

        if i < len(normalizada) - 1:
            proximo_inicio = normalizada[i + 1]["start"]
            # Se este segmento termina depois que o próximo começa, truncamos ele
            if curr["end"] > proximo_inicio:
                curr["end"] = proximo_inicio

        # Se após o truncamento o segmento ainda for válido, adicionamos
        if curr["end"] > curr["start"]:
            # Adiciona hms para compatibilidade legada se necessário (opcional)
            limpa.append(curr)

    return limpa
