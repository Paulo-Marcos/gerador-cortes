"""Escolha do codec de overlay (Remotion → arquivo intermediário).

Cada perfil define como o Remotion deve renderizar os chunks transparentes
e qual extensão de arquivo o resto do pipeline deve esperar.

VP9 + alpha (yuva420p) é o padrão por economizar ~5–10× de espaço em
disco e largura de banda de leitura comparado ao ProRes 4444 sem perda
visível em conteúdo de texto/SVG (overlays típicos do CortadorLive).

ProRes 4444 permanece disponível para casos onde a qualidade de alpha
4:4:4 importa (gradientes finos, sombras translúcidas) — alternar via
`AppSettings.render.overlay_codec`.

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
