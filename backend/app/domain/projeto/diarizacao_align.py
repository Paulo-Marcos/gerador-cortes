"""Alinhamento de falantes à transcrição — lógica pura, sem I/O.

A diarização (pyannote) devolve *turnos* anônimos `SPEAKER_00/01/...` com
timestamps. Aqui casamos cada turno com os segmentos da legenda que já existe,
derivamos quem é o dono do canal por heurística de tempo de fala, e resolvemos
o prefixo textual injetado no prompt da IA.

Nada aqui toca banco, HTTP ou pyannote — é tudo função pura e testável.
"""

import json

from app.domain.time_convert import to_seg, to_seg_estrito

# Chaves possíveis para início/fim de um segmento (a transcrição usa HMS em
# `inicio`/`fim`, mas partes do pipeline usam float em `start`/`end`).
_CHAVES_INICIO = ("inicio", "start")
_CHAVES_FIM = ("fim", "end")


def _limites_segmento(seg: dict) -> tuple[float, float]:
    """Extrai (inicio, fim) em segundos de um segmento, tolerando HMS ou float."""
    inicio = to_seg(next((seg[k] for k in _CHAVES_INICIO if k in seg), 0))
    fim = to_seg(next((seg[k] for k in _CHAVES_FIM if k in seg), inicio))
    return inicio, fim


def _falante_dominante(inicio: float, fim: float, turns: list[dict]) -> str | None:
    """Retorna o falante cujo turno mais se sobrepõe à janela [inicio, fim]."""
    melhor_falante: str | None = None
    melhor_overlap = 0.0
    for turno in turns:
        overlap = min(fim, turno["end"]) - max(inicio, turno["start"])
        if overlap > melhor_overlap:
            melhor_overlap = overlap
            melhor_falante = turno["speaker"]
    return melhor_falante if melhor_overlap > 0 else None


def alinhar_falantes(segmentos: list[dict], turns: list[dict]) -> list[dict]:
    """Anota cada segmento com o `speaker` do turno de diarização dominante.

    Segmentos sem sobreposição (ou quando não há turnos) ficam sem o campo
    `speaker` — o consumo downstream trata a ausência como "falante desconhecido".

    Exemplo:
        >>> segs = [{"inicio": "00:00:00", "fim": "00:00:05", "texto": "oi"}]
        >>> turns = [{"start": 0.0, "end": 10.0, "speaker": "SPEAKER_00"}]
        >>> alinhar_falantes(segs, turns)[0]["speaker"]
        'SPEAKER_00'
    """
    resultado = []
    for seg in segmentos:
        novo = dict(seg)
        if turns:
            inicio, fim = _limites_segmento(seg)
            falante = _falante_dominante(inicio, fim, turns)
            if falante:
                novo["speaker"] = falante
        resultado.append(novo)
    return resultado


def rotular_janela(
    segmentos: list[dict],
    turns: list[dict],
    janela_inicio: float,
    janela_fim: float,
) -> list[dict]:
    """Como `alinhar_falantes`, mas rotula SÓ os segmentos dentro da janela.

    Usado pela diarização por corte: a diarização rodou apenas no trecho
    `[janela_inicio, janela_fim]`, então segmentos fora da janela ficam intactos
    (preservando um `speaker` prévio, se houver) e apenas os que se sobrepõem à
    janela recebem o falante dominante.

    Exemplo:
        >>> segs = [
        ...     {"inicio": "00:00:01", "fim": "00:00:04", "texto": "dentro"},
        ...     {"inicio": "00:00:20", "fim": "00:00:24", "texto": "fora"},
        ... ]
        >>> turns = [{"start": 0.0, "end": 10.0, "speaker": "SPEAKER_00"}]
        >>> rotulados = rotular_janela(segs, turns, 0.0, 10.0)
        >>> rotulados[0]["speaker"], "speaker" in rotulados[1]
        ('SPEAKER_00', False)
    """
    resultado = []
    for seg in segmentos:
        novo = dict(seg)
        if turns:
            inicio, fim = _limites_segmento(seg)
            sobrepoe_janela = inicio < janela_fim and fim > janela_inicio
            if sobrepoe_janela:
                falante = _falante_dominante(inicio, fim, turns)
                if falante:
                    novo["speaker"] = falante
        resultado.append(novo)
    return resultado


def heuristica_falante_canal(turns: list[dict]) -> str | None:
    """Elege o dono do canal como o falante com maior tempo total de fala.

    Em vídeos de reação o host domina a duração, então o falante com mais
    segundos acumulados é o palpite inicial para "canal" (o operador pode
    corrigir depois pelo mapa de falantes).

    Exemplo:
        >>> turns = [
        ...     {"start": 0, "end": 30, "speaker": "SPEAKER_00"},
        ...     {"start": 30, "end": 35, "speaker": "SPEAKER_01"},
        ... ]
        >>> heuristica_falante_canal(turns)
        'SPEAKER_00'
    """
    tempos: dict[str, float] = {}
    for turno in turns:
        duracao = max(0.0, turno["end"] - turno["start"])
        tempos[turno["speaker"]] = tempos.get(turno["speaker"], 0.0) + duracao
    if not tempos:
        return None
    return max(tempos, key=lambda falante: tempos[falante])


def montar_mapa_falantes(turns: list[dict]) -> dict[str, dict]:
    """Constrói o mapa `{speaker: {"nome": "", "is_canal": bool}}` da diarização.

    O `nome` nasce vazio (o operador batiza depois); `is_canal` marca o falante
    dominante pela heurística de tempo de fala.
    """
    canal = heuristica_falante_canal(turns)
    mapa: dict[str, dict] = {}
    for turno in turns:
        mapa.setdefault(
            turno["speaker"],
            {"nome": "", "is_canal": turno["speaker"] == canal},
        )
    return mapa


def prefixo_falante(speaker: str | None, mapa: dict[str, dict] | None) -> str:
    """Resolve o prefixo textual do segmento a partir do mapa de falantes.

    Retorna string vazia (sem prefixo) quando não há falante ou mapa — mantendo
    a saída idêntica ao comportamento antigo para transcrições sem diarização.

    Exemplo:
        >>> mapa = {"SPEAKER_00": {"nome": "Pedro", "is_canal": True}}
        >>> prefixo_falante("SPEAKER_00", mapa)
        '[CANAL: Pedro] '
        >>> prefixo_falante("SPEAKER_01", mapa)
        ''
    """
    if not speaker or not mapa:
        return ""
    entrada = mapa.get(speaker)
    if not entrada:
        return ""
    base = "CANAL" if entrada.get("is_canal") else "OUTRO"
    nome = (entrada.get("nome") or "").strip()
    return f"[{base}: {nome}] " if nome else f"[{base}] "


def anotar_falantes_do_projeto(transcricao_bruta: list, transcricao_raw: list) -> list:
    """D-302: reanota o `speaker` nos segmentos do corte a partir da
    transcrição diarizada do projeto.

    A sincronização do corte (`transcricao_corte`) guarda só
    start/end/texto — o rótulo de falante vive na `transcricao_raw`. Os
    segmentos diarizados do projeto funcionam como turnos para
    `alinhar_falantes` (mesmo casamento por sobreposição da ingestão).
    """
    turnos = []
    for seg in transcricao_raw:
        if not isinstance(seg, dict) or not seg.get("speaker"):
            continue
        inicio = to_seg_estrito(seg.get("inicio", seg.get("start", 0)))
        fim = to_seg_estrito(seg.get("fim", seg.get("end", inicio)))
        turnos.append({"start": inicio, "end": fim, "speaker": seg["speaker"]})
    if not turnos:
        return transcricao_bruta
    return alinhar_falantes(transcricao_bruta, turnos)


def mapa_falantes_para_meta(raw: str) -> dict | None:
    """Parse tolerante do `falantes_map` para injetar na meta da análise (D-286).

    Retorna `None` (sem rótulo) quando o projeto não foi diarizado ou o JSON é
    inválido — o formatador então gera o prompt idêntico ao comportamento antigo.
    """
    if not raw or not isinstance(raw, str):
        return None
    try:
        mapa = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return mapa if isinstance(mapa, dict) and mapa else None
