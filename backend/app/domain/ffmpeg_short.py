"""Comandos FFmpeg do short vertical (D-466).

Três passos, e a ordem entre eles não é arbitrária:

  1. **recorte + reenquadramento + grade** — extrai o trecho do bruto, corta o
     9:16 e aplica o filtro cinematográfico numa passada só;
  2. o Remotion desenha a camada de cenas e legenda (ProRes 4444 com alpha);
  3. **composição** — a camada entra por cima do vídeo.

Por que a grade vem ANTES do overlay: o filtro mexe em curva, saturação e
vinheta. Aplicado depois, ele mexeria também no texto da legenda — que foi
desenhado já na cor certa. É o mesmo motivo pelo qual o pipeline horizontal
grada antes de sobrepor os cards.

Por que o `-ss` vem antes do `-i`: seek por keyframe, que é ordens de grandeza
mais rápido que decodificar o bruto inteiro até o ponto do corte.

Sem I/O: só monta argv.
"""

from __future__ import annotations

from pathlib import Path

from app.domain.cinema_filters import get_filtro_vf
from app.domain.formato_video import HORIZONTAL, VERTICAL, Resolucao, filtro_reenquadrar

# ProRes 4444 é o único codec com alpha que o overlay do Remotion entrega de
# forma confiável neste projeto — VP9/.webm foi testado e não funciona.
CODEC_OVERLAY = "prores_ks"


def build_recorte_vertical_cmd(
    entrada: Path,
    saida: Path,
    *,
    inicio_seg: float,
    duracao_seg: float,
    foco_x: float = 0.5,
    filtro: str | None = "cinematic_iii",
    origem: Resolucao = HORIZONTAL,
    destino: Resolucao = VERTICAL,
    crf: int = 18,
) -> list[str]:
    """Extrai o trecho do bruto já em 9:16 e com o filtro aplicado.

    Exemplo:
        >>> cmd = build_recorte_vertical_cmd(
        ...     Path("bruto.mkv"), Path("base.mp4"),
        ...     inicio_seg=10.0, duracao_seg=30.0, filtro=None,
        ... )
        >>> cmd[:5]
        ['ffmpeg', '-y', '-hide_banner', '-ss', '10.0']
        >>> "crop=608:1080:656:0,scale=1080:1920,setsar=1" in cmd[cmd.index("-vf") + 1]
        True
    """
    cadeia = [filtro_reenquadrar(origem, destino, foco_x)]
    grade = get_filtro_vf(filtro) if filtro else None
    if grade:
        cadeia.append(grade)

    return [
        "ffmpeg",
        "-y",
        "-hide_banner",
        # Seek ANTES do -i: por keyframe, sem decodificar o bruto inteiro.
        "-ss",
        str(inicio_seg),
        "-i",
        str(entrada),
        "-t",
        str(duracao_seg),
        "-vf",
        ",".join(cadeia),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        str(crf),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(saida),
    ]


def build_composicao_short_cmd(
    base: Path,
    overlay: Path,
    saida: Path,
    *,
    crf: int = 18,
) -> list[str]:
    """Sobrepõe a camada do Remotion ao vídeo e fecha o MP4 de publicação.

    `eof_action=pass` mantém o vídeo rodando quando a camada acaba antes — o
    short segue até o fim mesmo que a última cena termine no meio.

    `-shortest` fecha no fim do mais curto: sem ele, uma camada mais longa que o
    vídeo esticaria o arquivo com quadros parados (a lição da base preta
    infinita, anotada no diagnóstico de render).

    Exemplo:
        >>> cmd = build_composicao_short_cmd(Path("b.mp4"), Path("o.mov"), Path("f.mp4"))
        >>> cmd.count("-i")
        2
        >>> "-shortest" in cmd
        True
    """
    return [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-i",
        str(base),
        "-i",
        str(overlay),
        "-filter_complex",
        "[0:v][1:v]overlay=x=0:y=0:eof_action=pass:format=auto[v]",
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        str(crf),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-shortest",
        "-movflags",
        "+faststart",
        str(saida),
    ]
