"""Âncora verbatim de uma borda no tempo real da palavra (D-355).

WHY: as bordas de CORTE nascem do timestamp "de memória" do LLM — ele estima o
HH:MM:SS do início/fim do trecho, e esse número costuma errar por dezenas de
segundos, sem qualquer refinamento (o snap de palavra da D-339 só age em desvios,
janela de 0.8s). Quando o LLM também fornece a CITAÇÃO verbatim do texto onde a
borda cai, dá para ancorar a borda no tempo REAL daquela palavra na transcrição
word-level (`palavras = [{"texto", "inicio_seg"}]`, da D-337).

NÃO-QUEBRADIÇO por construção:
  - busca JANELADA em torno do timestamp aproximado (não na live inteira) →
    resolve frase repetida (a ocorrência de dentro da janela vence) e é rápida;
  - sem citação, sem palavras (VTT legado) ou sem bom match → devolve None, e o
    caller mantém o timestamp atual (comportamento de hoje);
  - `ancorar_intervalo` nunca inverte nem colapsa a borda: se a âncora produzir
    fim ≤ início, descarta a âncora e devolve o par proposto.

Puro e determinístico (sem I/O), no espírito de `snap_desvios.py`. O achatamento
das palavras é reusado de lá (`achatar_palavras`).
"""

from __future__ import annotations

from difflib import SequenceMatcher

from app.domain.corte.snap_desvios import achatar_palavras  # reexport util p/ o caller
from app.domain.time_convert import seg_to_hms, to_seg_estrito

__all__ = ["achatar_palavras", "ancorar_borda", "ancorar_intervalo"]

# Similaridade mínima (0..1) entre a citação e a sequência de palavras candidata
# para aceitar a âncora. Abaixo disso a citação "não bateu" → fallback (None).
# 0.6 tolera pequenas divergências de transcrição/pontuação sem casar lixo.
_LIMIAR_PADRAO = 0.6

# Fim da ÚLTIMA palavra da janela quando não há próxima para dar a borda de fim:
# folga curta a partir do seu início (a duração real não sobrevive ao achatamento).
_FOLGA_ULTIMA_PALAVRA_SEG = 0.3

# Pontuação removida das bordas de cada token antes de comparar.
_PONTUACAO = ".,;:!?\"'“”‘’()[]{}…—–-"


def _tokenizar(texto: str) -> list[str]:
    """Quebra `texto` em tokens minúsculos, sem pontuação de borda nem vazios."""
    tokens: list[str] = []
    for bruto in (texto or "").casefold().split():
        limpo = bruto.strip(_PONTUACAO)
        if limpo:
            tokens.append(limpo)
    return tokens


def ancorar_borda(
    texto_ancora: str,
    tempo_aprox_seg: float,
    palavras: list[dict],
    *,
    janela_seg: float,
    is_inicio: bool,
    limiar: float = _LIMIAR_PADRAO,
) -> float | None:
    """Ancora UMA borda no tempo real da palavra citada, dentro de uma janela.

    Procura `texto_ancora` (citação curta) SÓ entre as palavras cujo `inicio_seg`
    cai em ``[tempo_aprox_seg − janela_seg, tempo_aprox_seg + janela_seg]``,
    usando `difflib.SequenceMatcher` sobre a concatenação das palavras candidatas.
    Devolve:
      - `is_inicio=True`  → o `inicio_seg` da primeira palavra do trecho casado;
      - `is_inicio=False` → o FIM da última palavra casada (início da palavra
        seguinte na janela; folga curta se ela for a última).

    Retorna `None` (sinal de fallback ao timestamp atual) quando: a citação é
    vazia, não há palavras (VTT legado), a janela não contém palavra alguma, ou a
    melhor similaridade fica abaixo de `limiar`. Determinístico: empate de
    similaridade resolve pela ocorrência mais próxima de `tempo_aprox_seg`.
    """
    ancora_tokens = _tokenizar(texto_ancora)
    if not ancora_tokens or not palavras:
        return None

    lo = tempo_aprox_seg - janela_seg
    hi = tempo_aprox_seg + janela_seg
    janela = [p for p in palavras if lo <= p["inicio_seg"] <= hi]
    if not janela:
        return None

    # Forma normalizada de cada palavra da janela (index-alinhada com `janela`).
    janela_norm = [" ".join(_tokenizar(p.get("texto", ""))) for p in janela]
    ancora_str = " ".join(ancora_tokens)
    n = len(ancora_tokens)

    melhor_ratio = -1.0
    melhor_i = -1
    melhor_len = 0
    melhor_dist = float("inf")
    # Tolera a citação ter uma palavra a mais/menos que o trecho real.
    comprimentos = sorted({c for c in (n - 1, n, n + 1) if c >= 1})
    for i in range(len(janela)):
        for comp in comprimentos:
            fim = i + comp
            if fim > len(janela):
                break
            candidato = " ".join(janela_norm[i:fim]).strip()
            if not candidato:
                continue
            ratio = SequenceMatcher(None, ancora_str, candidato).ratio()
            dist = abs(janela[i]["inicio_seg"] - tempo_aprox_seg)
            # Melhor ratio vence; empate → ocorrência mais próxima do timestamp.
            if ratio > melhor_ratio or (ratio == melhor_ratio and dist < melhor_dist):
                melhor_ratio = ratio
                melhor_i = i
                melhor_len = comp
                melhor_dist = dist

    if melhor_i < 0 or melhor_ratio < limiar:
        return None

    if is_inicio:
        return float(janela[melhor_i]["inicio_seg"])

    ultimo = melhor_i + melhor_len - 1
    if ultimo + 1 < len(janela):
        return float(janela[ultimo + 1]["inicio_seg"])
    return float(janela[ultimo]["inicio_seg"]) + _FOLGA_ULTIMA_PALAVRA_SEG


def ancorar_intervalo(
    inicio_texto: str,
    fim_texto: str,
    inicio_seg: float,
    fim_seg: float,
    palavras: list[dict],
    *,
    janela_seg: float,
    limiar: float = _LIMIAR_PADRAO,
) -> tuple[float, float]:
    """Ancora AS DUAS bordas do intervalo, sem nunca invertê-lo nem colapsá-lo.

    Cada lado usa `ancorar_borda` com seu próprio timestamp aproximado; o lado
    sem citação (ou sem match) mantém o valor proposto. Guarda anti-regressão: se
    o resultado inverter/colapsar (fim ≤ início), descarta a âncora e devolve o
    par ``(inicio_seg, fim_seg)`` original. Determinístico e puro.
    """
    novo_ini = ancorar_borda(
        inicio_texto, inicio_seg, palavras, janela_seg=janela_seg, is_inicio=True, limiar=limiar
    )
    novo_fim = ancorar_borda(
        fim_texto, fim_seg, palavras, janela_seg=janela_seg, is_inicio=False, limiar=limiar
    )
    ini_final = novo_ini if novo_ini is not None else inicio_seg
    fim_final = novo_fim if novo_fim is not None else fim_seg
    if fim_final <= ini_final:
        return inicio_seg, fim_seg
    return ini_final, fim_final


# D-355: janela curta para ancorar a borda de DESVIO — o timestamp do desvio
# já é fino (nível de segmento ≤6 palavras), então basta ±5s; o snap (0.8s)
# completa o ajuste de borda de palavra depois.
_JANELA_ANCORA_DESVIO_SEG = 5.0


def ancorar_desvio(desvio: dict, palavras: list[dict]) -> dict:
    """D-355: ancora as bordas do desvio no tempo real da palavra citada
    (`inicio_texto`/`fim_texto`), dentro de ±5s do timestamp proposto.

    Sem citação, sem palavras (VTT legado) ou sem match → devolve o desvio
    inalterado (o `snap` a seguir faz o ajuste fino sozinho, como hoje).
    Nunca inverte a borda (garantido por `ancorar_intervalo`). Preserva os
    demais campos via `dict(desvio)`.
    """
    inicio_texto = (desvio.get("inicio_texto") or "").strip()
    fim_texto = (desvio.get("fim_texto") or "").strip()
    if not palavras or (not inicio_texto and not fim_texto):
        return desvio
    ini = to_seg_estrito(desvio.get("inicio_seg") or 0)
    fim = to_seg_estrito(desvio.get("fim_seg") or 0)
    novo_ini, novo_fim = ancorar_intervalo(
        inicio_texto,
        fim_texto,
        ini,
        fim,
        palavras,
        janela_seg=_JANELA_ANCORA_DESVIO_SEG,
    )
    if novo_ini == ini and novo_fim == fim:
        return desvio
    ajustado = dict(desvio)
    ini_r = round(novo_ini, 3)
    fim_r = round(novo_fim, 3)
    ajustado["inicio_seg"] = ini_r
    ajustado["fim_seg"] = fim_r
    ajustado["inicio_hms"] = seg_to_hms(ini_r)
    ajustado["fim_hms"] = seg_to_hms(fim_r)
    return ajustado
