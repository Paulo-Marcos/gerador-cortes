import json


def ms_to_hms(ms: int) -> str:
    s = ms / 1000.0
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = s % 60
    return f"{h:02d}:{m:02d}:{sec:06.3f}"


def parse_json3(json3_content: str, offset_ms: int = 0) -> list[dict]:
    """Converte conteúdo JSON3 bruto em lista de segmentos com timestamps.
    Resolve o problema de repetição (roll-up) do formato VTT para auto-legendas,
    e aplica um offset opcional para corrigir atrasos (PTS) de transmissões ao vivo.

    Além do texto concatenado do evento (com início/fim do evento), preserva o
    timing POR PALAVRA em `palavras`: cada `seg` do json3 traz `tOffsetMs`
    (offset em ms a partir do `tStartMs` do evento), então o tempo absoluto da
    palavra é (tStartMs + tOffsetMs)/1000. É essa borda real que dá precisão ao
    recorte dos trechos, em vez de interpolar por tempo uniforme (D-337).

    Exemplo retorno:
        [{'inicio': '00:00:01.000', 'fim': '00:00:02.000', 'texto': 'Olá mundo',
          'palavras': [{'texto': 'Olá', 'inicio_seg': 1.0},
                       {'texto': 'mundo', 'inicio_seg': 1.2}]}]
    """
    try:
        data = json.loads(json3_content)
    except json.JSONDecodeError:
        return []

    segmentos: list[dict] = []

    for event in data.get("events", []):
        t_start_ms = event.get("tStartMs", 0) + offset_ms
        if t_start_ms < 0:
            t_start_ms = 0

        d_duration_ms = event.get("dDurationMs", 0)
        t_end_ms = t_start_ms + d_duration_ms

        texto_parts = []
        palavras: list[dict] = []
        for seg in event.get("segs", []):
            utf8 = seg.get("utf8", "")
            texto_parts.append(utf8)

            # Timing por palavra: o offset do seg é relativo ao início do evento
            # (a primeira palavra normalmente não traz tOffsetMs → offset 0).
            palavra = utf8.replace("\n", " ").strip()
            if not palavra:
                # Segmentos que são só quebra de linha/espaço não viram palavra.
                continue
            palavra_ms = t_start_ms + seg.get("tOffsetMs", 0)
            palavras.append({"texto": palavra, "inicio_seg": palavra_ms / 1000.0})

        texto = "".join(texto_parts).strip()
        # No json3 às vezes a quebra de linha vem literal, normalizamos:
        texto = texto.replace("\n", " ")

        if texto:
            inicio_hms = ms_to_hms(t_start_ms)
            fim_hms = ms_to_hms(t_end_ms)
            segmento = {"inicio": inicio_hms, "fim": fim_hms, "texto": texto}
            if palavras:
                segmento["palavras"] = palavras
            segmentos.append(segmento)

    return segmentos
