"""Momentos de maior reação do chat da live (M1).

O chat replay do YouTube é o único sinal de audiência que a live já traz de
graça — mas ele é escasso: as lives medidas ficam entre 4 e 8 mensagens por
minuto. Nessa densidade, contar mensagens por minuto produz uma série
indistinguível de ruído (6 picos reais contra 5 de mensagens sorteadas ao
acaso, medido em 26/08/2026).

O que sobrevive ao teste é outra coisa: numa janela de **3 minutos**, metade
das lives tem *um* momento que o acaso não alcança. Não é um mapa de calor —
é um detector do momento mais quente, e só dispara quando há o que detectar.

Significância por **cauda de Poisson**: se as mensagens fossem independentes e
uniformes no tempo, a contagem de cada janela seguiria Poisson(λ), com λ = a
média de mensagens por janela. Uma janela é notável quando a chance de ver
tantas mensagens ali por acaso é baixa mesmo depois de descontar que estamos
olhando muitas janelas (correção de Bonferroni) — o teste sem essa correção
acusaria picos em qualquer live, já que quanto mais janelas, mais chances de
uma delas se destacar sozinha.

Este módulo é puro: não lê arquivo, não conhece o yt-dlp nem o banco.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

# Janela de 3 min: em 1 min a série vira ruído (densidade baixa demais) e em
# 5 min o momento fica largo demais para orientar uma fronteira de corte.
JANELA_PADRAO_SEG = 180.0

# Teto para a chance de um pico ser acaso, JÁ corrigido pelo número de janelas.
ALFA_PADRAO = 0.01

# Piso absoluto: numa live vazia, 3 mensagens numa janela podem ser
# estatisticamente "improváveis" e editorialmente irrelevantes.
MIN_MENSAGENS_PADRAO = 8

# Quem escreve antes da transmissão começar recebe offset 0 — é a fila de
# chegada ("boa tarde", "oi", "abre a live"), não reação a conteúdo que ainda
# não foi ao ar. Numa live medida essa pilha sozinha criava o maior "pico" da
# análise, no minuto zero. Descartada por não poder ser reação a nada.
INICIO_MINIMO_SEG = 1.0


@dataclass(frozen=True)
class PicoChat:
    """Uma janela em que o chat reagiu acima do que o acaso explica."""

    inicio_seg: float
    fim_seg: float
    mensagens: int
    esperado: float
    p_corrigido: float


def parse_live_chat(conteudo: str) -> list[float]:
    """Extrai os instantes (em segundos do vídeo) das mensagens do chat.

    Recebe o `*.live_chat.json` do yt-dlp, que é JSONL: uma ação de replay por
    linha. Linhas quebradas são ignoradas em silêncio — o arquivo vem de fonte
    externa e uma linha corrompida não pode derrubar a análise inteira.
    """
    instantes: list[float] = []
    for linha in conteudo.splitlines():
        linha = linha.strip()
        if not linha:
            continue
        try:
            evento = json.loads(linha)
        except ValueError:
            continue
        acao = evento.get("replayChatItemAction") or {}
        offset = acao.get("videoOffsetTimeMsec")
        if offset is None:
            continue
        for item in acao.get("actions") or []:
            conteudo_item = (item.get("addChatItemAction") or {}).get("item") or {}
            eh_mensagem = (
                "liveChatTextMessageRenderer" in conteudo_item
                or "liveChatPaidMessageRenderer" in conteudo_item
            )
            if eh_mensagem:
                try:
                    instantes.append(int(offset) / 1000.0)
                except (TypeError, ValueError):
                    continue
    instantes.sort()
    return instantes


def _poisson_cauda(k: int, lam: float) -> float:
    """P(X >= k) para X ~ Poisson(lam), somando a cauda de baixo pra cima.

    Soma P(X < k) termo a termo (cada termo derivado do anterior, sem calcular
    fatorial) e devolve o complemento — evita overflow em lam alto e mantém a
    precisão onde ela importa, que é na cauda pequena.
    """
    if k <= 0:
        return 1.0
    if lam <= 0:
        return 0.0
    termo = math.exp(-lam)
    acumulado = termo
    for i in range(1, k):
        termo *= lam / i
        acumulado += termo
        if acumulado >= 1.0:
            return 0.0
    return max(0.0, 1.0 - acumulado)


def picos_significativos(
    instantes: list[float],
    duracao_seg: float,
    *,
    janela_seg: float = JANELA_PADRAO_SEG,
    alfa: float = ALFA_PADRAO,
    min_mensagens: int = MIN_MENSAGENS_PADRAO,
) -> list[PicoChat]:
    """Janelas cuja contagem de mensagens não se explica por acaso.

    Devolve lista vazia — e não uma lista de "os maiores" — quando nada passa
    no teste: metade das lives medidas não tem pico algum, e inventar um
    destaque onde não há seria pior que ficar calado.
    """
    if not instantes or duracao_seg <= 0 or janela_seg <= 0:
        return []

    n_janelas = max(1, int(math.ceil(duracao_seg / janela_seg)))
    if n_janelas < 2:
        return []

    validos = [t for t in instantes if INICIO_MINIMO_SEG <= t <= duracao_seg]
    if not validos:
        return []

    contagem = [0] * n_janelas
    for t in validos:
        contagem[min(int(t // janela_seg), n_janelas - 1)] += 1

    lam = len(validos) / n_janelas
    if lam <= 0:
        return []

    picos: list[PicoChat] = []
    for indice, qtd in enumerate(contagem):
        if qtd < min_mensagens:
            continue
        p_corrigido = min(1.0, _poisson_cauda(qtd, lam) * n_janelas)
        if p_corrigido <= alfa:
            inicio = indice * janela_seg
            picos.append(
                PicoChat(
                    inicio_seg=inicio,
                    fim_seg=min(inicio + janela_seg, duracao_seg),
                    mensagens=qtd,
                    esperado=lam,
                    p_corrigido=p_corrigido,
                )
            )
    picos.sort(key=lambda p: (-p.mensagens, p.inicio_seg))
    return picos


def _hms(seg: float) -> str:
    total = int(seg)
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def formatar_dica(picos: list[PicoChat], *, limite: int = 3) -> str:
    """Texto para o prompt de análise. String vazia quando não há pico.

    Deliberadamente descreve o sinal como PISTA, não como ordem: o chat marca
    onde a plateia reagiu, o que nem sempre coincide com onde há um corte bom.
    """
    if not picos:
        return ""
    linhas = [
        f"- {_hms(p.inicio_seg)} a {_hms(p.fim_seg)} "
        f"({p.mensagens} mensagens, contra {p.esperado:.0f} de média)"
        for p in picos[:limite]
    ]
    return (
        "REAÇÃO DA AUDIÊNCIA — o chat ao vivo se agitou nestes trechos:\n"
        + "\n".join(linhas)
        + "\nUse como pista de onde a plateia se envolveu, não como ordem: "
        "avalie o conteúdo antes de propor um corte ali."
    )


def picos_no_intervalo(picos: list[PicoChat], inicio_seg: float, fim_seg: float) -> list[PicoChat]:
    """Filtra os picos que caem numa janela da transcrição.

    Necessário no caminho em lote: cada parte recebe só o seu pedaço da
    transcrição, e citar um instante fora dele mandaria a IA propor corte em
    material que ela não está vendo.
    """
    return [p for p in picos if p.fim_seg > inicio_seg and p.inicio_seg < fim_seg]
