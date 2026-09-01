"""Domínio puro da transcrição fiel — palavras com tempo (D-461).

Legenda de short é o oposto de legenda de vídeo longo: 85% das visualizações
acontecem no mudo, então o texto NÃO é acessibilidade, é o conteúdo. Isso muda
duas exigências:

  - o timing precisa ser POR PALAVRA (o realce acompanha quem fala);
  - a grafia precisa estar certa (erro de auto-legenda vira erro na tela).

Este módulo define o contrato — `Palavra` — e sabe montá-lo a partir de
QUALQUER fonte: o ASR local (grafia melhor) ou a auto-legenda do YouTube que o
`json3_parser` já entrega. Quem consome não precisa saber de onde veio.

Sem I/O: a escolha da fonte vive no serviço, o modelo pesado na infraestrutura.
"""

from __future__ import annotations

from dataclasses import dataclass

# Quando a fonte não informa o fim da palavra (o json3 só traz o início), este é
# o fôlego que damos à última de cada bloco. Palavra falada raramente passa
# disso, e um valor curto evita que o realce fique preso no fim da frase.
_DURACAO_PADRAO_SEG = 0.4


@dataclass(frozen=True)
class Palavra:
    """Uma palavra e a janela em que ela é falada, na timeline do bruto."""

    texto: str
    inicio_seg: float
    fim_seg: float

    @property
    def duracao_seg(self) -> float:
        """Exemplo:
        >>> round(Palavra("oi", 1.0, 1.5).duracao_seg, 2)
        0.5
        """
        return round(self.fim_seg - self.inicio_seg, 3)


def normalizar_palavras(brutas: list[dict]) -> list[Palavra]:
    """Converte dicionários de qualquer fonte em `Palavra`, com fim garantido.

    Aceita `fim_seg`/`fim`/`end` quando a fonte informa; quando não informa (o
    caso do json3), o fim de cada palavra é o início da seguinte — assim o
    realce não deixa buraco entre uma palavra e outra.

    Exemplo:
        >>> palavras = normalizar_palavras(
        ...     [{"texto": "olá", "inicio_seg": 1.0}, {"texto": "mundo", "inicio_seg": 1.3}]
        ... )
        >>> [(p.texto, p.inicio_seg, p.fim_seg) for p in palavras]
        [('olá', 1.0, 1.3), ('mundo', 1.3, 1.7)]
    """
    limpas = [item for item in (_ler(bruta) for bruta in brutas) if item is not None]
    limpas.sort(key=lambda item: item[1])

    palavras: list[Palavra] = []
    for indice, (texto, inicio, fim) in enumerate(limpas):
        proximo_inicio = limpas[indice + 1][1] if indice + 1 < len(limpas) else None
        palavras.append(
            Palavra(
                texto=texto,
                inicio_seg=round(inicio, 3),
                fim_seg=round(_fim_de(inicio, fim, proximo_inicio), 3),
            )
        )
    return palavras


def _ler(bruta: dict) -> tuple[str, float, float | None] | None:
    """`(texto, inicio, fim|None)` ou `None` quando o item não é palavra."""
    if not isinstance(bruta, dict):
        return None
    texto = str(bruta.get("texto") or bruta.get("word") or "").strip()
    if not texto:
        return None
    inicio = _numero(bruta.get("inicio_seg", bruta.get("inicio", bruta.get("start"))))
    if inicio is None:
        return None
    return (
        texto,
        max(0.0, inicio),
        _numero(bruta.get("fim_seg", bruta.get("fim", bruta.get("end")))),
    )


def _fim_de(inicio: float, fim: float | None, proximo_inicio: float | None) -> float:
    if fim is not None and fim > inicio:
        return fim
    if proximo_inicio is not None and proximo_inicio > inicio:
        return proximo_inicio
    return inicio + _DURACAO_PADRAO_SEG


def _numero(valor: object) -> float | None:
    try:
        return float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def palavras_de_segmentos(segmentos: list[dict]) -> list[Palavra]:
    """Extrai as palavras de uma transcrição no formato do `json3_parser`.

    É o caminho de retaguarda: sem ASR local, a auto-legenda do YouTube já traz
    `palavras` com `inicio_seg` por palavra (D-337). A grafia é pior, mas o
    timing serve — e legenda com grafia imperfeita ainda é melhor que nenhuma.

    Exemplo:
        >>> segs = [{"palavras": [{"texto": "olá", "inicio_seg": 0.5}]}]
        >>> [p.texto for p in palavras_de_segmentos(segs)]
        ['olá']
    """
    brutas: list[dict] = []
    for segmento in segmentos:
        if not isinstance(segmento, dict):
            continue
        brutas.extend(p for p in segmento.get("palavras", []) or [] if isinstance(p, dict))
    return normalizar_palavras(brutas)


def recortar(palavras: list[Palavra], inicio_seg: float, fim_seg: float) -> list[Palavra]:
    """As palavras do intervalo, REBASEADAS para começar no zero do short.

    O short vira um arquivo próprio, cujo tempo zero é o `inicio_seg` do recorte.
    Manter o tempo do bruto aqui faria a legenda aparecer minutos depois do que
    devia — o mesmo tipo de erro que a `transcricao_final` já resolveu no corte.

    Exemplo:
        >>> palavras = [Palavra("a", 10.0, 10.4), Palavra("b", 11.0, 11.5)]
        >>> [(p.texto, p.inicio_seg) for p in recortar(palavras, 10.5, 12.0)]
        [('b', 0.5)]
    """
    return [
        Palavra(
            texto=p.texto,
            inicio_seg=round(max(0.0, p.inicio_seg - inicio_seg), 3),
            fim_seg=round(min(p.fim_seg, fim_seg) - inicio_seg, 3),
        )
        for p in palavras
        if p.inicio_seg >= inicio_seg and p.inicio_seg < fim_seg
    ]
