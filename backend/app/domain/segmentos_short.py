"""Os SEGMENTOS de um short — o short como colagem, e nao como janela (D-604).

## O problema

Um `Short` era uma janela unica sobre o bruto: `[inicio_seg, fim_seg]`. Isso
obriga o trecho a ser continuo, e a fala raramente e. O operador quer montar UM
short com pedacos descontinuos do mesmo bruto — "de 0 a 30s e depois de 45 a
60s" —, porque o meio nao serve e cortar fora e exatamente o trabalho.

## A ideia: uma EDL, nao um intervalo

`segmentos` e a lista de fatias do bruto NA ORDEM EM QUE TOCAM. E a mesma ideia
do `arranjo_blocos` do corte (D-576), e a mesma de qualquer editor nao-linear: a
midia nao se move, move-se o ponteiro.

A ORDEM E LIVRE — decisao do operador nesta demanda. Ele pode abrir com o gancho
mais forte mesmo que ele venha depois na live, que e tecnica corrente de short. A
consequencia esta em `com_offsets`: o tempo do short cresce na ordem da LISTA, e
nao na ordem do relogio do bruto. Nada aqui ordena a lista, e ordenar seria
desfazer a decisao dele em silencio.

## Duas diferencas em relacao ao arranjo de blocos do corte

Aquele e uma PERMUTACAO: os blocos ladrilham o corte inteiro, sem buraco e sem
sobreposicao, porque reordenar nao pode mudar a duracao. Aqui:

1. **Buraco e o ponto.** Os segmentos SELECIONAM o que entra; o que fica entre
   eles nao existe no short. Por isso a duracao do short nao e mais
   `fim - inicio`, e por isso `duracao_liquida` existe.
2. **Sobreposicao e permitida.** Com ordem livre, repetir o mesmo instante duas
   vezes e uma escolha editorial legitima (eco, "olha de novo"). Proibir custaria
   uma regra a mais e tiraria um recurso de graca.

## A armadilha que este modulo existe para fechar

`duracao_seg = fim_seg - inicio_seg` esta espalhado por capa, enquadramento,
metadados, publicacao, o clamp do gancho e a tela. Com buracos, essa subtracao
MENTE: 0-30 mais 45-60 tem envelope de 60s e 45s de video. Nao e hipotese — a
D-362 congelou renders por usar o span BRUTO onde devia usar a liquida. Toda
pergunta sobre "quanto tempo dura" passa por aqui.

## Ausencia como heranca

Lista VAZIA e o caso normal e significa "a janela unica de sempre". Por isso toda
funcao daqui recebe `inicio_seg`/`fim_seg` como fallback: o "[] = janela unica" e
resolvido em UM lugar, e nao em cada chamador. Short gravado antes desta demanda
tem `[]` e se comporta exatamente como antes.

Modulo puro: so aritmetica e JSON. Sem I/O, sem banco, sem ffmpeg.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

# Fatia mais curta que isso e lixo de arredondamento, nao decisao editorial — o
# mesmo limiar de `arranjo_blocos.DURACAO_MINIMA_SEG` e de `calcular_segmentos`.
DURACAO_MINIMA_SEG = 0.1

# Quantos segmentos um short aceita. Nao e limite tecnico: e o ponto em que a
# colagem deixa de ser um short e vira uma edicao, com a regua virando um
# mosaico ilegivel e o render pagando um encode por pedaco.
MAX_SEGMENTOS = 12


@dataclass(frozen=True)
class Segmento:
    """Uma fatia do BRUTO, em tempo de bruto.

    Tempo de bruto, e nao da live: e do bruto (o clip ja sem os desvios) que o
    short e recortado, e a invariante do modelo `Short` diz isso desde a D-452.
    Misturar os dois espacos dessincroniza todo candidato.
    """

    inicio_seg: float
    fim_seg: float

    @property
    def duracao_seg(self) -> float:
        return round(self.fim_seg - self.inicio_seg, 3)

    def para_dict(self) -> dict:
        return {"inicio_seg": self.inicio_seg, "fim_seg": self.fim_seg}


def _numero(valor: object) -> float | None:
    """Um float utilizavel, ou None. `NaN`/`inf` contam como inutilizaveis.

    A guarda de finitude nao e paranoia: `float('nan')` passa pelo `float()`,
    sobrevive a qualquer `min`/`max` (comparacao com NaN e sempre falsa) e
    chegaria ao `-ss` do ffmpeg. O sintoma seria um render que nao fecha.
    """
    try:
        numero = float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return numero if math.isfinite(numero) else None


def de_json(bruto: object) -> list[Segmento]:
    """Os segmentos gravados, ignorando o que nao da para usar.

    Degradar, e nao levantar: a coluna aceita qualquer string (e um JSON no
    banco, nao um tipo), e um registro torto nao pode custar a tela inteira dos
    shorts. O pior caso aceitavel e o short voltar a ser a janela unica.

    >>> de_json('[{"inicio_seg": 0, "fim_seg": 30}]')
    [Segmento(inicio_seg=0.0, fim_seg=30.0)]
    >>> de_json('[]')
    []
    >>> de_json('nao e json')
    []
    >>> de_json([{"inicio_seg": 5, "fim_seg": 5.05}])
    []
    """
    if isinstance(bruto, str):
        try:
            bruto = json.loads(bruto or "[]")
        except (json.JSONDecodeError, TypeError):
            return []
    if not isinstance(bruto, list):
        return []

    segmentos: list[Segmento] = []
    for item in bruto:
        if not isinstance(item, dict):
            continue
        inicio = _numero(item.get("inicio_seg"))
        fim = _numero(item.get("fim_seg"))
        if inicio is None or fim is None:
            continue
        if fim - inicio < DURACAO_MINIMA_SEG:
            continue
        segmentos.append(Segmento(round(inicio, 3), round(fim, 3)))
    return segmentos[:MAX_SEGMENTOS]


def para_json(segmentos: list[Segmento]) -> str:
    """Os segmentos como a coluna os guarda. Lista vazia grava `[]`.

    >>> para_json([Segmento(0.0, 30.0)])
    '[{"inicio_seg": 0.0, "fim_seg": 30.0}]'
    >>> para_json([])
    '[]'
    """
    return json.dumps([s.para_dict() for s in segmentos])


def normalizar(bruto: object, *, limite_seg: float | None = None) -> list[Segmento]:
    """Os segmentos prontos para RENDERIZAR: sem lixo, cortados no fim do bruto.

    NAO ordena — a ordem da lista e a ordem em que toca, e reordenar aqui
    desfaria a decisao do operador em silencio.

    E caminho de LEITURA, e nao de escrita. Na escrita, encolher seria silencio:
    um segmento marcado fora do bruto sumiria e o operador receberia sucesso —
    por isso `atualizar_decisao` valida com `validar` antes, e recusa com 422.

    `limite_seg` e a duracao do bruto de HOJE. Aqui, um segmento que aponta para
    depois do fim do arquivo nao e erro do operador: e o bruto que foi regerado
    mais curto depois de os segmentos serem gravados. Encolher mantem a colagem,
    a legenda e a composicao contando a mesma duracao.

    >>> normalizar([{"inicio_seg": 45, "fim_seg": 60}, {"inicio_seg": 0, "fim_seg": 30}])
    [Segmento(inicio_seg=45.0, fim_seg=60.0), Segmento(inicio_seg=0.0, fim_seg=30.0)]
    >>> normalizar([{"inicio_seg": 10, "fim_seg": 99}], limite_seg=50)
    [Segmento(inicio_seg=10.0, fim_seg=50.0)]
    >>> normalizar([{"inicio_seg": 80, "fim_seg": 99}], limite_seg=50)
    []
    """
    segmentos = de_json(bruto)
    if limite_seg is None:
        return segmentos

    limite = _numero(limite_seg)
    if limite is None or limite <= 0:
        return segmentos

    cortados: list[Segmento] = []
    for segmento in segmentos:
        inicio = max(0.0, segmento.inicio_seg)
        fim = min(segmento.fim_seg, round(limite, 3))
        if fim - inicio >= DURACAO_MINIMA_SEG:
            cortados.append(Segmento(round(inicio, 3), round(fim, 3)))
    return cortados


def efetivos(segmentos: list[Segmento], *, inicio_seg: float, fim_seg: float) -> list[Segmento]:
    """Os segmentos que o short REALMENTE toca — os dele, ou a janela unica.

    O unico lugar onde "[] = a janela de sempre" e decidido. Todo o resto do
    modulo passa por aqui, e por isso nenhum chamador precisa saber da regra.

    >>> efetivos([], inicio_seg=10.0, fim_seg=40.0)
    [Segmento(inicio_seg=10.0, fim_seg=40.0)]
    >>> efetivos([Segmento(0.0, 5.0)], inicio_seg=10.0, fim_seg=40.0)
    [Segmento(inicio_seg=0.0, fim_seg=5.0)]
    """
    if segmentos:
        return segmentos
    return [Segmento(round(float(inicio_seg), 3), round(float(fim_seg), 3))]


def duracao_liquida(segmentos: list[Segmento], *, inicio_seg: float, fim_seg: float) -> float:
    """Quanto tempo de VIDEO o short tem — a soma do que toca, nao o span.

    A funcao que esta demanda inteira existe para que ninguem mais escreva
    `fim - inicio` e acerte por acidente.

    >>> duracao_liquida([], inicio_seg=10.0, fim_seg=40.0)
    30.0
    >>> duracao_liquida(
    ...     [Segmento(0.0, 30.0), Segmento(45.0, 60.0)], inicio_seg=0.0, fim_seg=60.0
    ... )
    45.0
    """
    return round(
        sum(s.duracao_seg for s in efetivos(segmentos, inicio_seg=inicio_seg, fim_seg=fim_seg)),
        3,
    )


def envelope(
    segmentos: list[Segmento], *, inicio_seg: float, fim_seg: float
) -> tuple[float, float]:
    """De onde a onde no BRUTO este short pega — o menor inicio e o maior fim.

    E o que `Short.inicio_seg`/`fim_seg` continuam guardando, e o que responde
    "onde no bruto isto fica" (a regua, a janela de deteccao de rosto). Com ordem
    livre, o primeiro da lista nao e o mais cedo — daí `min`/`max` e nao `[0]`.

    >>> envelope([Segmento(45.0, 60.0), Segmento(0.0, 30.0)], inicio_seg=0.0, fim_seg=60.0)
    (0.0, 60.0)
    >>> envelope([], inicio_seg=10.0, fim_seg=40.0)
    (10.0, 40.0)
    """
    usados = efetivos(segmentos, inicio_seg=inicio_seg, fim_seg=fim_seg)
    return (
        round(min(s.inicio_seg for s in usados), 3),
        round(max(s.fim_seg for s in usados), 3),
    )


def para_ffmpeg(
    segmentos: list[Segmento], *, inicio_seg: float, fim_seg: float
) -> list[tuple[float, float]]:
    """Os pares `(inicio, fim)` na ordem de toque, como o ffmpeg os quer.

    >>> para_ffmpeg([Segmento(45.0, 60.0), Segmento(0.0, 30.0)], inicio_seg=0.0, fim_seg=60.0)
    [(45.0, 60.0), (0.0, 30.0)]
    """
    return [
        (s.inicio_seg, s.fim_seg)
        for s in efetivos(segmentos, inicio_seg=inicio_seg, fim_seg=fim_seg)
    ]


def com_offsets(
    segmentos: list[Segmento], *, inicio_seg: float, fim_seg: float
) -> list[tuple[Segmento, float]]:
    """Cada segmento com o instante do SHORT em que ele comeca.

    O coracao do remapeamento. O tempo do short cresce na ordem da LISTA — e por
    isso a ordem livre funciona sem caso especial: o segundo segmento comeca onde
    o primeiro acabou, seja ele anterior ou posterior no bruto.

    >>> [(s.inicio_seg, off) for s, off in com_offsets(
    ...     [Segmento(45.0, 60.0), Segmento(0.0, 30.0)], inicio_seg=0.0, fim_seg=60.0
    ... )]
    [(45.0, 0.0), (0.0, 15.0)]
    """
    pares: list[tuple[Segmento, float]] = []
    acumulado = 0.0
    for segmento in efetivos(segmentos, inicio_seg=inicio_seg, fim_seg=fim_seg):
        pares.append((segmento, round(acumulado, 3)))
        acumulado += segmento.duracao_seg
    return pares


def no_bruto(
    segundo_no_short: float,
    segmentos: list[Segmento],
    *,
    inicio_seg: float,
    fim_seg: float,
) -> float:
    """Onde no BRUTO esta um instante do short.

    Serve a quem precisa de um frame: a capa, a miniatura, o player. Fora das
    bordas, gruda na ponta mais proxima em vez de levantar — quem pede um frame
    sempre prefere o primeiro ou o ultimo a um erro.

    >>> segs = [Segmento(45.0, 60.0), Segmento(0.0, 30.0)]
    >>> no_bruto(5.0, segs, inicio_seg=0.0, fim_seg=60.0)
    50.0
    >>> no_bruto(20.0, segs, inicio_seg=0.0, fim_seg=60.0)
    5.0
    >>> no_bruto(999.0, segs, inicio_seg=0.0, fim_seg=60.0)
    30.0
    """
    alvo = _numero(segundo_no_short) or 0.0
    pares = com_offsets(segmentos, inicio_seg=inicio_seg, fim_seg=fim_seg)
    for segmento, offset in pares:
        if alvo < offset + segmento.duracao_seg:
            dentro = max(0.0, alvo - offset)
            return round(segmento.inicio_seg + dentro, 3)
    ultimo, _ = pares[-1]
    return round(ultimo.fim_seg, 3)


class SegmentosInvalidos(ValueError):
    """O que o operador mandou nao monta um short.

    Excecao propria, e nao `ValueError` cru, para o router poder devolver 422 com
    a frase que explica o problema em vez de um 500 sem texto.
    """


def validar(segmentos: list[Segmento], *, limite_seg: float) -> None:
    """Recusa o que nao da para renderizar, com a frase que diz o porque.

    O que NAO e recusado, de proposito: buraco (e o ponto da demanda),
    sobreposicao e ordem fora do relogio (sao escolhas editoriais desta
    demanda). O que e recusado e o que viraria render perdido.

    Segmento bom passa calado; o resto levanta `SegmentosInvalidos` com a frase
    pronta para a tela (os casos de recusa estao em
    `tests/domain/test_segmentos_short_d604.py`, porque o nome qualificado da
    excecao num doctest amarra o teste ao caminho de import do modulo).

    >>> validar([Segmento(0.0, 30.0)], limite_seg=60.0)
    >>> validar([Segmento(45.0, 60.0), Segmento(0.0, 30.0)], limite_seg=60.0)
    """
    if not segmentos:
        raise SegmentosInvalidos("Um short precisa de pelo menos um segmento.")
    if len(segmentos) > MAX_SEGMENTOS:
        raise SegmentosInvalidos(
            f"São {len(segmentos)} segmentos, e o limite é {MAX_SEGMENTOS} — "
            "acima disso a colagem deixa de ser um short."
        )
    for indice, segmento in enumerate(segmentos, start=1):
        if segmento.duracao_seg < DURACAO_MINIMA_SEG:
            raise SegmentosInvalidos(
                f"O segmento {indice} tem {segmento.duracao_seg}s — "
                f"abaixo de {DURACAO_MINIMA_SEG}s não é um trecho, é arredondamento."
            )
        if segmento.inicio_seg < 0:
            raise SegmentosInvalidos(f"O segmento {indice} começa antes do início do bruto.")
        if segmento.fim_seg > round(limite_seg, 3) + DURACAO_MINIMA_SEG:
            raise SegmentosInvalidos(
                f"O segmento {indice} ({segmento.inicio_seg}s a {segmento.fim_seg}s) "
                f"passa do fim do bruto, que tem {round(limite_seg, 1)}s."
            )
