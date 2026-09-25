from app.domain.compartilhado.time_convert import hms_to_seg

# Texto que a ingestão gravava no lugar da transcrição quando o yt-dlp não achava
# legenda (D-444). Não é mais produzido, mas continua no banco dos projetos
# baixados antes da correção — a guarda da análise (D-445) precisa reconhecê-lo.
AVISO_LEGENDA_INDISPONIVEL = "[Legenda automática não disponível para este vídeo]"

_PREFIXO_ERRO_PARSER = "[Erro no parser:"


class TranscricaoIndisponivelError(RuntimeError):
    """O YouTube não entregou legenda utilizável para o vídeo.

    Erro de domínio, não falha técnica: a ingestão o converte em `status=erro`
    com mensagem explicativa em vez de declarar o projeto pronto (D-444).
    """


def dividir_segmentos_longos(
    transcricao: list[dict], max_duracao: float = 4.0, max_palavras: int = 10
) -> list[dict]:
    """
    Divide segmentos de transcrição que sejam muito longos em tempo ou palavras.
    Isso aumenta a granularidade para a IA escolher pontos de corte/cena.
    """

    nova_trans = []

    for item in transcricao:
        texto = item.get("texto", "").strip()
        if not texto:
            continue

        start = _segundos(item.get("start", item.get("inicio", 0)))
        end = _segundos(item.get("end", item.get("fim", start + 1)))
        duracao = end - start

        palavras = texto.split()

        # Se o segmento já é pequeno, mantém
        if duracao <= max_duracao and len(palavras) <= max_palavras:
            nova_trans.append(item)
            continue

        # Preserva o rótulo de falante (D-286) em todas as sub-partes do split.
        falante = item.get("speaker")

        # Timing por palavra (D-337): quando o segmento carrega as bordas reais de
        # cada palavra, corta ali em vez de interpolar por tempo uniforme (que é
        # falso — palavra tem duração variável). Sem `palavras` (dados legados ou
        # vtt), cai no fallback proporcional idêntico ao comportamento anterior.
        palavras_reais = item.get("palavras")
        tem_timing_real = isinstance(palavras_reais, list) and len(palavras_reais) > 0

        if tem_timing_real:
            nova_trans.extend(
                _dividir_por_bordas_reais(palavras_reais, end, max_duracao, max_palavras, falante)
            )
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

            parte = {
                "start": round(p_start, 3),
                "end": round(p_end, 3),
                "inicio": round(p_start, 3),
                "fim": round(p_end, 3),
                "texto": sub_texto,
            }
            if falante:
                parte["speaker"] = falante
            nova_trans.append(parte)

    return nova_trans


def _dividir_por_bordas_reais(
    palavras: list[dict],
    fim_segmento: float,
    max_duracao: float,
    max_palavras: int,
    falante: str | None,
) -> list[dict]:
    """Agrupa `palavras` (cada uma com `inicio_seg` absoluto) em sub-segmentos,
    usando o início real da palavra como borda: o começo de cada parte é o
    `inicio_seg` da sua primeira palavra; o fim é o `inicio_seg` da próxima
    palavra (ou o fim do segmento, na última). Cada sub-parte carrega as suas
    palavras (D-337).
    """
    n = len(palavras)
    duracao = fim_segmento - palavras[0]["inicio_seg"]

    num_partes_tempo = int(duracao // max_duracao) + 1 if duracao > 0 else 1
    num_partes_palavras = int(n // max_palavras) + 1
    num_partes = max(num_partes_tempo, num_partes_palavras)

    palavras_por_parte = max(1, n // num_partes)

    partes: list[dict] = []
    for p_idx in range(num_partes):
        idx_inicio = p_idx * palavras_por_parte
        if idx_inicio >= n:
            break
        # Na última parte (ou quando esgota as palavras) pega o resto.
        if p_idx == num_partes - 1:
            idx_fim = n
        else:
            idx_fim = min((p_idx + 1) * palavras_por_parte, n)

        grupo = palavras[idx_inicio:idx_fim]
        sub_texto = " ".join(p["texto"] for p in grupo).strip()
        if not sub_texto:
            continue

        p_start = grupo[0]["inicio_seg"]
        # Fim = início da próxima palavra (borda real); na última, o fim do segmento.
        if idx_fim < n:
            p_end = palavras[idx_fim]["inicio_seg"]
        else:
            p_end = fim_segmento
        # Não deixa o sub-segmento degenerar (palavras coincidentes ou fim < início).
        if p_end <= p_start:
            p_end = p_start + 0.05

        parte = {
            "start": round(p_start, 3),
            "end": round(p_end, 3),
            "inicio": round(p_start, 3),
            "fim": round(p_end, 3),
            "texto": sub_texto,
            "palavras": grupo,
        }
        if falante:
            parte["speaker"] = falante
        partes.append(parte)

    return partes


def _segundos(valor) -> float:
    """Lê um instante de segmento em qualquer das formas gravadas: número,
    string numérica ou `HH:MM:SS.mmm` (formato dos projetos antigos)."""
    if isinstance(valor, (int, float)):
        return float(valor)
    try:
        return float(valor)
    except (ValueError, TypeError):
        return hms_to_seg(str(valor))


def _e_marcador_de_falha(texto: str) -> bool:
    """O segmento é um aviso gravado pela ingestão no lugar da fala, não fala."""
    limpo = texto.strip()
    return limpo == AVISO_LEGENDA_INDISPONIVEL or limpo.startswith(_PREFIXO_ERRO_PARSER)


# Vídeo curto tem cobertura naturalmente irregular (silêncio, vinheta); só faz
# sentido cobrar proporção de material longo.
_DURACAO_MINIMA_PARA_AFERIR_COBERTURA = 300.0
_COBERTURA_MINIMA = 0.10

_COMO_RESOLVER = (
    "Use 'Refazer transcrição' no projeto para rebaixar as legendas do YouTube "
    "e então rode a análise."
)


def motivo_transcricao_inutilizavel(
    segmentos: list[dict], *, duracao_video_seg: float = 0
) -> str | None:
    """Explica por que a transcrição não dá para analisar — ou `None` se dá.

    A frase volta pronta para o usuário: diz o que está errado E o que fazer.
    Existe porque `if not transcricao_raw` não bastava (D-445): um placeholder
    de legenda indisponível é uma transcrição não-vazia, passava pela guarda e
    só era descoberto pelo modelo, depois de uma chamada paga.

    `duracao_video_seg` é opcional; com ele detectamos também a transcrição
    truncada — legenda que cobre os primeiros segundos de uma live de horas.
    """
    if not segmentos:
        return f"A transcrição está vazia. {_COMO_RESOLVER}"

    if all(_e_marcador_de_falha(seg.get("texto", "")) for seg in segmentos):
        return (
            "A transcrição não existe: o que está gravado é só o aviso de que o YouTube "
            f"não tinha legenda para este vídeo quando ele foi baixado. {_COMO_RESOLVER}"
        )

    if duracao_video_seg > _DURACAO_MINIMA_PARA_AFERIR_COBERTURA:
        fim = max(_segundos(seg.get("end", seg.get("fim", 0))) for seg in segmentos)
        if fim < duracao_video_seg * _COBERTURA_MINIMA:
            return (
                f"A transcrição cobre só {fim / 60:.0f} min de um vídeo de "
                f"{duracao_video_seg / 60:.0f} min — provavelmente veio truncada. "
                f"{_COMO_RESOLVER}"
            )

    return None


def limpar_e_ordenar_transcricao(transcricao: list[dict]) -> list[dict]:
    """
    Garante que a transcrição esteja:
    1. Ordenada cronologicamente pelo tempo de início.
    2. Sem sobreposições (ajusta o fim do segmento anterior se necessário).
    3. Sem segmentos duplicados ou vazios.
    """
    if not transcricao:
        return []

    # 1. Normaliza e Ordena
    normalizada = []
    for item in transcricao:
        inicio = _segundos(item.get("start", item.get("inicio", 0)))
        fim = _segundos(item.get("end", item.get("fim", inicio + 0.1)))
        texto = item.get("texto", item.get("text", "")).strip()
        if texto:
            seg = {"start": inicio, "end": max(inicio + 0.05, fim), "texto": texto}
            # Preserva o rótulo de falante (D-286) ao reconstruir o dict.
            if item.get("speaker"):
                seg["speaker"] = item["speaker"]
            # Preserva o timing por palavra (D-337) para chegar à granularização.
            if item.get("palavras"):
                seg["palavras"] = item["palavras"]
            normalizada.append(seg)

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
