"""O momento do corte em que o apresentador diz a frase da capa (D-929).

A frase da capa é curada, não transcrita: "ESSES CARAS NUNCA PISARAM NA RUA...
SE PISAR NO SOL, ELES DISSOLVEM NO AR..." sai da fala "nunca pisaram na rua. Eu
acho que se pisar no sol, esses caras dissolvem no ar". Busca exata não acha;
o que acha é a janela curta da `transcricao_final` que contém a maior parte das
palavras de peso da frase.

## Por que só as palavras de peso

"na", "no", "se", "o" estão em toda frase do corte. Contá-las faria qualquer
trecho parecer a frase; as de três letras ou mais ("rua", "sol", "dissolvem")
são as que dizem de qual momento se trata.

## Por que dizer "não achei"

Quando a frase foi reescrita demais para casar, a resposta é `None`, e o robô
volta ao banco de fotos (como antes da D-929). Um quadro de outro momento
traria a expressão errada, que é o defeito que esta demanda corrige.

A timeline é a da `transcricao_final`, que é a do bruto do corte (o
`clip_raw_*.mkv`): o bruto é gerado sem os silêncios e a transcrição é
re-sincronizada com ele. Puro: sem disco, sem banco.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass

# Abaixo disto a palavra é conectivo: casa em qualquer lugar e não localiza nada.
LETRAS_DA_PALAVRA_DE_PESO = 3
# Uma frase de capa tem de 5 a 15 palavras de peso. Com menos de duas, qualquer
# fala do corte casaria.
MINIMO_DE_PALAVRAS_DE_PESO = 2
# Fração das palavras de peso da frase que a janela precisa conter. Metade
# tolera a reescrita da curadoria ("ELES" que a fala não tem) sem aceitar uma
# fala que só compartilha o assunto.
FRACAO_MINIMA_CASADA = 0.5
# A fala leva perto de um segundo por palavra de peso (as de ligação vêm no
# meio); a janela nunca passa disto, para não juntar palavras de falas distantes.
SEGUNDOS_POR_PALAVRA_DE_PESO = 1.0
JANELA_MINIMA_SEG = 4.0
# Fração das palavras de peso que a janela pode deixar de fora para ser mais
# curta: a frase dita de uma vez, e não palavras soltas da fala anterior.
TOLERANCIA_POR_JANELA_CURTA = 0.15
# A palavra não tem fim gravado: vale o começo da seguinte, até este teto — a
# última, ou a que vem antes de uma pausa, não pode herdar o silêncio inteiro.
DURACAO_MAXIMA_DA_PALAVRA = 0.6

_NAO_ALFANUMERICO = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class PalavraFalada:
    texto: str
    inicio_seg: float
    fim_seg: float


@dataclass(frozen=True)
class JanelaDaFrase:
    """Onde a frase é dita no bruto, e quanto dela casou (0 a 1)."""

    inicio_seg: float
    fim_seg: float
    casamento: float


def _normalizar(texto: str) -> str:
    """>>> _normalizar("Dissolvem,")
    'dissolvem'
    """
    decomposto = unicodedata.normalize("NFKD", str(texto))
    sem_acento = "".join(c for c in decomposto if not unicodedata.combining(c))
    return _NAO_ALFANUMERICO.sub("", sem_acento.casefold())


def palavras_de_peso(frase: str) -> list[str]:
    """As palavras que localizam a frase, sem repetição e na ordem.

    >>> palavras_de_peso("Se pisar no SOL, eles dissolvem no ar... SOL")
    ['pisar', 'sol', 'eles', 'dissolvem']
    """
    vistas: list[str] = []
    for bruta in (frase or "").split():
        palavra = _normalizar(bruta)
        if len(palavra) >= LETRAS_DA_PALAVRA_DE_PESO and palavra not in vistas:
            vistas.append(palavra)
    return vistas


def _numero(valor: object) -> float | None:
    try:
        numero = float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return numero if math.isfinite(numero) else None


def _dentro(instante: float, trechos: Sequence[tuple[float, float]] | None) -> bool:
    return trechos is None or any(ini <= instante < fim for ini, fim in trechos)


def palavras_faladas(
    transcricao: Sequence[object], trechos: Sequence[tuple[float, float]] | None = None
) -> list[PalavraFalada]:
    """As palavras da `transcricao_final` com o tempo de cada uma, em ordem.

    O fim de uma palavra é o começo da seguinte, com teto. `trechos` restringe a busca (o
    short só contém parte do corte); fora deles a palavra não existe.
    Tolerante: segmento ou palavra torta fica de fora, sem derrubar a capa.
    """
    brutas: list[tuple[str, float]] = []
    for segmento in transcricao:
        if not isinstance(segmento, dict):
            continue
        for palavra in segmento.get("palavras") or []:
            if not isinstance(palavra, dict):
                continue
            inicio = _numero(palavra.get("inicio_seg"))
            texto = _normalizar(palavra.get("texto", ""))
            if inicio is not None and texto:
                brutas.append((texto, inicio))
    brutas.sort(key=lambda par: par[1])
    faladas = [
        PalavraFalada(
            texto,
            inicio,
            min(
                brutas[i + 1][1] if i + 1 < len(brutas) else math.inf,
                inicio + DURACAO_MAXIMA_DA_PALAVRA,
            ),
        )
        for i, (texto, inicio) in enumerate(brutas)
    ]
    return [p for p in faladas if _dentro(p.inicio_seg, trechos)]


def _melhor_a_partir_de(
    palavras: list[PalavraFalada], i: int, procuradas: set[str], limite_seg: float
) -> tuple[int, int]:
    """Quantas procuradas a janela que começa em `i` casa, e onde ela termina."""
    casadas: set[str] = set()
    fim = i
    for j in range(i, len(palavras)):
        if palavras[j].inicio_seg - palavras[i].inicio_seg > limite_seg:
            break
        if palavras[j].texto in procuradas and palavras[j].texto not in casadas:
            casadas.add(palavras[j].texto)
            fim = j
    return len(casadas), fim


def janela_da_frase(
    transcricao: Sequence[object],
    frase: str,
    trechos: Sequence[tuple[float, float]] | None = None,
) -> JanelaDaFrase | None:
    """A janela em que a frase é dita, ou `None` quando ela não casa.

    Entre janelas que casam quase o mesmo número de palavras, vence a mais
    curta: é a fala dita de uma vez, e não palavras soltas de falas vizinhas.

    >>> t = [{"palavras": [{"texto": w, "inicio_seg": i} for i, w in
    ...      enumerate("a rua é longa nunca pisaram na rua sol dissolvem".split())]}]
    >>> j = janela_da_frase(t, "NUNCA PISARAM NA RUA, DISSOLVEM NO SOL")
    >>> (j.inicio_seg, j.fim_seg)
    (4.0, 9.6)
    """
    procuradas = palavras_de_peso(frase)
    if len(procuradas) < MINIMO_DE_PALAVRAS_DE_PESO:
        return None
    palavras = palavras_faladas(transcricao, trechos)
    alvo = set(procuradas)
    limite = max(JANELA_MINIMA_SEG, SEGUNDOS_POR_PALAVRA_DE_PESO * len(procuradas))

    janelas = [
        (casadas, palavras[fim].fim_seg - palavras[i].inicio_seg, i, fim)
        for i in range(len(palavras))
        if palavras[i].texto in alvo
        for casadas, fim in [_melhor_a_partir_de(palavras, i, alvo, limite)]
    ]
    if not janelas:
        return None
    # Perder uma palavra em cada sete vale a troca por uma janela mais curta: a
    # mais completa às vezes começa num "eles" da frase anterior (corte 0d624bfc).
    tolerancia = int(len(procuradas) * TOLERANCIA_POR_JANELA_CURTA)
    mais_casadas = max(j[0] for j in janelas)
    casadas, _, i, fim = min(
        (j for j in janelas if j[0] >= mais_casadas - tolerancia), key=lambda j: (j[1], -j[0])
    )
    casamento = casadas / len(procuradas)
    if casadas < MINIMO_DE_PALAVRAS_DE_PESO or casamento < FRACAO_MINIMA_CASADA:
        return None
    return JanelaDaFrase(
        inicio_seg=round(palavras[i].inicio_seg, 3),
        fim_seg=round(palavras[fim].fim_seg, 3),
        casamento=round(casamento, 3),
    )
