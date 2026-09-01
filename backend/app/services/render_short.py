"""Render do short vertical, de ponta a ponta (D-466).

Três passos, despachados ao Native Worker pela mesma fila do pipeline horizontal:

  1. **recorte** — extrai o trecho do bruto já em 9:16 e com o filtro aplicado;
  2. **camada** — o Remotion desenha cenas + legenda em ProRes 4444 com alpha;
  3. **composição** — a camada entra por cima e sai o MP4 de publicação.

Por que o vídeo NÃO é montado dentro do Remotion, numa composição só: a grade
tem de rodar antes do texto. Filtro aplicado depois mexeria na cor da legenda,
que já foi desenhada certa. É a mesma ordem que o horizontal usa — e reusar a
ordem conhecida significa reusar também o worker, o gate de RAM e o diagnóstico
que já existem para ela.

Os artefatos ficam em `cortes/<corte>/shorts/<short>/`: o intermediário some na
limpeza junto com o resto da mídia pesada, e o final é o que a publicação leva.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from app.channel_paths import para_relativo_ao_projeto, projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.ffmpeg_short import build_composicao_short_cmd, build_recorte_vertical_cmd
from app.domain.formato_video import VERTICAL, Resolucao
from app.domain.overlay_codec import OverlayCodec, overlay_codec_profile
from app.infrastructure.ffmpeg_runner import probe_resolucao
from app.infrastructure.worker_queue import RemotionWorkerQueue, WorkerJob, WorkerJobCategory
from app.models import Corte, Short, StatusShort
from app.services import legendas_short
from app.services.app_settings import AppSettingsService
from app.services.pipeline_render_helpers import _build_overlay_render_cmd
from app.services.shorts import foco_efetivo

logger = logging.getLogger(__name__)

COMPOSICAO_CAMADA = "CamadaShort"
_TIMEOUT_RECORTE_SEG = 900.0
_TIMEOUT_CAMADA_SEG = 1800.0
_TIMEOUT_COMPOSICAO_SEG = 900.0
# O bundle cacheado é do pipeline horizontal; aqui o entrypoint cru basta e evita
# acoplar o short à invalidação de fingerprint do outro caminho (D-190).
_ENTRYPOINT_REMOTION = "src/index.ts"


@dataclass(frozen=True)
class ResultadoRender:
    """O MP4 pronto e o caminho relativo que ficou gravado no short."""

    arquivo: Path
    caminho_relativo: str


async def renderizar_short(short_id: str) -> dict:
    """Produz o MP4 vertical do short e marca o candidato como renderizado.

    Levanta `LookupError` (short/corte inexistente) e `ValueError` (sem bruto em
    disco ou intervalo impossível). Falha de render propaga: diferente da
    sugestão, aqui o arquivo É a entrega.
    """
    contexto = await _montar_contexto(short_id)
    legenda = await legendas_short.montar_do_short(
        contexto.corte_id, contexto.inicio_seg, contexto.fim_seg
    )

    saida_dir = contexto.diretorio
    saida_dir.mkdir(parents=True, exist_ok=True)
    base = saida_dir / "base_vertical.mp4"
    camada = saida_dir / "camada.mov"
    final = saida_dir / "short.mp4"

    await _despachar(
        f"{short_id}_recorte",
        build_recorte_vertical_cmd(
            contexto.bruto,
            base,
            inicio_seg=contexto.inicio_seg,
            duracao_seg=contexto.duracao_seg,
            foco_x=contexto.foco_x,
            filtro=contexto.filtro,
            origem=contexto.origem,
            destino=VERTICAL,
        ),
        cwd=saida_dir,
        category=WorkerJobCategory.GRADE,
        timeout=_TIMEOUT_RECORTE_SEG,
    )

    props_file = saida_dir / "camada.props.json"
    props_file.write_text(
        json.dumps(
            {
                "cenas": contexto.cenas,
                "captions": legenda.captions,
                "duracaoSeg": contexto.duracao_seg,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    await _despachar(
        f"{short_id}_camada",
        _build_overlay_render_cmd(
            composition=COMPOSICAO_CAMADA,
            bundle_arg=_ENTRYPOINT_REMOTION,
            output_path=camada,
            props_file=props_file,
            concurrency=2,
            # ProRes 4444 é o único codec com alpha confiável neste projeto.
            codec_profile=overlay_codec_profile(OverlayCodec.PRORES_4444),
        ),
        cwd=_renderer_dir(),
        category=WorkerJobCategory.OVERLAY,
        timeout=_TIMEOUT_CAMADA_SEG,
    )

    await _despachar(
        f"{short_id}_composicao",
        build_composicao_short_cmd(base, camada, final),
        cwd=saida_dir,
        category=WorkerJobCategory.RENDER_FINAL,
        timeout=_TIMEOUT_COMPOSICAO_SEG,
    )

    resultado = ResultadoRender(
        arquivo=final,
        caminho_relativo=para_relativo_ao_projeto(final, contexto.projeto_id),
    )
    await _registrar_renderizado(short_id, resultado)
    logger.info(
        "[RenderShort] short=%s pronto em %s (legenda: %s, %d palavras)",
        short_id[:8],
        resultado.caminho_relativo,
        legenda.fonte,
        legenda.total,
    )
    return {
        "arquivo_short_path": resultado.caminho_relativo,
        "fonte_legenda": legenda.fonte,
        "palavras": legenda.total,
    }


@dataclass(frozen=True)
class _ContextoRender:
    short_id: str
    corte_id: str
    projeto_id: str
    bruto: Path
    diretorio: Path
    inicio_seg: float
    fim_seg: float
    foco_x: float
    filtro: str | None
    cenas: list[dict]
    # D-481: a resolucao MEDIDA do bruto. Nao tem default de proposito — foi um
    # default (HORIZONTAL) que fez o crop 9:16 ser calculado sobre 1920x1080 num
    # bruto 720p e estourar o quadro.
    origem: Resolucao

    @property
    def duracao_seg(self) -> float:
        return round(self.fim_seg - self.inicio_seg, 2)


async def _montar_contexto(short_id: str) -> _ContextoRender:
    # I-023: o filtro de render e GLOBAL (Ajustes), nao por corte.
    filtro = AppSettingsService.get().filtro_global_padrao or None

    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        if short.fim_seg <= short.inicio_seg:
            raise ValueError("O short tem intervalo vazio ou invertido.")

        bruto = _bruto_em_disco(corte)
        if bruto is None:
            raise ValueError(
                "O bruto deste corte nao esta mais em disco — sem ele nao da para recortar."
            )

        origem = await _medir(bruto)

        return _ContextoRender(
            short_id=short.id,
            corte_id=corte.id,
            projeto_id=corte.projeto_id,
            bruto=bruto,
            diretorio=projetos_dir() / corte.projeto_id / "cortes" / corte.id / "shorts" / short.id,
            inicio_seg=float(short.inicio_seg),
            fim_seg=float(short.fim_seg),
            foco_x=foco_efetivo(short, corte),
            filtro=filtro,
            cenas=_json_lista(short.cenas_remotion),
            origem=origem,
        )


async def _medir(bruto: Path) -> Resolucao:
    """A resolucao real do bruto (D-481).

    Falha ALTO em vez de assumir 1920x1080. Um palpite errado aqui nao produz um
    short torto: produz um crop maior que o quadro, e o ffmpeg aborta com -22 no
    meio do render, com uma mensagem que nao aponta para a causa. Se o ffprobe
    nao le o arquivo, o ffmpeg tambem nao leria — melhor dizer isso agora.
    """
    medida = await probe_resolucao(bruto)
    if medida is None:
        raise ValueError(
            f"Nao consegui medir a resolucao de {bruto.name} — sem ela o recorte 9:16 "
            "seria um chute e o ffmpeg falharia no meio do render."
        )
    return Resolucao(largura=medida[0], altura=medida[1])


def _bruto_em_disco(corte: Corte) -> Path | None:
    if not corte.arquivo_clip_path:
        return None
    caminho = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
    return caminho if caminho.is_file() else None


async def _registrar_renderizado(short_id: str, resultado: ResultadoRender) -> None:
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            return
        short.arquivo_short_path = resultado.caminho_relativo
        short.status = StatusShort.RENDERIZADO
        await db.commit()


async def _despachar(
    job_id: str,
    cmd: list[str],
    *,
    cwd: Path,
    category: WorkerJobCategory,
    timeout: float,
) -> None:
    """Envia um passo ao Native Worker e espera terminar."""
    logger.info("[RenderShort] job %s -> %s", job_id, " ".join(cmd[:6]))
    fila_dir = projetos_dir() / "fila_remotion"
    fila_dir.mkdir(parents=True, exist_ok=True)
    await RemotionWorkerQueue(fila_dir).submit_and_wait(
        WorkerJob(
            id=job_id, cmd=[str(c) for c in cmd], cwd=cwd, category=category, timeout_sec=timeout
        )
    )


def _renderer_dir() -> Path:
    """Raiz do `video-renderer`, de onde o `npx remotion` precisa rodar."""
    return Path(__file__).resolve().parents[3] / "video-renderer"


def _json_lista(bruto: str | None) -> list[dict]:
    try:
        dados = json.loads(bruto or "[]")
    except json.JSONDecodeError:
        return []
    return dados if isinstance(dados, list) else []
