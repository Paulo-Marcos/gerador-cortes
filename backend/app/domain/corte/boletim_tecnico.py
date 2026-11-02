"""O boletim técnico do corte: a saúde do vídeo medida, sem IA (D-1015).

O operador aprova um corte olhando e ouvindo. O que o olho e o ouvido pegam mal
é justamente o que se mede bem: volume, pico, imagem que parou, emenda que
estala. Este módulo é a parte que JULGA — recebe números já medidos (o FFmpeg
mora em `infrastructure/`) e devolve o que merece aviso.

Duas regras de convivência:

- O boletim **avisa e nunca bloqueia**: quem decide publicar é o operador.
- -14 LUFS (±1) e pico até -1 dBTP são **convenção** de mercado, não requisito
  publicado pelas plataformas. A tela diz isso em português simples.

Módulo puro: aritmética e texto. Sem I/O, banco nem FFmpeg.
"""

from __future__ import annotations

import math
import re
from collections.abc import Sequence
from dataclasses import dataclass

# Convenção de volume (não é exigência de plataforma alguma).
LUFS_ALVO = -14.0
LUFS_TOLERANCIA = 1.0
PICO_MAXIMO_DBTP = -1.0

# Imagem parada (D-1009): em escala 320x180, um pixel "mudou" quando a diferença
# em cinza passa de 6; o quadro está PARADO quando no máximo 3 pixels mudaram.
MUDANCA_MINIMA_EM_CINZA = 6
PIXELS_QUE_PODEM_MUDAR = 3
PARADA_MINIMA_SEG = 0.33

# Emenda "com som dos dois lados": os dois lados acima deste nível. É só aí que
# o degrau de amostra vira estalo audível; emenda em silêncio não estala.
SOM_MINIMO_DBFS = -40.0
# Largura da janela de cada lado da emenda para medir o nível.
JANELA_DA_EMENDA_SEG = 0.05
# O instante de uma emenda vem de soma de durações e tem folga de até um quadro
# (1/30 s) para cada lado: o degrau é procurado nessa folga, não numa amostra só.
TOLERANCIA_DO_INSTANTE_SEG = 0.04

# Uma emenda precisa de dois trechos; com um só não há costura.
_MIN_TRECHOS_PARA_EMENDA = 2

ORIGEM_LIVE = "live"
ORIGEM_RENDER = "render"
ORIGEM_NAO_VERIFICADA = "nao_verificada"


@dataclass(frozen=True)
class Volume:
    integrado_lufs: float
    pico_dbtp: float
    lra_lu: float


@dataclass(frozen=True)
class Parada:
    inicio_seg: float
    duracao_seg: float


@dataclass(frozen=True)
class Emenda:
    tempo_seg: float
    com_som_dos_dois_lados: bool
    degrau: float | None
    acima_do_p99: bool


_NUMERO = r"(-?\d+(?:\.\d+)?|-?inf)"


def ler_resumo_ebur128(saida: str) -> Volume | None:
    """Volume do bloco `Summary:` que o `ebur128` imprime ao fim da análise.

    Só o resumo vale: as linhas de cada 100 ms trazem o parcial, e o último
    parcial não é o integrado. `None` quando o resumo não veio (arquivo sem
    áudio, FFmpeg interrompido).
    """
    posicao = saida.rfind("Summary:")
    if posicao < 0:
        return None
    resumo = saida[posicao:]
    integrado = re.search(rf"\bI:\s+{_NUMERO}\s+LUFS", resumo)
    lra = re.search(rf"\bLRA:\s+{_NUMERO}\s+LU\b", resumo)
    pico = re.search(rf"True peak:.*?Peak:\s+{_NUMERO}\s+dBFS", resumo, re.DOTALL)
    if not (integrado and lra and pico):
        return None
    volume = Volume(float(integrado.group(1)), float(pico.group(1)), float(lra.group(1)))
    # "-inf" é áudio mudo: não há número para mostrar.
    return (
        volume
        if all(map(math.isfinite, (volume.integrado_lufs, volume.pico_dbtp, volume.lra_lu)))
        else None
    )


def avisos_de_volume(volume: Volume) -> list[str]:
    """O que merece aviso no volume, em português simples."""
    avisos: list[str] = []
    desvio = volume.integrado_lufs - LUFS_ALVO
    if abs(desvio) > LUFS_TOLERANCIA:
        lado = "mais alto" if desvio > 0 else "mais baixo"
        avisos.append(
            f"Volume {lado} que a referência de {LUFS_ALVO:g} LUFS "
            f"({volume.integrado_lufs:.1f} LUFS)."
        )
    if volume.pico_dbtp > PICO_MAXIMO_DBTP:
        avisos.append(
            f"Pico de {volume.pico_dbtp:.1f} dBTP passa do teto de {PICO_MAXIMO_DBTP:g} dBTP: "
            "o som pode distorcer ao ser recodificado pela plataforma."
        )
    return avisos


def paradas_de_quadros(parado: Sequence[bool], fps: float) -> list[Parada]:
    """Transforma "este quadro é igual ao anterior" em paradas de imagem.

    `parado[i]` diz que o quadro i repete o i-1. Uma sequência de n repetições
    começando no quadro s é uma imagem que ficou parada de (s-1)/fps por n/fps —
    o quadro que repetiu já estava na tela. Só conta a partir de 0,33 s: menos
    que isso é frame duplicado normal, não travada.
    """
    if fps <= 0:
        return []
    paradas: list[Parada] = []
    inicio: int | None = None
    for i, repete in enumerate([*parado, False]):
        if repete and inicio is None:
            inicio = i
        elif not repete and inicio is not None:
            duracao = (i - inicio) / fps
            if duracao >= PARADA_MINIMA_SEG:
                paradas.append(Parada(round((inicio - 1) / fps, 3), round(duracao, 3)))
            inicio = None
    return paradas


def origem_da_parada(parada: Parada, paradas_do_bruto: Sequence[Parada] | None) -> str:
    """De onde a parada veio: da live, do render, ou não dá para saber.

    O `ffprobe` não responde isso (fps e carimbos de tempo ficam regulares): só
    comparar o MESMO instante no bruto responde. Se o bruto já estava parado
    ali, a imagem chegou assim da live; se estava em movimento, foi o render.
    `paradas_do_bruto=None` é "o bruto não está mais no disco".
    """
    if paradas_do_bruto is None:
        return ORIGEM_NAO_VERIFICADA
    fim = parada.inicio_seg + parada.duracao_seg
    sobreposto = sum(
        max(0.0, min(fim, p.inicio_seg + p.duracao_seg) - max(parada.inicio_seg, p.inicio_seg))
        for p in paradas_do_bruto
    )
    return ORIGEM_LIVE if sobreposto >= parada.duracao_seg / 2 else ORIGEM_RENDER


def instantes_das_emendas(duracoes_seg: Sequence[float], duracao_real_seg: float) -> list[float]:
    """Onde cada emenda cai no vídeo final.

    As emendas são as fronteiras entre os trechos do bruto, na soma das durações.
    O vídeo real raramente fecha exato com a soma (o bruto arredonda em quadros),
    então a deriva é espalhada proporcionalmente em vez de empilhada no fim.
    """
    total = sum(duracoes_seg)
    if len(duracoes_seg) < _MIN_TRECHOS_PARA_EMENDA or total <= 0 or duracao_real_seg <= 0:
        return []
    escala = duracao_real_seg / total
    instantes: list[float] = []
    acumulado = 0.0
    for duracao in list(duracoes_seg)[:-1]:
        acumulado += duracao
        instantes.append(round(acumulado * escala, 3))
    return instantes


def julgar_emenda(
    tempo_seg: float,
    nivel_antes_dbfs: float,
    nivel_depois_dbfs: float,
    degrau: float,
    p99_da_fala: float,
) -> Emenda:
    """A emenda é suspeita quando há som dos dois lados E o degrau passa do p99.

    `degrau` e `p99_da_fala` são fração da escala cheia (0 a 1). O p99 é o
    maior salto, numa janela de um quadro para cada lado, que 99% das janelas
    de fala do próprio corte não passam: emenda acima disso é salto que a fala
    normal não faz.
    """
    com_som = nivel_antes_dbfs > SOM_MINIMO_DBFS and nivel_depois_dbfs > SOM_MINIMO_DBFS
    if not com_som:
        return Emenda(tempo_seg, False, None, False)
    return Emenda(tempo_seg, True, round(degrau, 5), degrau > p99_da_fala)


@dataclass(frozen=True)
class ResumoDasEmendas:
    total: int
    com_som_dos_dois_lados: int
    acima_do_p99: int


def resumir_emendas(emendas: Sequence[Emenda]) -> ResumoDasEmendas:
    return ResumoDasEmendas(
        total=len(emendas),
        com_som_dos_dois_lados=sum(e.com_som_dos_dois_lados for e in emendas),
        acima_do_p99=sum(e.acima_do_p99 for e in emendas),
    )
