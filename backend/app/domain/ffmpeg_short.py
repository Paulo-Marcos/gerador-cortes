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
from app.domain.formato_video import (
    HORIZONTAL,  # noqa: F401 — usado nos doctests; deixou de ser default na D-481
    VERTICAL,
    Resolucao,
    filtro_reenquadrar,
)
from app.domain.fundo_short import FUNDO_PADRAO as FUNDO_DE_ULTIMO_RECURSO
from app.domain.fundo_short import para_ffmpeg as fundo_ffmpeg
from app.domain.moldura_short import Faixa
from app.domain.palco_short import PlanoPalco, Recorte

# ProRes 4444 é o único codec com alpha que o overlay do Remotion entrega de
# forma confiável neste projeto — VP9/.webm foi testado e não funciona.
CODEC_OVERLAY = "prores_ks"

# O fundo do palco vertical: onde a tela compartilhada nao preenche o slot, e
# esta cor que aparece, e ela precisa pertencer ao canal, nao ser um preto
# qualquer.
#
# Ultimo recurso, so para quem chama sem escolher. O caminho de producao resolve
# na paleta do canal (D-499); o literal mora em `fundo_short`, para o valor nao
# existir em dois lugares e o canal poder trocar a paleta sem deixar um deles
# para tras.
FUNDO_PADRAO = fundo_ffmpeg(FUNDO_DE_ULTIMO_RECURSO)


def build_recorte_vertical_cmd(
    entrada: Path,
    saida: Path,
    *,
    inicio_seg: float,
    duracao_seg: float,
    foco_x: float = 0.5,
    filtro: str | None = "cinematic_iii",
    origem: Resolucao,
    destino: Resolucao = VERTICAL,
    crf: int = 18,
) -> list[str]:
    """Extrai o trecho do bruto já em 9:16 e com o filtro aplicado.

    `origem` é OBRIGATÓRIO e deve ser a resolução MEDIDA do arquivo. Ele já teve
    `HORIZONTAL` como default, e o default mentiu: num bruto 720p o crop saía
    608x1080 — mais alto que o quadro — e o ffmpeg abortava com -22 no meio do
    render (D-481). Medir é barato; presumir custou um render inteiro.

    Exemplo:
        >>> cmd = build_recorte_vertical_cmd(
        ...     Path("bruto.mkv"), Path("base.mp4"),
        ...     inicio_seg=10.0, duracao_seg=30.0, filtro=None, origem=HORIZONTAL,
        ... )
        >>> cmd[:5]
        ['ffmpeg', '-y', '-hide_banner', '-ss', '10.0']
        >>> "crop=608:1080:656:0,scale=1080:1920,setsar=1" in cmd[cmd.index("-vf") + 1]
        True

    Num bruto 720p a janela encolhe junto, em vez de estourar:
        >>> cmd = build_recorte_vertical_cmd(
        ...     Path("b.mkv"), Path("o.mp4"), inicio_seg=0.0, duracao_seg=5.0,
        ...     filtro=None, origem=Resolucao(1280, 720),
        ... )
        >>> cmd[cmd.index("-vf") + 1]
        'crop=404:720:438:0,scale=1080:1920,setsar=1'
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


def build_palco_vertical_cmd(
    entrada: Path,
    saida: Path,
    *,
    inicio_seg: float,
    duracao_seg: float,
    plano: PlanoPalco,
    moldura: list[Faixa] | None = None,
    fundo_cor: str = FUNDO_PADRAO,
    filtro: str | None = "cinematic_iii",
    crf: int = 18,
) -> list[str]:
    """Compõe o short num PALCO: fundo + regiões recortadas nos seus slots.

    A alternativa a `build_recorte_vertical_cmd`, e a razão de o palco existir:
    aquele copia uma janela do quadro cru e traz junto o chrome da live; este
    recorta só as regiões nomeadas, então o que ficou de fora não existe no
    resultado.

    O FILTRO roda sobre o quadro JÁ COMPOSTO, não região a região. Gradar cada
    pedaço separado deixaria a pessoa e a tela com curvas diferentes lado a lado
    — e a ordem que importa (grade antes do overlay do Remotion) fica intacta,
    porque o overlay é um passo depois, noutro comando.

    Exemplo (pessoa cheia, sem grade):
        >>> from app.domain.palco_short import montar_plano
        >>> plano = montar_plano(
        ...     "pessoa_cheia", {"pessoa": {"x": 24, "y": 410, "w": 340, "h": 260}}
        ... )
        >>> cmd = build_palco_vertical_cmd(
        ...     Path("b.mkv"), Path("o.mp4"),
        ...     inicio_seg=10.0, duracao_seg=30.0, plano=plano, filtro=None,
        ... )
        >>> print(cmd[cmd.index("-filter_complex") + 1])
        color=c=0x0f1410:s=1080x1920:r=30:d=30.0,format=rgba[palco];[0:v]crop=340:260:24:410,scale=2510:1920,crop=1080:1920:715:0,setsar=1,format=rgba[r0];[palco][r0]overlay=x=0:y=0:format=auto[comp];[comp]format=yuv420p[v]
    """
    partes = [
        # `d=` NAO e opcional: fonte `color` e infinita, e sem duracao o encode
        # so termina pelo -t — licao que este projeto ja pagou com um render de
        # base preta que nunca fechava.
        f"color=c={fundo_cor}:s={VERTICAL.largura}x{VERTICAL.altura}:r=30:"
        f"d={duracao_seg},format=rgba[palco]"
    ]

    acumulador = "[palco]"
    for indice, recorte in enumerate(plano.recortes):
        partes.append(f"[0:v]{_cadeia_do_recorte(recorte)}[r{indice}]")
        x, y = recorte.posicao
        saida_overlay = "[comp]" if indice == len(plano.recortes) - 1 else f"[c{indice}]"
        partes.append(f"{acumulador}[r{indice}]overlay=x={x}:y={y}:format=auto{saida_overlay}")
        acumulador = saida_overlay

    grade = get_filtro_vf(filtro) if filtro else None
    # A MOLDURA vai DEPOIS da grade, de proposito: ela e a cor do canal, e a
    # grade mexe em curva e saturacao. Gradada junto, a assinatura sairia num
    # verde diferente a cada filtro — e o operador nao teria como saber por que.
    cadeia_final = [grade] if grade else []
    cadeia_final.extend(_desenhar_faixa(faixa) for faixa in (moldura or []))
    cadeia_final.append("format=yuv420p")
    partes.append(f"[comp]{','.join(cadeia_final)}[v]")

    return [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-ss",
        str(inicio_seg),
        "-i",
        str(entrada),
        "-t",
        str(duracao_seg),
        "-filter_complex",
        # Sem quebra de linha: o parser de filtergraph do ffmpeg trata espaço em
        # branco como significativo em alguns pontos, e legibilidade não vale o risco.
        ";".join(partes),
        "-map",
        "[v]",
        # `?` porque bruto sem faixa de audio nao pode derrubar o render.
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
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(saida),
    ]


def _desenhar_faixa(faixa: Faixa) -> str:
    """Uma barra da moldura, opaca, sobre o quadro composto."""
    return f"drawbox=x={faixa.x}:y={faixa.y}:w={faixa.w}:h={faixa.h}:color={faixa.cor}@1.0:t=fill"


def _cadeia_do_recorte(recorte: Recorte) -> str:
    """crop da fonte → escala → (corte do excesso) → rgba, para um recorte."""
    crop = recorte.crop
    largura, altura = recorte.escala
    cadeia = [
        f"crop={int(crop['w'])}:{int(crop['h'])}:{int(crop['x'])}:{int(crop['y'])}",
        f"scale={largura}:{altura}",
    ]
    interno = recorte.corte_interno
    if interno:
        cadeia.append("crop={}:{}:{}:{}".format(*interno))
    cadeia.extend(["setsar=1", "format=rgba"])
    return ",".join(cadeia)


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
