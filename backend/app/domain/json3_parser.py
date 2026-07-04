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

    Exemplo retorno:
        [{'inicio': '00:00:01.000', 'fim': '00:00:02.000', 'texto': 'Olá mundo'}]
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
        for seg in event.get("segs", []):
            utf8 = seg.get("utf8", "")
            texto_parts.append(utf8)

        texto = "".join(texto_parts).strip()
        # No json3 às vezes a quebra de linha vem literal, normalizamos:
        texto = texto.replace("\n", " ")

        if texto:
            inicio_hms = ms_to_hms(t_start_ms)
            fim_hms = ms_to_hms(t_end_ms)
            segmentos.append({"inicio": inicio_hms, "fim": fim_hms, "texto": texto})

    return segmentos
