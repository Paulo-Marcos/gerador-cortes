"""Escolha do codec de overlay (Remotion → arquivo intermediário).

Cada perfil define como o Remotion deve renderizar os chunks transparentes
e qual extensão de arquivo o resto do pipeline deve esperar.

**ProRes 4444 é o padrão e o único perfil suportado** (`AppSettings.render.
overlay_codec`). O overlay é um artefato INTERMEDIÁRIO, consumido pelo FFmpeg
na composição final e descartado depois: o encode no Remotion é rápido e o
FFmpeg lê o alpha do .mov de forma robusta com um `-i` simples. O tamanho maior
em disco não importa.

VP9 + alpha (.webm) continua no enum, mas não usar: nos testes deste pipeline
os overlays em .webm não funcionaram — o alpha exige o decoder `libvpx-vp9`
explícito para sobreviver, e o encode é muito mais lento. (D-678: este
docstring dizia o contrário, que VP9 era o padrão.)

Esta camada é pura: não conhece Remotion CLI, AppSettings, nem subprocess.
Apenas descreve as flags certas e a extensão de saída por perfil.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class OverlayCodec(StrEnum):
    VP9 = "vp9"
    PRORES_4444 = "prores_4444"


@dataclass(frozen=True)
class OverlayCodecProfile:
    """Tudo o que o orquestrador precisa saber sobre um perfil de overlay.

    - file_extension: extensão (com ponto) do artefato gerado.
    - remotion_args: flags que vão direto para `npx remotion render`.
    """

    codec: OverlayCodec
    file_extension: str
    remotion_args: tuple[str, ...]


_PERFIS: dict[OverlayCodec, OverlayCodecProfile] = {
    OverlayCodec.VP9: OverlayCodecProfile(
        codec=OverlayCodec.VP9,
        file_extension=".webm",
        remotion_args=(
            "--codec=vp9",
            "--image-format=png",
            "--pixel-format=yuva420p",
        ),
    ),
    OverlayCodec.PRORES_4444: OverlayCodecProfile(
        codec=OverlayCodec.PRORES_4444,
        file_extension=".mov",
        remotion_args=(
            "--codec=prores",
            "--prores-profile=4444",
            "--image-format=png",
            "--pixel-format=yuva444p10le",
        ),
    ),
}


def overlay_codec_profile(codec: OverlayCodec) -> OverlayCodecProfile:
    """Retorna o perfil completo para um codec. Não levanta — `OverlayCodec`
    é fechado pelo enum, então o dict cobre todos os valores."""
    return _PERFIS[codec]
