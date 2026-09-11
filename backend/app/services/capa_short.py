"""O quadro de capa de um short (D-565, onda 4).

Extrai um frame do MP4 que o render ja produziu e grava o caminho no
`MetadadoShort`. E so isso — e e de proposito.

## Por que nao ha montagem aqui

A capa do corte (`services/capa_tiktok.py`) monta tres faixas, pede uma arte a
um gerador de imagem e desenha a tipografia do canal por cima. Tudo aquilo existe
porque o video do corte e DEITADO: um frame 16:9 viraria uma faixa fina dentro do
quadro vertical, e o conteudo dele (slide, documento, navegador) nao sobrevive a
miniatura da grade.

O short e o caso oposto. Ele ja e 9:16, ja preenche o quadro, ja tem o palco e a
moldura do canal, e — desde a onda 1 desta demanda — ja tem o gancho escrito em
cima nos primeiros segundos. O quadro dele E a capa; o trabalho aqui e so
escolher QUAL.

## O escalonamento

Nenhum. O MP4 do short e 1080x1920 e a capa e 1080x1920: `-frames:v 1` basta.
O `scale`+`crop` agressivo da capa do corte existe para converter 16:9 em 4:5, e
aplica-lo aqui so introduziria reamostragem sem ganho.

Falhar aqui nao derruba nada a montante: quem chama recebe o erro e a tela diz
que nao deu, porque uma capa que some calada e pior que capa nenhuma (D-384).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from app.channel_paths import para_relativo_ao_projeto, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.capa_short import encaixar_instante, instante_padrao
from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple
from app.models import Corte, MetadadoShort, Short
from sqlalchemy import select

logger = logging.getLogger(__name__)

NOME_DA_CAPA = "capa.jpg"


class CapaShortError(RuntimeError):
    """A capa nao saiu. A mensagem chega a tela — capa calada e pior que nenhuma."""


@dataclass(frozen=True)
class CapaDoShort:
    """O quadro gravado, e de onde ele saiu."""

    caminho_relativo: str
    instante_seg: float

    def como_dict(self) -> dict:
        return {
            "capa_path": self.caminho_relativo,
            "instante_seg": self.instante_seg,
            "tem_capa": bool(self.caminho_relativo),
        }


async def obter(short_id: str) -> dict:
    """A capa gravada deste short, com o instante SUGERIDO quando nao ha nenhuma.

    O instante sugerido ja vem calculado para a tela abrir no lugar certo: no
    meio do gancho quando ele existe, no primeiro terco quando nao.

    Levanta `LookupError` quando o short nao existe.
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")

        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short_id))
        duracao = _duracao(short)
        gravado = meta.capa_path if meta else ""

        return {
            "capa_path": gravado,
            "instante_seg": (
                meta.capa_instante_seg
                if meta and gravado
                else instante_padrao(duracao, float(short.gancho_ate_seg or 0.0))
            ),
            "tem_capa": bool(gravado),
            "duracao_seg": duracao,
            # A tela desenha o gancho por cima da previa quando o instante cai
            # dentro dele — e assim o operador ve a capa como ela sai.
            "gancho_ate_seg": float(short.gancho_ate_seg or 0.0),
        }


async def gerar(short_id: str, instante_seg: float | None = None) -> dict:
    """Tira o quadro no instante pedido e grava o caminho.

    `instante_seg` ausente usa o padrao — o meio do gancho, ou o primeiro terco.

    Levanta `LookupError` (short ou corte inexistente), `ValueError` (short ainda
    sem MP4 final) e `CapaShortError` (o FFmpeg nao entregou o arquivo).
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        if not short.arquivo_short_path:
            raise ValueError("Este short ainda nao foi renderizado — sem MP4 nao ha de onde tirar.")
        video = resolver_do_projeto(short.arquivo_short_path, corte.projeto_id)
        if not video.is_file():
            raise ValueError("O arquivo do short nao esta mais em disco.")

        duracao = _duracao(short)
        instante = (
            encaixar_instante(instante_seg, duracao)
            if instante_seg is not None
            else instante_padrao(duracao, float(short.gancho_ate_seg or 0.0))
        )
        projeto_id = corte.projeto_id

    destino = video.parent / NOME_DA_CAPA
    await _extrair_frame(video, destino, instante)

    async with AsyncSessionLocal() as db:
        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short_id))
        if not meta:
            meta = MetadadoShort(id=str(uuid.uuid4()), short_id=short_id)
            db.add(meta)
        meta.capa_path = para_relativo_ao_projeto(destino, projeto_id)
        meta.capa_instante_seg = instante
        await db.commit()
        resultado = CapaDoShort(meta.capa_path, meta.capa_instante_seg)

    logger.info("[CapaShort] short=%s instante=%.2fs -> %s", short_id[:8], instante, destino.name)
    return resultado.como_dict()


def _duracao(short: Short) -> float:
    return round(float(short.fim_seg) - float(short.inicio_seg), 2)


async def _extrair_frame(video: Path, destino: Path, instante: float) -> None:
    """Um quadro do short, do tamanho que ele ja tem.

    Sem `scale` nem `crop`: a origem e o destino sao 1080x1920, e reamostrar um
    quadro para o mesmo tamanho so perderia nitidez.

    `-ss` antes do `-i` e seek por keyframe — precisao de quadro nao importa numa
    capa, e o seek exato leria o arquivo inteiro ate o instante.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{max(0.0, instante):.3f}",
        "-i",
        str(video),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        str(destino),
    ]
    try:
        await run_ffmpeg_simple(cmd, label="capa-short-frame")
    except RuntimeError as exc:
        raise CapaShortError(f"Nao consegui tirar o quadro do short: {exc}") from exc

    if not destino.is_file():
        raise CapaShortError("O FFmpeg terminou sem escrever o quadro.")
