"""ONDE a legenda do short senta no quadro (D-605).

## O problema que originou este modulo

A legenda era desenhada num ponto de LEI DO CODIGO: base a 18% da altura,
centralizada, 80% de largura (`SAFE_ZONE` e `LARGURA` do `LegendaShort.tsx`).
Aquele 18% e a faixa que a UI dos apps ocupa — uma escolha certa, e que continua
sendo o default.

O que ele nao sabia e o que esta DEBAIXO dele. O relato do operador foi direto:
"a depender do Palco, ela fica em cima da pessoa". Faz sentido — o palco decide
onde a pessoa aparece no vertical, e num arranjo de tela dividida a faixa de
baixo e justamente a cara de alguem. O ponto fixo acerta num arranjo e erra no
seguinte, dentro do MESMO corte.

## Por que o lugar mora ao lado da cor e da fonte

`legenda_cor` e `legenda_fonte` (D-563/D-570) ja sao herdados do PALCO PADRAO do
corte, pela cascata de `palco_shorts.CAMPOS_HERDADOS`. O lugar entra pela mesma
porta de proposito: quem cria o problema e o palco, entao quem carrega a solucao
e o palco. Escolher outro arranjo e escolher, junto, onde a legenda cabe nele.

Igual ao gancho (D-600), o trecho pode discordar: `0` em qualquer campo significa
"nao decidi" e a leitura sobe a cascata — trecho, palco padrao do corte, e por
fim os numeros que estavam cravados no renderer. Um short gravado antes desta
demanda sai pixel a pixel como saia.

## A ancoragem, que e a unica sutileza aqui

`x` e o CENTRO da caixa; `y` e a BASE dela. A base, e nao o topo — e aqui esta a
diferenca em relacao ao gancho.

A legenda vira duas ou tres linhas conforme a frase, varias vezes por short. Se
ela fosse ancorada pelo topo, cada pagina com uma linha a mais empurraria o texto
para baixo e a legenda ficaria pulando no rodape a cada frase. Ancorada pela
base, ela cresce para CIMA e a ultima linha nunca se move — que e exatamente o
que o `bottom:` do renderer sempre fez.

O gancho faz o oposto (topo) por um motivo simetrico: ele e UM texto, escrito ao
vivo, e ancorado pela base a primeira linha escorregaria a cada palavra digitada.

Modulo puro: so aritmetica. Sem I/O, sem banco, sem Remotion.
"""

from __future__ import annotations

import math

from app.domain.short.transcricao_fiel import Palavra

# A faixa da UI dos apps, em cima e embaixo. Espelha `SAFE_ZONE` em
# `video-renderer/src/cenas-shorts/LegendaShort.tsx` e em
# `frontend/src/features/shorts/previaLegenda.ts`.
SAFE_ZONE = 0.18

# Guardamos PORCENTAGEM do quadro, e nao pixel, pela mesma razao do gancho: a
# legenda e desenhada num quadro de 1080x1920 no render e numa janela de ~220px
# na previa, e so uma proporcao significa a mesma coisa nos dois.
POSICAO_X_PADRAO = 50.0
POSICAO_Y_PADRAO = 100.0 - SAFE_ZONE * 100  # 82.0 — a base no alto da safe zone
LARGURA_PADRAO = 80.0  # espelha `LARGURA` do renderer ("80%")

# A caixa pode subir bastante — subir e o ponto desta demanda —, mas nao pode
# sair do quadro. Com a base acima de 12% nem uma linha caberia acima dela.
POSICAO_X_MIN = 10.0
POSICAO_X_MAX = 90.0
POSICAO_Y_MIN = 12.0
POSICAO_Y_MAX = 99.0

# Abaixo de 40% a frase de 4 a 7 palavras vira uma coluna de uma palavra por
# linha — deixa de ser legivel numa sacada, que e a unica razao de ela existir.
LARGURA_MIN = 40.0
LARGURA_MAX = 100.0


def _na_faixa(valor: object, padrao: float, minimo: float, maximo: float) -> float:
    """Um numero de layout encaixado na faixa util. Ausente, zero ou torto = padrao.

    Zero cai no padrao de proposito: e o "nao decidi" desta cascata inteira, o
    mesmo vocabulario do gancho (D-600) e do resto do layout. Como o minimo de
    todos os campos aqui e maior que zero, nenhum valor legitimo e confundido
    com heranca.
    """
    try:
        numero = float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return padrao
    # `NaN` e `inf` passam pelo `float()` e sobrevivem ao `min`/`max` — um NaN
    # comparado com qualquer coisa e sempre falso, entao ele atravessaria inteiro
    # e chegaria ao renderer. O sintoma nao seria um erro: seria a legenda
    # simplesmente nao aparecendo no arquivo, com `left: NaN%` no CSS.
    if not math.isfinite(numero) or numero <= 0:
        return padrao
    return round(min(max(numero, minimo), maximo), 2)


def normalizar_x(valor: object) -> float:
    """O centro horizontal da caixa, em % da largura. Ausente = centralizado.

    >>> normalizar_x(30)
    30.0
    >>> normalizar_x(120)
    90.0
    >>> normalizar_x(None)
    50.0
    """
    return _na_faixa(valor, POSICAO_X_PADRAO, POSICAO_X_MIN, POSICAO_X_MAX)


def normalizar_y(valor: object) -> float:
    """A BASE da caixa, em % da altura contada do topo. Ausente = a safe zone.

    >>> normalizar_y(60)
    60.0
    >>> normalizar_y(5)
    12.0
    >>> normalizar_y(None)
    82.0
    """
    return _na_faixa(valor, POSICAO_Y_PADRAO, POSICAO_Y_MIN, POSICAO_Y_MAX)


def normalizar_largura(valor: object) -> float:
    """A largura da caixa, em % da largura do quadro. Ausente = os 80% de sempre.

    >>> normalizar_largura(60)
    60.0
    >>> normalizar_largura(5)
    40.0
    >>> normalizar_largura(None)
    80.0
    """
    return _na_faixa(valor, LARGURA_PADRAO, LARGURA_MIN, LARGURA_MAX)


def lugar_do_preset(payload: dict) -> dict:
    """O lugar dentro de um payload de preset de PALCO, parcial de proposito.

    Zero significa "este preset nao decide onde", e nao "no lugar de sempre".
    Materializar os defaults aqui congelaria o sistema do dia em que o preset foi
    salvo — a armadilha que a cascata de layout ja registrou, e a razao pela qual
    um preset salvo antes desta demanda volta com 0 nos tres campos e continua
    desenhando a legenda onde sempre desenhou.

    >>> lugar_do_preset({'legenda_y': 60})['legenda_y']
    60.0
    >>> lugar_do_preset({})['legenda_y']
    0.0
    >>> lugar_do_preset({'legenda_x': 30, 'legenda_largura': 55})['legenda_largura']
    55.0
    """
    return {
        "legenda_x": normalizar_x(payload["legenda_x"]) if payload.get("legenda_x") else 0.0,
        "legenda_y": normalizar_y(payload["legenda_y"]) if payload.get("legenda_y") else 0.0,
        "legenda_largura": (
            normalizar_largura(payload["legenda_largura"])
            if payload.get("legenda_largura")
            else 0.0
        ),
    }


def para_payload(x: object = 0.0, y: object = 0.0, largura: object = 0.0) -> dict:
    """O lugar como o renderer o consome — SEMPRE preenchido.

    A heranca chega aqui JA resolvida (quem chama sobe a cascata): este payload
    so normaliza. O renderer nao deve conhecer a regra de heranca — ele recebe
    onde desenhar, e os defaults sao os numeros que estavam cravados nele ate
    esta demanda.

    >>> para_payload(y=60)['y']
    60.0
    >>> para_payload()
    {'x': 50.0, 'y': 82.0, 'largura': 80.0}
    """
    return {
        "x": normalizar_x(x),
        "y": normalizar_y(y),
        "largura": normalizar_largura(largura),
    }


def para_captions(palavras: list[Palavra]) -> list[dict]:
    """Converte `Palavra` no formato `Caption` do `@remotion/captions`.

    Duas conversões que precisam estar certas ou a legenda sai torta:

    - **milissegundos**, não segundos — é a unidade do pacote;
    - **espaço à esquerda** em toda palavra menos a primeira. O Remotion
      concatena os tokens crus para montar a frase da página; sem o espaço a
      linha vira "ninguemtecontaisso".

    Exemplo:
        >>> para_captions([Palavra("olá", 0.0, 0.4), Palavra("mundo", 0.4, 0.9)])
        [{'text': 'olá', 'startMs': 0, 'endMs': 400, 'timestampMs': 200, 'confidence': None}, \
{'text': ' mundo', 'startMs': 400, 'endMs': 900, 'timestampMs': 650, 'confidence': None}]
    """
    captions: list[dict] = []
    for indice, palavra in enumerate(palavras):
        inicio_ms = int(round(palavra.inicio_seg * 1000))
        fim_ms = int(round(palavra.fim_seg * 1000))
        captions.append(
            {
                "text": palavra.texto if indice == 0 else f" {palavra.texto}",
                "startMs": inicio_ms,
                "endMs": fim_ms,
                "timestampMs": (inicio_ms + fim_ms) // 2,
                "confidence": None,
            }
        )
    return captions
