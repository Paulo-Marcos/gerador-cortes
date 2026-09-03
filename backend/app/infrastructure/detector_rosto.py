"""Detecção de rosto em quadros de um vídeo, via OpenCV (D-477).

Infraestrutura pura de leitura: abre o arquivo, pula para os instantes pedidos,
detecta, devolve frações. Nenhuma decisão sobre enquadramento mora aqui — isso é
de `domain/enquadramento_rosto`.

## Por que Haar, e por que o `alt2`

O cv2 já vem no projeto (via `scenedetect[opencv]`) e traz os cascades Haar
embutidos. Uma rede neural acertaria mais, mas exigiria baixar pesos e uma
dependência nova — caro para um app pessoal cujo caso é sempre o mesmo: uma
pessoa falando de frente para a webcam, bem iluminada, ocupando boa parte do
quadro. É o cenário em que Haar funciona.

Entre os cascades, `alt2` — medido no quadro real que motivou a demanda:

    default : 2 rostos em 325ms  (o certo, mais um retrato na parede)
    alt2    : 1 rosto  em  74ms  (só o certo)

Quatro vezes mais rápido e sem o falso positivo. O `maior rosto vence` do domínio
cobriria aquele falso, mas não precisar dele é melhor.

## Por que reduzir o quadro antes de detectar

O custo do Haar cresce com a área. Um bruto 1080p reduzido para 640px de largura
ainda tem o rosto com ~200px de lado — muito acima do mínimo — e detecta em uma
fração do tempo. As coordenadas voltam em FRAÇÃO da largura, então a redução é
invisível para quem chama.
"""

from __future__ import annotations

import asyncio
import logging
from functools import lru_cache
from pathlib import Path

from app.domain.enquadramento_rosto import RostoDetectado

logger = logging.getLogger(__name__)

# Largura de trabalho. Acima disto o ganho de acerto não paga o tempo; abaixo, o
# rosto começa a ficar perto do tamanho mínimo detectável.
_LARGURA_DE_ANALISE = 640

# O menor rosto que interessa, em fração da largura. Abaixo disso é plateia,
# miniatura num slide, ou ruído — nunca o apresentador.
_ROSTO_MINIMO = 0.06

_CASCADE = "haarcascade_frontalface_alt2.xml"


class DeteccaoIndisponivel(RuntimeError):
    """Sem OpenCV ou sem o arquivo — quem chama degrada, não quebra."""


async def detectar_nos_instantes(video: Path, instantes: list[float]) -> list[list[RostoDetectado]]:
    """Os rostos de cada instante pedido, na mesma ordem.

    Devolve uma lista por instante — vazia quando o quadro não tem rosto (ou não
    pôde ser lido). Manter o buraco na lista é o que permite ao domínio saber em
    quantos quadros ele NÃO achou, que é metade da decisão.

    Roda numa thread: o cv2 é síncrono e bloqueante, e segurar o event loop por
    segundos deixaria o backend inteiro parado — este projeto já pagou por um
    `print` bloqueado num pipe.
    """
    if not instantes:
        return []
    return await asyncio.to_thread(_detectar, video, instantes)


def _detectar(video: Path, instantes: list[float]) -> list[list[RostoDetectado]]:
    cv2 = _importar_cv2()
    cascata = _carregar_cascata()

    captura = cv2.VideoCapture(str(video))
    if not captura.isOpened():
        raise DeteccaoIndisponivel(f"OpenCV nao conseguiu abrir {video.name}")

    try:
        return [_rostos_em(cv2, cascata, captura, segundo) for segundo in instantes]
    finally:
        captura.release()


def _rostos_em(cv2, cascata, captura, segundo: float) -> list[RostoDetectado]:
    captura.set(cv2.CAP_PROP_POS_MSEC, max(0.0, segundo) * 1000)
    ok, quadro = captura.read()
    if not ok or quadro is None:
        # Quadro ilegível não é erro do fluxo: o vídeo pode ter acabado antes do
        # que o banco diz. Vira um quadro sem rosto, e o domínio conta isso.
        logger.debug("[Rosto] quadro em %.2fs nao pode ser lido", segundo)
        return []

    altura, largura = quadro.shape[:2]
    if largura <= 0:
        return []

    escala = min(1.0, _LARGURA_DE_ANALISE / largura)
    if escala < 1.0:
        quadro = cv2.resize(quadro, (int(largura * escala), int(altura * escala)))

    cinza = cv2.cvtColor(quadro, cv2.COLOR_BGR2GRAY)
    # Equalizar tira o efeito de contraluz — o caso comum de webcam com janela
    # atrás, em que o rosto fica escuro e o cascade não fecha.
    cinza = cv2.equalizeHist(cinza)

    trabalho = cinza.shape[1]
    minimo = max(20, int(trabalho * _ROSTO_MINIMO))
    achados = cascata.detectMultiScale(
        cinza, scaleFactor=1.1, minNeighbors=5, minSize=(minimo, minimo)
    )

    # `float()` explicito: o cv2 devolve numpy, e um `np.float64` atravessaria
    # tudo (ele e subclasse de float, entao ate o JSON aceita) so para aparecer
    # como `np.float64(0.8047)` no log e desmentir a anotacao do dataclass.
    return [
        RostoDetectado(
            centro_x=round(float(x + w / 2) / trabalho, 4),
            largura=round(float(w) / trabalho, 4),
        )
        for (x, _y, w, _h) in achados
    ]


def _importar_cv2():
    try:
        import cv2  # noqa: PLC0415 — import tardio: o cv2 custa ~1s para carregar
    except ImportError as exc:  # pragma: no cover — o cv2 vem com o projeto
        raise DeteccaoIndisponivel("OpenCV nao esta instalado") from exc
    return cv2


@lru_cache(maxsize=1)
def _carregar_cascata():
    """O classificador, carregado uma vez.

    Ler o XML a cada chamada custaria mais que a detecção em si — e ele nunca
    muda: vem embutido no pacote do cv2.
    """
    cv2 = _importar_cv2()
    caminho = Path(cv2.data.haarcascades) / _CASCADE
    cascata = cv2.CascadeClassifier(str(caminho))
    if cascata.empty():
        raise DeteccaoIndisponivel(f"cascade {_CASCADE} nao carregou de {caminho}")
    return cascata
