"""Encaixe (snap) determinístico de um desvio na borda real de palavra (D-339).

WHY: a D-337 passou a preservar, por segmento da transcrição, o tempo REAL de
cada palavra (`palavras = [{"texto", "inicio_seg"}]`, extraído do `tOffsetMs` do
json3). Mesmo assim o Claude escolhe as bordas do trecho a remover no nível do
SEGMENTO (≤6 palavras), então a borda às vezes cai no MEIO de uma palavra ou um
triz fora. Este módulo faz um ajuste puro e determinístico: aproxima o início do
desvio ao INÍCIO de palavra mais próximo, e o fim ao FIM de palavra mais próximo,
desde que dentro de uma janela curta — sem áudio, sem tocar o contrato/skill.

Fase 2 da precisão dos trechos. Fica em `domain/` porque é lógica pura (sem I/O):
recebe o desvio e a lista achatada de palavras do corte e devolve um novo desvio.
"""

from app.domain.time_convert import hms_to_seg, seg_to_hms

# Fim da ÚLTIMA palavra da lista quando não há próxima palavra para dar a borda:
# uma folga curta a partir do seu início (a duração real do segmento não sobrevive
# ao achatamento). Só afeta o snap do fim que caísse exatamente na última palavra.
_FOLGA_ULTIMA_PALAVRA_SEG = 0.3


def _tempo_do_desvio(desvio: dict, campo_seg: str, campo_hms: str, campo_alt: str) -> float | None:
    """Extrai o tempo (segundos) de um lado do desvio, tolerando as variações de
    campo (inicio_seg/fim_seg em float, ou inicio_hms/fim_hms/inicio/fim em HMS).

    Prioriza o campo em segundos (fonte já normalizada por `normalizar_desvio`),
    caindo para o HMS. Retorna None quando nenhum está presente — sinal para o
    caller não snapar aquele lado.
    """
    for chave in (campo_seg, campo_hms, campo_alt):
        val = desvio.get(chave)
        if val is None or val == "":
            continue
        if isinstance(val, (int, float)):
            return float(val)
        s = str(val).strip()
        if ":" in s:
            return hms_to_seg(s)
        try:
            return float(s)
        except ValueError:
            continue
    return None


def _borda_mais_proxima(candidatos: list[float], alvo: float, janela_seg: float) -> float | None:
    """Retorna o candidato cuja distância a `alvo` é mínima, desde que dentro de
    `janela_seg`. Empate resolve pelo menor tempo (determinístico). None se nenhum
    candidato cai dentro da janela.
    """
    melhor: float | None = None
    melhor_dist = janela_seg
    for c in candidatos:
        dist = abs(c - alvo)
        if dist <= melhor_dist:
            # `<=` com candidatos ordenados asc. mantém o PRIMEIRO (menor) em empate.
            if melhor is None or dist < melhor_dist:
                melhor = c
                melhor_dist = dist
    return melhor


def achatar_palavras(transcricao: list[dict]) -> list[dict]:
    """Achata as `palavras` (D-337) de todos os segmentos numa única lista
    ordenada de `{"texto", "inicio_seg"}` com tempos absolutos.

    Segmentos sem `palavras` (dados legados/vtt) simplesmente não contribuem —
    a lista pode sair vazia, e nesse caso o snap é no-op (back-compat).
    """
    achatadas: list[dict] = []
    for seg in transcricao or []:
        if not isinstance(seg, dict):
            continue
        for p in seg.get("palavras") or []:
            if not isinstance(p, dict):
                continue
            ini = p.get("inicio_seg")
            if ini is None:
                continue
            try:
                achatadas.append({"texto": p.get("texto", ""), "inicio_seg": float(ini)})
            except (ValueError, TypeError):
                continue
    achatadas.sort(key=lambda p: p["inicio_seg"])
    return achatadas


def snap_desvio_a_palavras(desvio: dict, palavras: list[dict], *, janela_seg: float = 0.8) -> dict:
    """Encaixa o intervalo do `desvio` nas bordas reais de palavra mais próximas.

    `palavras`: lista ACHATADA e ORDENADA de `{"texto", "inicio_seg"}` do corte
    (cada palavra com seu tempo absoluto). O FIM de uma palavra é o `inicio_seg`
    da PRÓXIMA; para a última, uma folga curta a partir do seu início.

    Snap:
      - `inicio_seg` do desvio → início de palavra mais próximo do início proposto,
        se dentro de `janela_seg`;
      - `fim_seg` → fim de palavra mais próximo do fim proposto, se dentro da janela.

    Guardas (nunca piora): sem palavras, sem tempo legível, nenhuma borda dentro
    da janela, ou intervalo que colapsa/inverte após o snap → devolve o desvio
    ORIGINAL inalterado. Todos os demais campos (motivo, origem, etc.) são
    preservados via `dict(desvio)`. Puro e determinístico (sem I/O).
    """
    original = dict(desvio)
    if not palavras:
        return original

    ini_proposto = _tempo_do_desvio(desvio, "inicio_seg", "inicio_hms", "inicio")
    fim_proposto = _tempo_do_desvio(desvio, "fim_seg", "fim_hms", "fim")
    if ini_proposto is None or fim_proposto is None:
        return original

    inicios = [p["inicio_seg"] for p in palavras]
    # Fim de cada palavra = início da próxima; a última recebe uma folga curta.
    fins = inicios[1:] + [inicios[-1] + _FOLGA_ULTIMA_PALAVRA_SEG]

    novo_ini = _borda_mais_proxima(inicios, ini_proposto, janela_seg)
    novo_fim = _borda_mais_proxima(fins, fim_proposto, janela_seg)

    # Nenhum lado encontrou borda dentro da janela: nada a fazer.
    if novo_ini is None and novo_fim is None:
        return original

    # Snap independente por lado: o lado sem borda na janela mantém o proposto.
    ini_final = novo_ini if novo_ini is not None else ini_proposto
    fim_final = novo_fim if novo_fim is not None else fim_proposto

    # Guarda anti-regressão: intervalo não pode colapsar nem inverter.
    if fim_final <= ini_final:
        return original

    # Se o snap não mexeu em nada (bordas já coincidiam), devolve o original intacto.
    if ini_final == ini_proposto and fim_final == fim_proposto:
        return original

    ajustado = dict(desvio)
    ini_r = round(ini_final, 3)
    fim_r = round(fim_final, 3)
    ajustado["inicio_seg"] = ini_r
    ajustado["fim_seg"] = fim_r
    ajustado["inicio_hms"] = seg_to_hms(ini_r)
    ajustado["fim_hms"] = seg_to_hms(fim_r)
    return ajustado
