"""Calculadora de segmentos — lógica pura para remoção de desvios de uma timeline."""

from app.domain.time_convert import hms_to_seg, seg_to_hms

# Motivos que indicam desvios editoriais vindos da IA (n8n ou importação manual).
# Estes NÃO devem ser removidos no "gerar bruto" — apenas no pipeline completo.
_PREFIXOS_EDITORIAIS = ("[REPETICAO]", "[DESVIO]")


def eh_desvio_tecnico(desvio: dict) -> bool:
    """Retorna True se o desvio é técnico (silêncio FFmpeg), False se é editorial (IA).

    Exemplo:
        >>> eh_desvio_tecnico({"motivo": "Silêncio Detectado (IA/Técnico)"})
        True
        >>> eh_desvio_tecnico({"motivo": "[REPETICAO] O locutor repete..."})
        False
    """
    motivo = desvio.get("motivo", "")
    if motivo.startswith(tuple(_PREFIXOS_EDITORIAIS)):
        return False
    return True


def filtrar_desvios_tecnicos(desvios: list[dict]) -> list[dict]:
    """Filtra apenas desvios técnicos (silêncios), excluindo editoriais (IA manual).

    Exemplo:
        >>> filtrar_desvios_tecnicos([
        ...     {"motivo": "Silêncio Detectado (IA/Técnico)"},
        ...     {"motivo": "[REPETICAO] Repete demais"},
        ... ])
        [{'motivo': 'Silêncio Detectado (IA/Técnico)'}]
    """
    return [d for d in desvios if eh_desvio_tecnico(d)]


def _hms_or_float(val: str) -> float:
    """Converte string que pode ser HMS ('HH:MM:SS') ou número ('330.5') para float."""
    if not val:
        return 0.0
    s = str(val).strip()
    if ":" in s:
        return hms_to_seg(s)
    try:
        return float(s)
    except ValueError:
        return 0.0


def normalizar_desvio(d: dict) -> dict:
    """Garante que o desvio tem inicio_seg, fim_seg, inicio_hms e fim_hms.

    Cobre todas as variações de campo retornadas por n8n ou IA externa:
    - inicio_hms / fim_hms (string HH:MM:SS — fonte primária, sempre confiável)
    - inicio / fim         (string HMS ou float — formato n8n)
    - inicio_seg / fim_seg (segundos float — fallback; pode estar desatualizado/0.0)

    Prioridade: inicio_hms -> inicio -> inicio_seg.
    Sobrescreve sempre (não usa setdefault) para corrigir valores 0.0 stale
    que versões anteriores do código possam ter gravado incorretamente.
    """
    result = dict(d)

    for campo_hms, campo_alt, campo_seg in (
        ("inicio_hms", "inicio", "inicio_seg"),
        ("fim_hms", "fim", "fim_seg"),
    ):
        raw = next(
            (
                result[k]
                for k in (campo_hms, campo_alt, campo_seg)
                if result.get(k) is not None and result.get(k) != ""
            ),
            None,
        )
        if raw is None:
            continue
        seg = _hms_or_float(str(raw)) if isinstance(raw, str) else float(raw)
        result[campo_seg] = seg
        result[campo_hms] = seg_to_hms(seg)

    return result


def _desvio_seg(desvio: dict, campo_seg: str, campo_hms: str) -> float:
    """Retorna o valor em segundos do desvio, com fallback de HMS para compatibilidade com dados legados."""
    if desvio.get(campo_seg) is not None:
        return float(desvio[campo_seg])
    hms = desvio.get(campo_hms, "")
    return hms_to_seg(hms) if hms else 0.0


def mesclar_desvios_sobrepostos(desvios: list[dict]) -> list[dict]:
    """Mescla desvios que se sobrepõem em intervalos atômicos não-sobrepostos.

    Dois desvios sobrepostos viram um único desvio cobrindo `[min_ini, max_fim]`.
    O motivo do desvio resultante é o do primeiro desvio (em ordem cronológica)
    com um sufixo " + N sobrepostos" quando houver mescla.

    Usar isso ANTES de `calcular_segmentos` é semanticamente idêntico (a função
    já trata sobreposições via cursor), mas:
    - Deixa o pipeline mais legível (segmentos vêm de desvios canônicos)
    - Reduz o número de logs / debug noise quando há muitos desvios redundantes
    - Permite contar quantos blocos atômicos de remoção existem

    Exemplo:
        >>> mesclar_desvios_sobrepostos([
        ...     {"inicio_seg": 10, "fim_seg": 30, "motivo": "A"},
        ...     {"inicio_seg": 20, "fim_seg": 40, "motivo": "B"},
        ... ])  # doctest: +ELLIPSIS
        [{'inicio_seg': 10, 'fim_seg': 40, ...}]
    """
    if not desvios:
        return []

    normalizados = []
    for d in desvios:
        ini = _desvio_seg(d, "inicio_seg", "inicio_hms")
        fim = _desvio_seg(d, "fim_seg", "fim_hms")
        if fim <= ini:
            continue
        normalizados.append(
            {
                "inicio_seg": round(ini, 3),
                "fim_seg": round(fim, 3),
                "motivo": d.get("motivo", ""),
            }
        )

    if not normalizados:
        return []

    normalizados.sort(key=lambda d: d["inicio_seg"])

    mesclados: list[dict] = []
    atual = dict(normalizados[0])
    atual["_count"] = 1
    for d in normalizados[1:]:
        if d["inicio_seg"] <= atual["fim_seg"]:
            # Sobreposição (ou adjacência exata): expande o intervalo
            if d["fim_seg"] > atual["fim_seg"]:
                atual["fim_seg"] = d["fim_seg"]
            atual["_count"] += 1
        else:
            mesclados.append(atual)
            atual = dict(d)
            atual["_count"] = 1
    mesclados.append(atual)

    for m in mesclados:
        count = m.pop("_count", 1)
        if count > 1:
            m["motivo"] = f"{m.get('motivo', '').strip()} + {count - 1} sobrepostos"
        m["inicio_hms"] = seg_to_hms(m["inicio_seg"])
        m["fim_hms"] = seg_to_hms(m["fim_seg"])

    return mesclados


def calcular_segmentos(inicio: float, fim: float, desvios: list[dict]) -> list[dict]:
    """Retorna intervalos {"start": s, "end": f} após remover desvios do range [inicio, fim].

    Desvios fora do intervalo ou com coordenadas inválidas são ignorados.
    Aplica um threshold defensivo de 0.1s para evitar micro-segmentos que causam
    drift na transcrição e erros no FFmpeg.

    Exemplo:
        >>> calcular_segmentos(0, 100, [{"inicio_seg": 30, "fim_seg": 40}])
        [{'start': 0.0, 'end': 30.0}, {'start': 40.0, 'end': 100.0}]
    """
    segmentos: list[dict] = []
    cursor = inicio

    # Ordena desvios pelo tempo de início para processamento sequencial correto
    desvios_ordenados = sorted(desvios, key=lambda d: _desvio_seg(d, "inicio_seg", "inicio_hms"))

    for desvio in desvios_ordenados:
        d_ini = _desvio_seg(desvio, "inicio_seg", "inicio_hms")
        d_fim = _desvio_seg(desvio, "fim_seg", "fim_hms")

        # Clipa ao cursor atual (não ao inicio fixo) para lidar com desvios
        # que começam antes do cursor (sobreposições ou timestamps do início do corte)
        d_ini = max(d_ini, cursor)
        d_fim = min(d_fim, fim)

        if d_fim <= d_ini:
            continue  # desvio já foi superado ou é inválido

        if d_ini > cursor:
            # Threshold de 0.1s para evitar micro-fatias instáveis
            if d_ini - cursor > 0.1:
                segmentos.append({"start": round(cursor, 3), "end": round(d_ini, 3)})

        cursor = d_fim

    # Segmento final (depois do último desvio)
    if cursor < fim and (fim - cursor) > 0.1:
        segmentos.append({"start": round(cursor, 3), "end": round(fim, 3)})

    return segmentos if segmentos else [{"start": round(inicio, 3), "end": round(fim, 3)}]


def _desvio_com_tempos(desvio: dict, ini: float, fim: float) -> dict:
    """Clona o desvio com novos limites, preservando motivo/origem e demais campos."""
    novo = dict(desvio)
    ini_r = round(ini, 3)
    fim_r = round(fim, 3)
    novo["inicio_seg"] = ini_r
    novo["fim_seg"] = fim_r
    novo["inicio_hms"] = seg_to_hms(ini_r)
    novo["fim_hms"] = seg_to_hms(fim_r)
    return novo


def dividir_desvios_no_ponto(
    desvios: list[dict], ponto_seg: float
) -> tuple[list[dict], list[dict]]:
    """Particiona os desvios de um corte ao dividi-lo no instante `ponto_seg`.

    Tempos são absolutos (mesmo referencial de `inicio_seg`/`fim_seg` do corte).

    - Desvio inteiramente antes do ponto  -> metade esquerda.
    - Desvio inteiramente depois do ponto  -> metade direita.
    - Desvio que cruza o ponto -> é fatiado em dois (um termina no ponto, outro
      começa no ponto) para que NENHUM dos cortes perca o trecho a remover.

    Os desvios saem normalizados (inicio_seg/fim_seg/inicio_hms/fim_hms) e
    ordenados cronologicamente em cada lado. Desvios inválidos (fim <= início)
    são descartados.

    Exemplo:
        >>> esq, dir = dividir_desvios_no_ponto(
        ...     [{"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "A"}], 50.0
        ... )
        >>> len(esq), len(dir)
        (1, 0)
    """
    esquerda: list[dict] = []
    direita: list[dict] = []

    for d in desvios:
        normalizado = normalizar_desvio(d)
        ini = _desvio_seg(normalizado, "inicio_seg", "inicio_hms")
        fim = _desvio_seg(normalizado, "fim_seg", "fim_hms")
        if fim <= ini:
            continue  # desvio degenerado/inválido

        if fim <= ponto_seg:
            esquerda.append(normalizado)
        elif ini >= ponto_seg:
            direita.append(normalizado)
        else:
            # Cruza o ponto: fatia em duas metades nos limites do ponto.
            esquerda.append(_desvio_com_tempos(normalizado, ini, ponto_seg))
            direita.append(_desvio_com_tempos(normalizado, ponto_seg, fim))

    esquerda.sort(key=lambda x: _desvio_seg(x, "inicio_seg", "inicio_hms"))
    direita.sort(key=lambda x: _desvio_seg(x, "inicio_seg", "inicio_hms"))
    return esquerda, direita
