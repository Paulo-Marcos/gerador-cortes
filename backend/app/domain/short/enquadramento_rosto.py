"""Do rosto detectado ao enquadramento do short (D-477).

O recorte 9:16 precisa saber ONDE olhar na horizontal. Até aqui o padrão vinha do
`crop_facecam` do layout do corte (D-464) — que é estático, e só existe quando
alguém posicionou o corte. Sem isso, o recorte caía no centro do quadro, e numa
live em que a pessoa fica à direita o short saía com meio rosto.

Este módulo é a metade que decide. A detecção em si é da infraestrutura (cv2);
aqui mora o que fazer com ela, que é onde estão as escolhas que erram feio se
forem tomadas por acidente.

## Por que a MEDIANA, e não a média

Um falso positivo arrasta a média e não move a mediana. Isso não é teoria: no
frame real usado para validar esta demanda, o cascade `default` achou o rosto
(738px de lado) **e um retrato na parede** (153px). Com dois quadros bons e um
falso, a média já enquadra o vazio.

## Por que o MAIOR rosto de cada quadro

Numa live com tela compartilhada aparecem rostos que não são o do apresentador:
a foto num slide, alguém num vídeo sendo reagido. O apresentador é o que ocupa
mais pixels — não é uma regra estética, é o que distingue o assunto do cenário.

## Por que dizer "não sei"

Devolver 0.5 quando não se achou nada é indistinguível de ter decidido pelo
centro. O operador clicaria, veria o enquadramento no meio e concluiria que o
detector "achou que era ali". Sem detecção suficiente, a resposta é a ausência
de resposta, e a tela diz isso.

Sem I/O.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median

# Fração mínima dos quadros amostrados que precisa ter rosto para haver resposta.
#
# Um terço é folgado de propósito: numa fala real a pessoa vira o rosto, abaixa
# para ler, passa a mão. Exigir a maioria recusaria trechos perfeitamente
# enquadráveis; exigir um só aceitaria um único falso positivo como veredito.
FRACAO_MINIMA_DE_ACERTOS = 1 / 3

# Acima desta dispersão, um ponto fixo é um compromisso, não um enquadramento.
#
# 0.15 da largura ≈ 290px em 1920: a pessoa saiu de um terço e foi para outro. O
# enquadramento ainda é aplicado (é melhor que o centro), mas a tela avisa —
# calar aqui faria o operador culpar o detector por um vídeo em que ele andou.
DISPERSAO_QUE_INCOMODA = 0.15


@dataclass(frozen=True)
class RostoDetectado:
    """Um rosto num quadro, em frações da largura/altura (0 a 1).

    Frações e não pixels: quem detecta pode ter reduzido o quadro para ir mais
    rápido, e o consumidor não deveria precisar saber disso.
    """

    centro_x: float
    largura: float

    @property
    def area_relativa(self) -> float:
        """Serve só para ordenar — o rosto é quadrado no cascade."""
        return self.largura


@dataclass(frozen=True)
class Enquadramento:
    """O veredito do detector sobre um trecho.

    `foco_x` é `None` quando não houve detecção suficiente. Não é erro: é o
    detector dizendo que não viu, que é uma informação diferente de "está no
    meio".
    """

    foco_x: float | None
    quadros_analisados: int
    quadros_com_rosto: int
    dispersao: float
    motivo: str

    @property
    def achou(self) -> bool:
        return self.foco_x is not None

    @property
    def pessoa_se_move(self) -> bool:
        return self.achou and self.dispersao > DISPERSAO_QUE_INCOMODA


def decidir(quadros: list[list[RostoDetectado]]) -> Enquadramento:
    """O foco horizontal a partir das detecções de cada quadro amostrado.

    Exemplos:
        >>> um = lambda x: [RostoDetectado(centro_x=x, largura=0.3)]
        >>> decidir([um(0.6), um(0.62), um(0.61)]).foco_x
        0.61
        >>> decidir([[], [], []]).foco_x is None
        True
        >>> decidir([]).motivo
        'nenhum quadro foi analisado'
    """
    total = len(quadros)
    if total == 0:
        return Enquadramento(None, 0, 0, 0.0, "nenhum quadro foi analisado")

    centros = [_maior(q).centro_x for q in quadros if q]
    achados = len(centros)

    if achados < max(1, round(total * FRACAO_MINIMA_DE_ACERTOS)):
        return Enquadramento(
            None,
            total,
            achados,
            0.0,
            f"rosto em {achados} de {total} quadros — pouco para decidir o enquadramento",
        )

    foco = round(median(centros), 3)
    dispersao = round(max(centros) - min(centros), 3)
    return Enquadramento(
        foco_x=_limitar(foco),
        quadros_analisados=total,
        quadros_com_rosto=achados,
        dispersao=dispersao,
        motivo=f"rosto em {achados} de {total} quadros",
    )


def instantes(inicio_seg: float, fim_seg: float, quantidade: int) -> list[float]:
    """Os instantes a amostrar dentro da janela, sem tocar as bordas.

    As bordas ficam de fora porque é onde mora o corte: o primeiro quadro pode
    ser meio de uma transição, e o último pode já ser a fala seguinte. Amostrar
    ali é perguntar sobre um trecho que não é este.

    Exemplo:
        >>> instantes(10.0, 20.0, 4)
        [12.0, 14.0, 16.0, 18.0]
    """
    duracao = fim_seg - inicio_seg
    if duracao <= 0 or quantidade < 1:
        return []
    passo = duracao / (quantidade + 1)
    return [round(inicio_seg + passo * (i + 1), 3) for i in range(quantidade)]


def _maior(rostos: list[RostoDetectado]) -> RostoDetectado:
    return max(rostos, key=lambda r: r.area_relativa)


def _limitar(valor: float) -> float:
    return max(0.0, min(1.0, valor))
