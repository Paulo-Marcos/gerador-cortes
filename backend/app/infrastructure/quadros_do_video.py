"""Ler quadros do bruto do corte: rostos, medidas e recortes (D-929).

Os três verbos de que os quadros da capa precisam, via OpenCV: onde há rosto
em cada instante, como é a região do apresentador num instante (nitidez,
miniatura) e o recorte ampliado que vai ao ChatGPT. Nenhuma decisão mora aqui —
qual rosto é o apresentador e quais quadros vão é de
`domain/canal/quadros_do_apresentador`.

## Por que o quadro inteiro, sem reduzir

O detector do short (`detector_rosto`) reduz o quadro a 640px porque lá o rosto
é o assunto do quadro. Aqui ele mora numa webcam de canto: num bruto 1280x720
o rosto tem ~120px, e reduzido à metade beira o mínimo do Haar. Medido no corte
da prova (0d624bfc): ~80 ms por quadro inteiro, menos de três segundos para os
vinte e oito quadros de uma capa.

O cv2 e o cascade são os do detector do short (`detector_rosto`): carregar o
mesmo XML duas vezes não ganharia nada.

Tudo síncrono e bloqueante: quem chama roda numa thread (`asyncio.to_thread`).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from app.domain.canal.quadros_do_apresentador import Caixa, QuadroCandidato
from app.infrastructure.detector_rosto import (
    DeteccaoIndisponivel,
    _carregar_cascata,
    _importar_cv2,
)

logger = logging.getLogger(__name__)

# O menor rosto que interessa, em fração da largura: a webcam de canto deixa o
# rosto bem menor que no short (onde o mínimo é 0.06).
_ROSTO_MINIMO = 0.03
# A miniatura que compara quadros: pequena o bastante para ignorar ruído de
# compressão, grande o bastante para ver boca e olhos mudarem.
_LADO_DA_ASSINATURA = 16
_QUALIDADE_JPEG = 92


class VideoIlegivel(DeteccaoIndisponivel):
    """O OpenCV não abriu o vídeo — o robô volta ao banco de fotos."""


def _abrir(video: Path):
    cv2 = _importar_cv2()
    captura = cv2.VideoCapture(str(video))
    if not captura.isOpened():
        raise VideoIlegivel(f"OpenCV não conseguiu abrir {video.name}")
    return cv2, captura


def _ler(cv2, captura, segundo: float):
    captura.set(cv2.CAP_PROP_POS_MSEC, max(0.0, segundo) * 1000)
    ok, quadro = captura.read()
    return quadro if ok and quadro is not None else None


def _rostos(cinza) -> list[tuple[int, int, int, int]]:
    largura = cinza.shape[1]
    minimo = max(20, int(largura * _ROSTO_MINIMO))
    achados = _carregar_cascata().detectMultiScale(
        cinza, scaleFactor=1.1, minNeighbors=5, minSize=(minimo, minimo)
    )
    return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in achados]


def _cinza(cv2, quadro):
    # Equalizar tira o contraluz da janela atrás da webcam (o mesmo do detector).
    return cv2.equalizeHist(cv2.cvtColor(quadro, cv2.COLOR_BGR2GRAY))


def proporcao(video: Path) -> float:
    """Largura/altura do quadro, em pixels."""
    cv2, captura = _abrir(video)
    try:
        altura = captura.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0
        return float(captura.get(cv2.CAP_PROP_FRAME_WIDTH) / altura) if altura else 0.0
    finally:
        captura.release()


def rostos_nos_instantes(video: Path, instantes: list[float]) -> list[list[Caixa]]:
    """Os rostos de cada instante, em frações do quadro; quadro ilegível vem vazio."""
    cv2, captura = _abrir(video)
    try:
        resultado: list[list[Caixa]] = []
        for segundo in instantes:
            quadro = _ler(cv2, captura, segundo)
            if quadro is None:
                resultado.append([])
                continue
            altura, largura = quadro.shape[:2]
            resultado.append(
                [
                    Caixa(x / largura, y / altura, w / largura, h / altura)
                    for (x, y, w, h) in _rostos(_cinza(cv2, quadro))
                ]
            )
        return resultado
    finally:
        captura.release()


def _em_pixels(regiao: Caixa, largura: int, altura: int) -> tuple[int, int, int, int]:
    x0, y0 = int(regiao.x * largura), int(regiao.y * altura)
    x1 = min(largura, int((regiao.x + regiao.largura) * largura))
    y1 = min(altura, int((regiao.y + regiao.altura) * altura))
    return x0, y0, x1, y1


def medir_candidatos(video: Path, instantes: list[float], regiao: Caixa) -> list[QuadroCandidato]:
    """Cada instante legível medido dentro da região do apresentador."""
    cv2, captura = _abrir(video)
    try:
        candidatos: list[QuadroCandidato] = []
        for segundo in instantes:
            quadro = _ler(cv2, captura, segundo)
            if quadro is None:
                continue
            x0, y0, x1, y1 = _em_pixels(regiao, quadro.shape[1], quadro.shape[0])
            recorte = _cinza(cv2, quadro[y0:y1, x0:x1])
            if recorte.size == 0:
                continue
            miniatura = cv2.resize(
                recorte, (_LADO_DA_ASSINATURA, _LADO_DA_ASSINATURA), interpolation=cv2.INTER_AREA
            )
            candidatos.append(
                QuadroCandidato(
                    instante=segundo,
                    nitidez=float(cv2.Laplacian(recorte, cv2.CV_64F).var()),
                    assinatura=tuple(float(v) / 255 for v in miniatura.flatten()),
                    tem_rosto=bool(_rostos(recorte)),
                )
            )
        return candidatos
    finally:
        captura.release()


def salvar_recortes(
    video: Path,
    instantes: list[float],
    regiao: Caixa,
    pasta: Path,
    ampliacao: Callable[[int, int], float],
) -> list[Path]:
    """Os recortes ampliados (lanczos) em `pasta`, um JPEG por instante legível."""
    cv2, captura = _abrir(video)
    try:
        salvos: list[Path] = []
        for numero, segundo in enumerate(instantes, start=1):
            quadro = _ler(cv2, captura, segundo)
            if quadro is None:
                continue
            x0, y0, x1, y1 = _em_pixels(regiao, quadro.shape[1], quadro.shape[0])
            recorte = quadro[y0:y1, x0:x1]
            fator = ampliacao(x1 - x0, y1 - y0)
            ampliado = cv2.resize(
                recorte,
                (round((x1 - x0) * fator), round((y1 - y0) * fator)),
                interpolation=cv2.INTER_LANCZOS4,
            )
            destino = pasta / f"quadro-da-live-{numero}.jpg"
            if cv2.imwrite(str(destino), ampliado, [cv2.IMWRITE_JPEG_QUALITY, _QUALIDADE_JPEG]):
                salvos.append(destino)
        return salvos
    finally:
        captura.release()
