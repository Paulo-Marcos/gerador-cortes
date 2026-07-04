"""Pipeline otimizado de renderização — Composição por Camadas.

Orquestra: Grade FFmpeg (QSV) -> Overlays Remotion -> Composição FFmpeg -> Encode Final.
O Remotion NÃO processa o vídeo inteiro — renderiza apenas overlays curtos transparentes.
"""

import asyncio
import json
import logging
import os
import shutil
import time
from collections.abc import Callable
from pathlib import Path

from app.channel_assets_sync import garantir_mascote_materializado
from app.channel_paths import projetos_dir, resolver_do_projeto
from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.cinema_filters import get_filtro_vf
from app.domain.ffmpeg_commands import (
    build_compose_and_encode_cmd,
    build_grade_plan,
)
from app.domain.overlay_codec import OverlayCodecProfile, overlay_codec_profile
from app.domain.overlay_metadata import OverlayEntry, build_overlay_entries
from app.domain.remotion_bundle import compute_src_fingerprint
from app.domain.render_etapas import eh_render_parcial, fase_dentro_do_alcance
from app.domain.retry_policy import RetryPolicy
from app.domain.time_convert import epoch_to_hora_local, seg_to_duracao_humana
from app.domain.youtube_layout import aplicar_layout_card_por_contexto, normalizar_layout_youtube
from app.infrastructure.worker_queue import (
    RemotionWorkerQueue,
    WorkerJob,
    WorkerJobCategory,
    WorkerJobFailed,
    WorkerJobTimeout,
)
from app.models import Corte, Projeto
from app.services.app_logging import (
    current_log_level,
    operational_debug,
    operational_error,
    operational_info,
)
from app.services.app_settings import AppSettingsService, RenderSettings
from app.services.media_retention import MediaRetentionService
from app.services.pipeline_event_log import PipelineEventLog
from app.services.remotion_bundle_cache import RemotionBundleCache
from app.services.render_ffmpeg_log import append_ffmpeg_command
from app.services.youtube_palco import ensure_palco_pngs_para_layout

logger = logging.getLogger(__name__)

# Quantos chunks de overlay disparamos em paralelo. 2 explora o paralelismo
# do native_worker (que aceita até `REMOTION_OVERLAY_PARALLEL` overlays
# coexistindo, default 2) sem saturar GPU/CPU — cada chunk já usa
# `--concurrency` interno do Remotion (`AppSettings.render.overlay_concurrency`).
_MAX_OVERLAYS_PARALLEL = 2
_OVERLAY_FPS = 30
_OVERLAY_CHUNK_MAX_SEC = 30
_OVERLAY_CHUNK_MAX_GAP_SEC = 8
# Tamanho mínimo para considerar um chunk de overlay "pronto" e pulá-lo no
# modo continuar. 256 KB é generoso: render incompleto/corrompido geralmente
# tem <100 KB (o except: unlink() do worker já apaga renders abortados). O
# valor antigo (10 MB) re-renderizava chunks curtos válidos sem necessidade —
# usuário via como "deletando overlays". Mantém uma defesa contra arquivos
# zerados sem rejeitar overlays legítimos pequenos.
_OVERLAY_MIN_BYTES_PRONTO = 256 * 1024
# Fração de overlays FALTANDO (chunks que esgotaram os retries) a partir da
# qual a fase de overlays FALHA ALTO em vez de concluir "sucesso". D-167: com
# o Chrome Headless quebrado, 100% dos chunks falhavam e a fase seguia emitindo
# `fase_concluida` — mascarando o problema por dias. A partir de 50% de overlays
# ausentes o vídeo final sai gravemente incompleto; abaixo disso mantemos a
# resiliência a falha pontual de 1 chunk isolado (registrado como ausente).
_OVERLAY_FAIL_ABORT_RATIO = 0.5
# Extensões de overlay já usadas/aceitas em projetos existentes.
# A render atual usa a extensão do codec configurado; durante a
# resolução para composição aceitamos qualquer extensão conhecida
# (permite reaproveitar artefatos legados sem re-renderizar tudo).
_OVERLAY_EXTENSIONS_LEGADAS = (".webm", ".mov")

# Pipeline opera em 3 fases (render) + 1 finalização. Os aliases "compose"
# e "encode" mapeiam para "render_final": antes eram duas fases distintas
# (composição → clip_composed.mp4 → encode → video.mp4); hoje é uma passada
# só. Mantemos os aliases para preservar a UX de retomada via start_from.
_ORDEM_FASES = {"grade": 1, "overlays": 2, "render_final": 3}
_ALIAS_FASES = {"compose": "render_final", "encode": "render_final"}

# Presets tipograficos suportados pelo renderer Remotion (theme-v2.ts).
# Manter sincronizado com FONT_PRESETS_V2 e com FONTES_VALIDAS no router.
FONTE_PRESETS_VALIDOS = frozenset({"atual", "moderna", "cientifica", "minimalista", "tecnica"})


class ProjetoRenderConfig:
    """Configuração de render derivada do `Projeto` — qual versão do renderer
    (v1/v2) e nível padrão de sombra para cenas com sombra_nivel='auto'.

    Mantida como classe simples (não-dataclass) para evitar uma dependência
    extra em projetos antigos. Imutável após construção.
    """

    __slots__ = ("versao", "sombra_padrao", "layout_card_padrao", "fonte_preset")

    def __init__(
        self,
        versao: str = "v2",
        sombra_padrao: str = "nenhuma",
        layout_card_padrao: str = "vertical",
        fonte_preset: str = "atual",
    ) -> None:
        # V1 está desativada (compositions removidas do Root.tsx).
        # Qualquer valor de `versao` é normalizado para "v2".
        self.versao = "v2"
        self.sombra_padrao = (
            sombra_padrao if sombra_padrao in ("nenhuma", "leve", "media", "forte") else "nenhuma"
        )
        self.layout_card_padrao = (
            layout_card_padrao if layout_card_padrao in ("horizontal", "vertical") else "vertical"
        )
        self.fonte_preset = fonte_preset if fonte_preset in FONTE_PRESETS_VALIDOS else "atual"

    @classmethod
    def from_projeto(cls, projeto: Projeto | None) -> "ProjetoRenderConfig":
        if projeto is None:
            return cls()
        return cls(
            versao="v2",  # V1 desativada — forçar V2 mesmo se projeto antigo guardar "v1"
            sombra_padrao=getattr(projeto, "sombra_nivel_padrao", "nenhuma") or "nenhuma",
            layout_card_padrao=getattr(projeto, "layout_card_padrao", "vertical") or "vertical",
            fonte_preset=getattr(projeto, "fonte_preset", "atual") or "atual",
        )

    @property
    def overlay_composition(self) -> str:
        return "OverlaySceneV2" if self.versao == "v2" else "OverlayScene"

    @property
    def timeline_composition(self) -> str:
        return "OverlayTimelineV2" if self.versao == "v2" else "OverlayTimeline"

    @property
    def youtube_composition(self) -> str:
        return "CenaYouTubeV2" if self.versao == "v2" else "CenaYouTube"

    def overlay_props_extra(self) -> dict:
        """Props extras a injetar em renders V2 (sombra padrão da composição)."""
        if self.versao == "v2":
            return {
                "sombraNivelPadrao": self.sombra_padrao,
                "layoutCardPadrao": self.layout_card_padrao,
                "fontPreset": self.fonte_preset,
            }
        return {}


async def renderizar_pipeline_otimizado(
    corte_id: str,
    filtro: str | None = None,
    continuar: bool = True,
    start_from: str = "auto",
    parar_em: str | None = None,
    progress_callback: Callable[[int, str], None] | None = None,
) -> dict:
    # `filtro=None` (default) resolve para `AppSettings.filtro_global_padrao`
    # (hoje `bypass_dourado_aberto`). Antes o default era o literal
    # "cinematic_iii", que desalinhou da intencao declarada em
    # `app_settings.py` / `models.py` e era a real causa de cortes rodando
    # com cinematic_iii mesmo quando o projeto pediu outro filtro. F-030.
    if filtro is None:
        filtro = AppSettingsService.get().filtro_global_padrao
    """Executa o pipeline completo de composição por camadas.

    Fases:
      1. Grade cinematográfico via QSV (FFmpeg)
      2. Renderização seletiva de overlays (Remotion)
      3. Composição de overlays sobre vídeo tratado (FFmpeg)
      4. Encode final para YouTube (FFmpeg)
      5. Limpeza de temporários

    Exemplo:
        >>> result = await renderizar_pipeline_otimizado("abc-123")
        >>> result["status"]
        'sucesso'
    """
    started_at = time.time()

    def report(progress: int, stage: str) -> None:
        operational_info("Render final", f"{progress}% - {stage}", started_at=started_at)
        if progress_callback:
            progress_callback(progress, stage)

    operational_info(
        "Render final",
        f"▶ INÍCIO do render do corte {corte_id} às {epoch_to_hora_local(started_at)}",
    )
    report(2, "Carregando corte e preparando pastas")
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError(f"Corte '{corte_id}' não encontrado")

        projeto = await db.get(Projeto, corte.projeto_id)
        render_config = ProjetoRenderConfig.from_projeto(projeto)
        logger.info(
            "[Pipeline] Render config: versao=%s sombra_padrao=%s",
            render_config.versao,
            render_config.sombra_padrao,
        )

        corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
        graded_dir = corte_dir / "graded"
        overlays_dir = corte_dir / "overlays"
        upload_dir = corte_dir / "upload_ready"
        clip_raw = _find_clip_raw(corte_dir) or _find_registered_clip_raw(corte)

        for d in (graded_dir, overlays_dir, upload_dir):
            d.mkdir(parents=True, exist_ok=True)
        report(8, "Pastas preparadas")

        clip_graded = graded_dir / "clip_graded.mp4"
        video_final = upload_dir / "video.mp4"
        # I-023: log textual ao lado do MP4 final com cada comando ffmpeg
        # executado (fase + filtro + cmd). Permite auditar rapidamente se o
        # filtro pedido foi mesmo o aplicado, sem abrir o jsonl de eventos.
        ffmpeg_log_path = upload_dir / "render.ffmpeg.log"

        event_log = PipelineEventLog(corte_dir / "pipeline_events.jsonl", corte_id=corte_id)
        event_log.emit(
            "pipeline_iniciado",
            filtro=filtro,
            continuar=continuar,
            start_from=start_from,
            parar_em=parar_em,
        )

        # Render parcial (ex.: "só a grade"): para após `parar_em` sem produzir
        # o vídeo final nem finalizar o corte. Permite corrigir uma fase isolada
        # e conferir o resultado antes de seguir.
        render_parcial = eh_render_parcial(parar_em)

        # ─── Inicialização: Limpeza opcional ───
        start_from_norm = _normalizar_fase_alias(start_from)
        if _deve_limpar_artefatos(continuar=continuar, start_from=start_from):
            logger.info("[Pipeline] Reinício solicitado a partir de: %s", start_from_norm)
            operational_info(
                "Pipeline",
                f"Reiniciando a partir de: {start_from_norm} (entrada: {start_from})",
            )
            # `parar_em` restringe a limpeza ao intervalo pedido e `continuar`
            # (reaproveitar) preserva os overlays mesmo reiniciando pela grade:
            # "só a grade" / "deu erro na grade, reusa overlays" não custam uma
            # nova rodada de overlays.
            _limpar_a_partir_de(
                start_from_norm,
                graded_dir,
                overlays_dir,
                video_final,
                parar_em=parar_em,
                continuar=continuar,
            )
        elif continuar and start_from_norm == "overlays":
            operational_info(
                "Pipeline",
                "🔁 Continuar Fase 2: mantendo overlays prontos; só renderiza chunks faltantes/falhos.",
            )
        else:
            operational_info(
                "Pipeline",
                "🚀 Modo Continuar: Verificando arquivos existentes para pular etapas concluídas...",
            )

        bundle_task: asyncio.Task[Path] | None = None
        grade_task: asyncio.Task | None = None
        inicio_grade = 0.0
        try:
            # ─── Pré-validação paralela ───
            # Os dois artefatos finais relevantes para decidir o que pular
            # são validados em paralelo (ffprobe rodando em threads).
            # `_validar_video_completo` retorna False imediatamente se o
            # arquivo não existe — sem custo extra quando é caso comum.
            clip_graded_valido, video_final_valido = await asyncio.gather(
                _validar_video_completo(clip_graded),
                _validar_video_completo(video_final),
            )

            # ─── Mascote do canal ativo materializado (D-171) ───
            # Espelha `<canal>/assets/sapo/*` -> frontend/public/sapo e
            # video-renderer/public/sapo ANTES de bundlar/renderizar os overlays,
            # para o Remotion (`staticFile('/sapo/..')`) servir o mascote do canal
            # ATIVO. Idempotente e NO-OP no layout legado (mantém o sapo atual).
            # Best-effort: uma falha de cópia não pode derrubar o render — o
            # fallback já servido continua válido.
            try:
                materializados_sapo = garantir_mascote_materializado()
                if materializados_sapo:
                    logger.info(
                        "[Pipeline] Mascote do canal materializado (%d arquivo(s)).",
                        len(materializados_sapo),
                    )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "[Pipeline] Falha ao materializar mascote do canal (segue com o atual): %s",
                    exc,
                )

            # ─── Bundle Remotion em paralelo à Fase 1 ───
            # A Grade roda no FFmpeg/QSV (GPU) e o bundle Remotion no
            # Node (CPU+disco) — não competem por recursos. Disparamos
            # o bundle como task em background; quando a Fase 2 precisar
            # do `bundle_dir`, basta await na task. Cache hit é gratuito,
            # cache miss economiza ~10–30s sobrepondo com a Grade.
            bundle_task = asyncio.create_task(
                _preparar_bundle_overlay(overlays_dir),
                name=f"bundle_overlay_{corte_id}",
            )
            event_log.emit("bundle_remotion_iniciado")

            # ─── Fase 1/4: Grade Cinematográfico ───
            if _deve_pular_fase("grade", start_from, continuar, clip_graded_valido):
                logger.info(
                    "[Pipeline] Fase 1/4: clip_graded.mp4 válido encontrado. Pulando re-render."
                )
                operational_info(
                    "Pipeline", "✅ Fase 1/4: Grade cinematográfico já existe. Pulando."
                )
                report(22, "Fase 1/4 já concluída")
                event_log.emit("fase_pulada", phase="grade", motivo="artefato_valido")
                await _aplicar_retencao_apos_grade(db, event_log, corte)
            elif start_from_norm in {"overlays", "render_final"} and not clip_graded_valido:
                raise RuntimeError(
                    "Você pediu para iniciar depois da fase 1, mas graded/clip_graded.mp4 não existe ou está inválido."
                )
            else:
                if clip_raw is None:
                    raise ValueError(
                        f"clip_raw nao encontrado em {corte_dir}. "
                        "Execute 'Gerar Bruto' no Editor NLE primeiro ou inicie de overlays/render_final com graded valido."
                    )
                if clip_graded.exists():
                    clip_graded.unlink()
                grade_quality = AppSettingsService.get().render.grade_global_quality
                logger.info(
                    "[Pipeline] Fase 1/4: Iniciando grade cinematográfico (Hardware QSV, gq=%d)...",
                    grade_quality,
                )
                operational_info(
                    "Pipeline",
                    f"🎞️  Fase 1/4: Aplicando grade cinematográfico ({filtro}, gq={grade_quality})...",
                )
                report(12, "Fase 1/4: aplicando grade cinematográfico")
                inicio_grade = time.time()
                event_log.emit(
                    "fase_iniciada", phase="grade", filtro=filtro, global_quality=grade_quality
                )
                operational_info(
                    "Render final",
                    f"▶ Fase 1/4 (Grade) iniciada às {epoch_to_hora_local(inicio_grade)} "
                    "(em paralelo com a Fase 2)",
                )
                # F-048: passa as 3 camadas da cascade explicitamente para o
                # FFmpeg poder resolver compartilhada por regiao (com override).
                global_padrao_render = AppSettingsService.get().youtube_layout_padrao_global
                # OVERLAP Fase 1∥Fase 2: a grade roda em background (task)
                # enquanto os overlays — que NAO dependem do graded — renderizam.
                # O await fica antes da Fase 3 (composicao). Tempo de parede vira
                # max(grade, overlays), nao a soma. O worker permite grade∥overlay.
                grade_task = asyncio.create_task(
                    _executar_grade(
                        clip_raw,
                        clip_graded,
                        filtro,
                        layout_youtube=_layout_youtube_do_corte(
                            corte, fallback_layout=projeto.layout_youtube_padrao
                        ),
                        duracao_seg=_duracao_layout_corte(corte),
                        global_quality=grade_quality,
                        projeto_padrao=projeto.layout_youtube_padrao,
                        global_padrao=global_padrao_render,
                        ffmpeg_log_path=ffmpeg_log_path,
                    ),
                    name=f"grade_{corte_id}",
                )

            # ─── Fase 2/4: Renderização de Overlays Transparentes ───
            # I-036: mesma cascade de layout da grade (corte → projeto → global),
            # senão cortes intocados renderizam cards em modo full sobre o palco.
            overlay_chunks = await _preparar_overlay_chunks(
                corte,
                render_config.layout_card_padrao,
                projeto_padrao=projeto.layout_youtube_padrao if projeto else None,
                global_padrao=AppSettingsService.get().youtube_layout_padrao_global,
            )
            try:
                report(28, "Fase 2/4: preparando overlays")
                operational_info(
                    "Pipeline", f"-> Chunks de overlay gerados: {len(overlay_chunks)}"
                )

                if not fase_dentro_do_alcance("overlays", parar_em):
                    # Render parcial "só a grade": não renderiza overlays e não
                    # apaga os já prontos — seguem disponíveis para o próximo run.
                    operational_info(
                        "Pipeline",
                        "⏹ Fase 2/4: pulando overlays (parada solicitada após a grade); preservados.",
                    )
                    event_log.emit("fase_pulada", phase="overlays", motivo="parar_em")
                    report(55, "Parada após a Fase 1 (grade)")
                else:
                    render_cfg = AppSettingsService.get().render
                    codec_profile = overlay_codec_profile(render_cfg.overlay_codec)
                    to_render = _filtrar_chunks_pendentes(
                        overlay_chunks=overlay_chunks,
                        overlays_dir=overlays_dir,
                        start_from=start_from_norm,
                        continuar=continuar,
                        file_extension=codec_profile.file_extension,
                    )

                    inicio_overlays = time.time()
                    event_log.emit(
                        "fase_iniciada",
                        phase="overlays",
                        total_chunks=len(overlay_chunks),
                        chunks_a_renderizar=len(to_render),
                        codec=render_cfg.overlay_codec.value,
                    )
                    if to_render:
                        operational_info(
                            "Pipeline",
                            f"⚛️  Fase 2/4: Iniciando renderização de {len(to_render)} overlays...",
                        )
                        report(35, f"Fase 2/4: renderizando {len(to_render)} overlays")
                        # Bundle foi disparado em paralelo à Grade — aqui só esperamos
                        # se ainda não ficou pronto. Em cache hit, isto retorna imediato.
                        inicio_bundle_wait = time.time()
                        bundle_dir = await bundle_task
                        bundle_task = None
                        event_log.emit(
                            "bundle_remotion_pronto",
                            duration_sec=time.time() - inicio_bundle_wait,
                        )
                        falhados = await _executar_batch_overlay_chunks_parallel(
                            to_render,
                            overlays_dir,
                            render_cfg,
                            bundle_dir=bundle_dir,
                            render_config=render_config,
                        )
                        for chunk_id, erro in falhados:
                            event_log.emit(
                                "chunk_falhou",
                                phase="overlays",
                                chunk_id=chunk_id,
                                attempt=render_cfg.overlay_max_attempts,
                                error_type=type(erro).__name__,
                                error_message=str(erro)[:240],
                            )
                        # D-167: se (quase) todos os overlays falharam, a fase NÃO
                        # pode concluir "sucesso" e deixar o render_final compor um
                        # vídeo sem overlays. Falha alto — o `except` abaixo emite
                        # `fase_falhou` e propaga, interrompendo o pipeline.
                        msg_falha = _mensagem_falha_total_overlays(
                            falhados, len(overlay_chunks)
                        )
                        if msg_falha:
                            event_log.emit(
                                "overlays_falharam",
                                phase="overlays",
                                chunks_faltando=len(falhados),
                                total_chunks=len(overlay_chunks),
                            )
                            raise RuntimeError(msg_falha)
                    elif overlay_chunks:
                        operational_info(
                            "Pipeline",
                            f"✅ Fase 2/4: Todos os {len(overlay_chunks)} chunks de overlay já existem (skip).",
                        )
                    else:
                        operational_info(
                            "Pipeline",
                            "⚠️  Fase 2/4: Nenhuma cena encontrada para este corte. Pulando.",
                        )
                    _dur_overlays = time.time() - inicio_overlays
                    event_log.emit("fase_concluida", phase="overlays", duration_sec=_dur_overlays)
                    operational_info(
                        "Render final",
                        f"✅ Fase 2/4 (Overlays) concluída em {seg_to_duracao_humana(_dur_overlays)} "
                        f"(fim às {epoch_to_hora_local(time.time())})",
                    )
                    report(55, "Fase 2/4 concluída")
            except Exception as e:
                operational_error("Pipeline", f"❌ ERRO CRÍTICO NA FASE 2: {e}")
                logger.error(f"[Pipeline] Erro crítico na Fase 2: {e}", exc_info=True)
                event_log.emit(
                    "fase_falhou",
                    phase="overlays",
                    error_type=type(e).__name__,
                    error_message=str(e)[:240],
                )
                raise

            # Espera a grade (que rodou EM PARALELO à Fase 2) terminar antes de
            # compor. Tempo de parede ~ max(grade, overlays), não a soma. O
            # `await` propaga uma eventual falha da grade.
            if grade_task is not None:
                await grade_task
                _dur_grade = time.time() - inicio_grade
                event_log.emit("fase_concluida", phase="grade", duration_sec=_dur_grade)
                await _aplicar_retencao_apos_grade(db, event_log, corte)
                operational_info(
                    "Render final",
                    f"✅ Fase 1/4 (Grade) concluída em {seg_to_duracao_humana(_dur_grade)} "
                    f"(fim às {epoch_to_hora_local(time.time())})",
                )
                grade_task = None

            # ─── Parada antecipada (render parcial) ───
            # Quando o usuário pede só uma fase intermediária (ex.: "só a grade"
            # para corrigir um graded truncado), paramos aqui: não compomos o
            # vídeo final nem finalizamos o corte. Os artefatos das fases pedidas
            # ficam prontos para conferência e para um próximo render continuar.
            if render_parcial:
                _dur_parcial = time.time() - started_at
                report(100, f"Render parcial concluído (parou em {parar_em})")
                event_log.emit(
                    "pipeline_parcial_concluido",
                    parou_em=parar_em,
                    duration_sec=_dur_parcial,
                )
                operational_info(
                    "Render final",
                    f"⏹ PARCIAL {corte_id} (parou em {parar_em}) "
                    f"| tempo {seg_to_duracao_humana(_dur_parcial)}",
                )
                saida_parcial = (
                    clip_graded if _normalizar_fase_alias(parar_em) == "grade" else overlays_dir
                )
                return {
                    "status": "sucesso_parcial",
                    "parou_em": parar_em,
                    "output": str(saida_parcial),
                }

            # ─── Fase 3/4: Render Final (Composição + Encode em UMA passada) ───
            try:
                report(70, "Fase 3/4: preparando render final")
                # video_final_valido foi calculado upfront em paralelo — só
                # re-valida se foi modificado neste run (ex.: limpeza forçada
                # ou a Fase 1 acabou de regenerar o pipeline).
                if not video_final.exists():
                    video_final_valido = False
                if _deve_pular_fase("render_final", start_from, continuar, video_final_valido):
                    operational_info(
                        "Pipeline", "✅ Fase 3/4: video.mp4 final já existe. Pulando."
                    )
                    event_log.emit("fase_pulada", phase="render_final", motivo="artefato_valido")
                else:
                    logger.info(
                        "[Pipeline] Fase 3/4: Compondo overlays + encode final (passada única)..."
                    )
                    operational_info(
                        "Pipeline",
                        "🏁 Fase 3/4: Compondo overlays + encode final (8Mbps / 30 FPS / loudnorm LUFS-14)...",
                    )
                    inicio_render = time.time()
                    event_log.emit(
                        "fase_iniciada", phase="render_final", overlays_count=len(overlay_chunks)
                    )
                    operational_info(
                        "Render final",
                        f"▶ Fase 3/4 (Render final) iniciada às {epoch_to_hora_local(inicio_render)}",
                    )
                    video_temporario = _video_final_temporario(video_final)
                    _remover_arquivo_temporario(video_temporario)
                    await _executar_render_final(
                        clip_graded,
                        overlay_chunks,
                        overlays_dir,
                        video_temporario,
                        filtro=filtro,
                        ffmpeg_log_path=ffmpeg_log_path,
                    )
                    await _publicar_video_final(video_temporario, video_final)
                    _dur_render = time.time() - inicio_render
                    event_log.emit("fase_concluida", phase="render_final", duration_sec=_dur_render)
                    operational_info(
                        "Render final",
                        f"✅ Fase 3/4 (Render final) concluída em {seg_to_duracao_humana(_dur_render)} "
                        f"(fim às {epoch_to_hora_local(time.time())})",
                    )
                report(92, "Fase 3/4 concluída")
            except Exception as e:
                logger.error(f"[Pipeline] Erro crítico na Fase 3: {e}", exc_info=True)
                operational_error("Pipeline", f"❌ Erro na Fase 3: {e}")
                event_log.emit(
                    "fase_falhou",
                    phase="render_final",
                    error_type=type(e).__name__,
                    error_message=str(e)[:240],
                )
                raise

            # ─── Fase 4/4: Finalização ───
            logger.info("[Pipeline] Finalizando metadados e registrando conclusão.")
            operational_info("Pipeline", "✨ Finalizando processamento...")
            report(96, "Fase 4/4: finalizando pacote")
            await _finalizar_corte(db, corte, upload_dir)

            operational_info(
                "Pipeline",
                "ℹ️  Artefatos intermediários mantidos para retomada (graded/, overlays/).",
            )
            fim_pipeline = time.time()
            total_pipeline = fim_pipeline - started_at
            event_log.emit("pipeline_concluido", duration_sec=total_pipeline)
            operational_info(
                "Render final",
                f"✅ CONCLUÍDO {corte_id} | início {epoch_to_hora_local(started_at)} "
                f"| fim {epoch_to_hora_local(fim_pipeline)} "
                f"| tempo total {seg_to_duracao_humana(total_pipeline)}",
            )
            return {"status": "sucesso", "output": str(video_final)}

        except Exception as e:
            event_log.emit(
                "pipeline_falhou",
                duration_sec=time.time() - started_at,
                error_type=type(e).__name__,
                error_message=str(e)[:240],
            )
            raise
        finally:
            # Limpa bundle_task se ainda estiver pendente (caso: pipeline
            # falhou antes da Fase 2, ou Fase 2 não precisou do bundle
            # porque já estava tudo renderizado).
            if bundle_task is not None and not bundle_task.done():
                bundle_task.cancel()
                try:
                    await bundle_task
                except (asyncio.CancelledError, Exception):
                    pass
            # Cancela a grade se ficou pendente (ex.: Fase 2 falhou antes do
            # await da grade). O job FFmpeg no worker segue até o fim, mas a
            # task async não fica órfã. Se já terminou, consome a exceção.
            if grade_task is not None and not grade_task.done():
                grade_task.cancel()
            if grade_task is not None:
                try:
                    await grade_task
                except (asyncio.CancelledError, Exception):
                    pass


# ---------------------------------------------------------------------------
# Funções internas — cada uma faz UMA coisa
# ---------------------------------------------------------------------------


def _agrupar_overlay_chunks(entries: list[OverlayEntry]) -> list[dict]:
    """Agrupa cenas proximas em chunks transparentes para reduzir renders Remotion."""
    chunks: list[dict] = []
    current: list[OverlayEntry] = []

    for entry in entries:
        if not current:
            current = [entry]
            continue

        chunk_start = current[0].start_sec
        last_end = current[-1].end_sec
        would_duration = entry.end_sec - chunk_start
        gap = entry.start_sec - last_end

        if would_duration > _OVERLAY_CHUNK_MAX_SEC or gap > _OVERLAY_CHUNK_MAX_GAP_SEC:
            chunks.append(_criar_overlay_chunk(len(chunks) + 1, current))
            current = [entry]
        else:
            current.append(entry)

    if current:
        chunks.append(_criar_overlay_chunk(len(chunks) + 1, current))

    return chunks


def _criar_overlay_chunk(index: int, entries: list[OverlayEntry]) -> dict:
    start_sec = min(entry.start_sec for entry in entries)
    end_sec = max(entry.end_sec for entry in entries)
    return {
        "id": f"{index:03d}",
        "start_sec": start_sec,
        "end_sec": end_sec,
        "entries": entries,
    }


def _construir_cenas_chunk_relativas(
    chunk_start_sec: float,
    entries: list[OverlayEntry],
) -> list[dict]:
    """Reescreve as 4 chaves de timing de cada cena (`inicio`, `fim`,
    `inicio_seg`, `fim_seg`) para coordenadas relativas ao início do chunk.

    Por que as 4 chaves: o `normalizarCenaRemotion` em
    `video-renderer/src/schema.ts` prefere `inicio_seg`/`fim_seg` sobre
    `inicio`/`fim`. Se mantivermos as `_seg` originais do banco (absolutas)
    junto com `inicio`/`fim` relativos, a composição Remotion posiciona o
    `<Sequence>` em frames fora do chunk — o primeiro chunk renderiza com
    atraso e os subsequentes ficam completamente vazios.

    Invariante crítica: `cena["inicio"] == cena["inicio_seg"]` e
    `cena["fim"] == cena["fim_seg"]` em toda cena produzida aqui. Os testes
    cobrem essa invariante explicitamente.
    """
    cenas: list[dict] = []
    for entry in entries:
        inicio_rel = max(0.0, entry.start_sec - chunk_start_sec)
        fim_rel = max(0.001, entry.end_sec - chunk_start_sec)
        cenas.append(
            {
                **entry.cena_dict,
                "inicio": inicio_rel,
                "fim": fim_rel,
                "inicio_seg": inicio_rel,
                "fim_seg": fim_rel,
            }
        )
    return cenas


def _mensagem_falha_total_overlays(
    falhados: list[tuple[str, BaseException]],
    total_overlays: int,
) -> str | None:
    """Decide se a fase de overlays deve FALHAR ALTO e devolve a mensagem acionável.

    A fração de overlays FALTANDO é medida contra o total de overlays do corte
    (`total_overlays`), não contra o subconjunto re-renderizado: no modo
    "continuar" só re-rendermos os chunks pendentes, e falhar um deles quando
    dezenas de overlays válidos já existem não deve derrubar o vídeo.

    Retorna:
    - `str` (mensagem de erro) quando a fração faltando atinge
      `_OVERLAY_FAIL_ABORT_RATIO` — caso do bug D-167, em que 100% dos chunks
      falhavam mas a fase concluía "sucesso".
    - `None` quando a falha é pontual (tolerada), preservando a resiliência
      a um chunk isolado, que segue registrado como ausente + warning.
    """
    if not falhados or total_overlays <= 0:
        return None
    fracao = len(falhados) / total_overlays
    if fracao < _OVERLAY_FAIL_ABORT_RATIO:
        return None
    ids = ", ".join(fid for fid, _ in falhados)
    return (
        f"Fase de overlays falhou: {len(falhados)}/{total_overlays} chunks não "
        f"foram gerados ({fracao:.0%} ≥ {_OVERLAY_FAIL_ABORT_RATIO:.0%}) [{ids}]. "
        "Nenhum (ou quase nenhum) overlay foi produzido — verifique o Chrome "
        "Headless do Remotion (bin/ensure-remotion-browser) e o log do worker."
    )


async def _executar_batch_overlay_chunks_parallel(
    chunks: list[dict],
    output_dir: Path,
    render_cfg: RenderSettings,
    bundle_dir: Path | None = None,
    render_config: ProjetoRenderConfig | None = None,
) -> list[tuple[str, BaseException]]:
    """Renderiza chunks de overlays. Falhas isoladas não derrubam o batch.

    Retorna a lista `[(chunk_id, exception), ...]` dos chunks que falharam
    mesmo após esgotar as `overlay_max_attempts` tentativas. Lista vazia
    significa que todos renderizaram com sucesso. Chunks falhados ficam
    sem o `.webm/.mov` correspondente — a composição final segue sem eles.

    Quando `bundle_dir` vem como `None`, prepara o bundle aqui. Quando
    vem pronto (caso do orquestrador, que dispara o bundle em paralelo
    com a Fase 1), reaproveita — esse é o caminho rápido.
    """
    perfil = overlay_codec_profile(render_cfg.overlay_codec)
    cfg = render_config or ProjetoRenderConfig()
    operational_debug(
        "Pipeline",
        f"-> Entrou em _executar_batch_overlay_chunks_parallel com {len(chunks)} chunks "
        f"(codec={perfil.codec.value}, ext={perfil.file_extension}, "
        f"concurrency={render_cfg.overlay_concurrency}, cooldown={render_cfg.cooldown_sec}s, "
        f"max_attempts={render_cfg.overlay_max_attempts}, renderer={cfg.versao})",
    )
    if bundle_dir is None:
        bundle_dir = await _preparar_bundle_overlay(output_dir)
    total = len(chunks)
    falhados: list[tuple[str, BaseException]] = []

    for batch_start in range(0, total, _MAX_OVERLAYS_PARALLEL):
        batch = chunks[batch_start : batch_start + _MAX_OVERLAYS_PARALLEL]
        tasks = []

        for offset, chunk in enumerate(batch):
            index = batch_start + offset
            output_path = output_dir / f"chunk_{chunk['id']}{perfil.file_extension}"
            dur_frames = int(round((chunk["end_sec"] - chunk["start_sec"]) * _OVERLAY_FPS))
            operational_debug(
                "Pipeline",
                f"* [{index + 1}/{total}] Enfileirando chunk {chunk['id']}: "
                f"{len(chunk['entries'])} cenas ({dur_frames} frames)",
            )
            tasks.append(
                _executar_render_overlay_chunk(
                    chunk, output_path, dur_frames, bundle_dir, render_cfg, perfil, cfg
                )
            )

        # return_exceptions=True: 1 falha não cancela as outras tasks do batch.
        # `gather` aguarda todas e retorna exceptions como valores.
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for chunk, result in zip(batch, results, strict=False):
            if isinstance(result, BaseException):
                falhados.append((chunk["id"], result))
                operational_error(
                    "Pipeline",
                    f"❌ Chunk {chunk['id']} falhou após {render_cfg.overlay_max_attempts} tentativas: "
                    f"{type(result).__name__}: {result}",
                )

        await _aguardar_cooldown(
            render_cfg.cooldown_sec, batch_start + _MAX_OVERLAYS_PARALLEL < total
        )

    if falhados:
        ids = ", ".join(f for f, _ in falhados)
        operational_info(
            "Pipeline",
            f"⚠ Fase 2/4: {len(falhados)}/{total} chunks pularam o render: [{ids}]. "
            "Composição final prosseguirá sem essas overlays.",
        )
        logger.warning(
            "[Pipeline] %d chunks de overlay falharam após retries: %s",
            len(falhados),
            [fid for fid, _ in falhados],
        )

    return falhados


async def _aguardar_cooldown(cooldown_sec: int, ha_mais_chunks: bool) -> None:
    """Sleep entre chunks quando configurado. 0 = sem pausa."""
    if cooldown_sec <= 0 or not ha_mais_chunks:
        return
    operational_info("Pipeline", f"* Cooldown termico ({cooldown_sec}s)...")
    await asyncio.sleep(cooldown_sec)


def _find_clip_raw(corte_dir: Path) -> Path | None:
    """Localiza o vídeo bruto na pasta do corte.

    Robusto a nomes com timestamp (``clip_raw_<ms>.mkv``, produzidos pelo
    "Gerar Bruto") e à relocação da pasta — depende só do conteúdo do diretório,
    nunca de um caminho absoluto stale no banco. Ordem de preferência:

    1. Nomes canônicos (``clip_raw.mkv/.mp4``, ``clip_raw_base.mkv/.mp4``).
    2. Qualquer ``clip_raw*.mkv/.mp4`` (exceto backups), escolhendo o mais
       recente por mtime — desempate determinístico por nome.
    3. Backups ``clip_raw_backup_com_silencios.*`` como último recurso.
    """
    for name in (
        "clip_raw.mkv",
        "clip_raw.mp4",
        "clip_raw_base.mkv",
        "clip_raw_base.mp4",
    ):
        p = corte_dir / name
        if p.exists():
            return p

    def _is_backup(p: Path) -> bool:
        return "_backup_com_silencios" in p.name

    candidatos = [
        p
        for ext in ("mkv", "mp4")
        for p in corte_dir.glob(f"clip_raw*.{ext}")
        if p.is_file()
    ]
    nao_backup = [p for p in candidatos if not _is_backup(p)]
    if nao_backup:
        return max(nao_backup, key=lambda p: (p.stat().st_mtime, p.name))

    backups = [p for p in candidatos if _is_backup(p)]
    if backups:
        return max(backups, key=lambda p: (p.stat().st_mtime, p.name))

    return None


def _find_registered_clip_raw(corte: Corte) -> Path | None:
    if not corte.arquivo_clip_path:
        return None

    # D-158: reancora pelo canal ativo — aceita valor relativo (novo padrão) e
    # absoluto/Docker legado, ambos resolvem para a raiz de dados vigente.
    p = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
    return p if p.exists() else None


def _extrair_cenas(corte: Corte) -> list[dict]:
    """Extrai a lista de cenas do campo cenas_remotion do banco."""
    raw = _campo_corte(corte, "cenas_remotion")
    if not raw:
        return []

    data = []

    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except Exception as e:
            logger.error(f"Erro ao parsear JSON de cenas: {e}")
            return []
    else:
        data = raw

    # Se for um dict com chave 'cenas' (padrão)
    if isinstance(data, dict):
        return data.get("cenas", [])
    # Se for uma lista direta
    if isinstance(data, list):
        return data

    return []


def _layout_youtube_do_corte(
    corte: Corte | dict | None, fallback_layout: str | dict | None = None
) -> dict:
    raw = _campo_corte(corte, "layout_youtube")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw or "{}")
        except Exception as e:
            logger.warning(
                "[Pipeline] layout_youtube invalido no corte %s: %s",
                _campo_corte(corte, "id", ""),
                e,
            )
            raw = {}
    return normalizar_layout_youtube(raw, fallback_layout)


def _duracao_layout_corte(corte: Corte | dict | None) -> float:
    duracao = _numero_corte(_campo_corte(corte, "duracao_clip_seg"), 0.0)
    if duracao > 0:
        return duracao

    inicio = _numero_corte(_campo_corte(corte, "inicio_seg"), 0.0)
    fim = _numero_corte(_campo_corte(corte, "fim_seg"), inicio)
    return max(0.0, fim - inicio)


def _campo_corte(corte: Corte | dict | None, campo: str, default=None):
    if isinstance(corte, dict):
        return corte.get(campo, default)
    return getattr(corte, campo, default)


def _numero_corte(valor, default: float) -> float:
    try:
        return float(valor)
    except (TypeError, ValueError):
        return default


async def _executar_grade(
    input_path: Path,
    output_path: Path,
    filtro: str,
    *,
    layout_youtube: dict | None = None,
    duracao_seg: float | None = None,
    global_quality: int = 30,
    projeto_padrao: str | dict | None = None,
    global_padrao: str | dict | None = None,
    ffmpeg_log_path: Path | None = None,
) -> None:
    """Fase 1: aplica grade cinematográfico via QSV.

    O filtro escolhido pelo usuário (curves, colorbalance, vignette, eq,
    drawbox) é aplicado integralmente — fonte única de verdade em
    `app.domain.cinema_filters.get_filtro_vf`.

    `global_quality` controla a compressão QSV (maior = mais comprimido).
    Default 30 — o `clip_graded.mp4` é intermediário/descartável após o
    render final, então prioriza tamanho/velocidade sobre fidelidade.

    F-048: pré-gera PNGs do palco para TODO config único do corte (base +
    overrides de segmento) antes de chamar o FFmpeg, garantindo que cada
    região encontre o PNG certo no cache.
    """
    filtro_vf = get_filtro_vf(filtro)

    # F-048: garante PNGs cacheados para cada config único da cascade.
    try:
        await ensure_palco_pngs_para_layout(
            layout_youtube,
            duracao_seg=duracao_seg,
            projeto_padrao=projeto_padrao,
            global_padrao=global_padrao,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "[Pipeline] Falha ao pre-gerar PNGs do palco; FFmpeg usará fallback. erro=%s",
            exc,
        )

    fila_dir = projetos_dir() / "fila_remotion"
    fila_dir.mkdir(parents=True, exist_ok=True)
    job_base = output_path.stem

    async def _rodar_grade(hwaccel_decode: bool) -> None:
        # O plano é único (1 comando enable-based) OU segmentado (N segmentos por
        # subprocesso + concat/mux). A segmentação evita o composite full-length
        # do palco e é memory-safe (cada ffmpeg processa só a sua janela).
        plan = build_grade_plan(
            input_path,
            output_path,
            filtro_vf=filtro_vf,
            layout_youtube=layout_youtube,
            duracao_seg=duracao_seg,
            global_quality=global_quality,
            projeto_padrao=projeto_padrao,
            global_padrao=global_padrao,
            hwaccel_decode=hwaccel_decode,
        )
        if ffmpeg_log_path is not None:
            for step in plan.steps:
                append_ffmpeg_command(
                    ffmpeg_log_path,
                    phase=f"grade:{step.job_suffix}",
                    filtro=filtro,
                    cmd=step.cmd,
                    extra={
                        "filtro_vf": filtro_vf or "<none>",
                        "global_quality": global_quality,
                        "hwaccel_decode": hwaccel_decode,
                        "segmentado": plan.segmentado,
                        "input": str(input_path),
                        "output": str(output_path),
                    },
                )
        # A lista do concat referencia os `.ts` por nome relativo (cwd do worker
        # = output_path.parent); escrevê-la antes dos passos é seguro (é texto).
        if plan.concat_list is not None:
            lista_path, conteudo = plan.concat_list
            lista_path.write_text(conteudo, encoding="utf-8")
        try:
            for step in plan.steps:
                await _executar_via_worker(
                    fila_dir,
                    f"{job_base}_{step.job_suffix}",
                    step.cmd,
                    output_path.parent,
                    timeout=14400,
                    category=WorkerJobCategory.GRADE,
                )
        finally:
            # Segmentos + lista são intermediários: limpa sempre (sucesso ou
            # falha) para não acumular `.ts`/`.txt` órfãos no diretório do corte.
            for tmp in plan.temp_files:
                try:
                    tmp.unlink()
                except OSError:
                    pass

    # Fase 3: decode na GPU (QSV) + hwdownload — ~44% mais rapido que software.
    # Se a fonte nao for decodavel pela QSV (codec exotico), o job falha e
    # caimos para o decode em software (sempre funciona) sem derrubar o render.
    try:
        await _rodar_grade(hwaccel_decode=True)
    except (WorkerJobFailed, WorkerJobTimeout) as erro:
        operational_info(
            "Render final",
            f"⚠ Grade com QSV decode falhou ({type(erro).__name__}); "
            "refazendo com decode em software...",
        )
        logger.warning("[Pipeline] Grade QSV decode falhou (%s); fallback software.", erro)
        await _rodar_grade(hwaccel_decode=False)


async def _executar_render_overlay(
    ov: OverlayEntry,
    output_path: Path,
    ov_id: str,
    dur_frames: int,
    bundle_dir: Path | None,
    render_cfg: RenderSettings,
    codec_profile: OverlayCodecProfile,
    render_config: ProjetoRenderConfig | None = None,
) -> None:
    """Renderiza um único overlay transparente, com retry conforme settings."""
    policy = _render_retry_policy(render_cfg)
    cfg = render_config or ProjetoRenderConfig()
    await _retry_async(
        operacao=lambda: _executar_render_overlay_uma_vez(
            ov, output_path, ov_id, dur_frames, bundle_dir, render_cfg, codec_profile, cfg
        ),
        policy=policy,
        rotulo=f"ov_{ov_id}",
    )


async def _executar_render_overlay_uma_vez(
    ov: OverlayEntry,
    output_path: Path,
    ov_id: str,
    dur_frames: int,
    bundle_dir: Path | None,
    render_cfg: RenderSettings,
    codec_profile: OverlayCodecProfile,
    render_config: ProjetoRenderConfig,
) -> None:
    """Uma tentativa de render de overlay individual — sem retry."""
    if output_path.exists():
        try:
            output_path.unlink()
        except Exception:
            raise RuntimeError(
                f"Overlay anterior está aberto ou bloqueado: {output_path.name}"
            ) from None
    props = {
        "cena": ov.cena_dict,
        "durationFrames": dur_frames,
        **render_config.overlay_props_extra(),
    }
    props_file = output_path.parent / f"props_{ov_id}.json"
    with open(props_file, "w", encoding="utf-8") as f:
        json.dump(props, f)

    renderer_dir = Path(settings.video_renderer_dir)
    fila_dir = projetos_dir() / "fila_remotion"

    cmd = _build_overlay_render_cmd(
        composition=render_config.overlay_composition,
        bundle_arg=str(bundle_dir.absolute()) if bundle_dir else "src/index.ts",
        output_path=output_path,
        props_file=props_file,
        concurrency=render_cfg.overlay_concurrency,
        codec_profile=codec_profile,
    )

    job_id = f"ov_{ov_id}"
    try:
        await _executar_via_worker(
            fila_dir,
            job_id,
            cmd,
            renderer_dir,
            timeout=1800,
            category=WorkerJobCategory.OVERLAY,
        )
    except Exception:
        if output_path.exists():
            try:
                output_path.unlink()
            except Exception:
                pass
        raise
    finally:
        try:
            if props_file.exists():
                props_file.unlink()
        except Exception:
            pass


async def _executar_render_overlay_chunk(
    chunk: dict,
    output_path: Path,
    dur_frames: int,
    bundle_dir: Path,
    render_cfg: RenderSettings,
    codec_profile: OverlayCodecProfile,
    render_config: ProjetoRenderConfig | None = None,
) -> None:
    """Renderiza um chunk com várias cenas, com retry conforme settings.

    Falhas transitórias do Chromium/Remotion (OOM, GPU contention, timeout
    do worker) são re-tentadas até `render_cfg.overlay_max_attempts` vezes
    com backoff linear. Após esgotar, propaga — quem orquestra (batch)
    decide se isso derruba o pipeline ou só registra o chunk como ausente.
    """
    policy = _render_retry_policy(render_cfg)
    cfg = render_config or ProjetoRenderConfig()
    await _retry_async(
        operacao=lambda: _executar_render_overlay_chunk_uma_vez(
            chunk, output_path, dur_frames, bundle_dir, render_cfg, codec_profile, cfg
        ),
        policy=policy,
        rotulo=f"chunk_{chunk['id']}",
    )


async def _executar_render_overlay_chunk_uma_vez(
    chunk: dict,
    output_path: Path,
    dur_frames: int,
    bundle_dir: Path,
    render_cfg: RenderSettings,
    codec_profile: OverlayCodecProfile,
    render_config: ProjetoRenderConfig,
) -> None:
    """Uma tentativa de render de chunk — sem retry."""
    if output_path.exists():
        try:
            output_path.unlink()
        except Exception:
            raise RuntimeError(
                f"Overlay anterior esta aberto ou bloqueado: {output_path.name}"
            ) from None

    cenas = _construir_cenas_chunk_relativas(chunk["start_sec"], chunk["entries"])

    props = {
        "cenas": cenas,
        "durationFrames": dur_frames,
        **render_config.overlay_props_extra(),
    }
    props_file = output_path.parent / f"props_chunk_{chunk['id']}.json"
    with open(props_file, "w", encoding="utf-8") as f:
        json.dump(props, f)

    renderer_dir = Path(settings.video_renderer_dir)
    fila_dir = projetos_dir() / "fila_remotion"

    cmd = _build_overlay_render_cmd(
        composition=render_config.timeline_composition,
        bundle_arg=str(bundle_dir.absolute()),
        output_path=output_path,
        props_file=props_file,
        concurrency=render_cfg.overlay_concurrency,
        codec_profile=codec_profile,
    )

    job_id = f"chunk_{chunk['id']}"
    try:
        await _executar_via_worker(
            fila_dir,
            job_id,
            cmd,
            renderer_dir,
            timeout=1800,
            category=WorkerJobCategory.OVERLAY,
        )
    except Exception:
        if output_path.exists():
            try:
                output_path.unlink()
            except Exception:
                pass
        raise
    finally:
        try:
            if props_file.exists():
                props_file.unlink()
        except Exception:
            pass


def _render_retry_policy(render_cfg: RenderSettings) -> RetryPolicy:
    """Política a partir das settings: número de tentativas configurável,
    backoff fixo de 2s × attempt (suficiente para falhas transientes)."""
    return RetryPolicy(max_attempts=render_cfg.overlay_max_attempts, base_delay_sec=2.0)


async def _retry_async(
    *,
    operacao,
    policy: RetryPolicy,
    rotulo: str,
) -> None:
    """Executa `operacao()` com retry segundo `policy`.

    `operacao` é uma callable que retorna uma coroutine — chamada de
    novo a cada tentativa (precisa ser fresh, não a mesma coroutine).
    """
    ultimo_erro: BaseException | None = None
    for attempt in range(1, policy.total_attempts + 1):
        try:
            await operacao()
            if attempt > 1:
                operational_info("Pipeline", f"* ✅ {rotulo}: sucesso na tentativa {attempt}")
            return
        except Exception as e:
            ultimo_erro = e
            if not policy.should_retry(attempt):
                break
            delay = policy.backoff_seconds(attempt)
            operational_info(
                "Pipeline",
                f"* ⚠ {rotulo}: tentativa {attempt}/{policy.total_attempts} falhou ({type(e).__name__}). "
                f"Reagendando em {delay:.1f}s.",
            )
            if delay > 0:
                await asyncio.sleep(delay)

    if ultimo_erro is None:
        # Só chegamos aqui após esgotar as tentativas sem sucesso; ultimo_erro
        # sempre deveria estar preenchido. Um `assert` sumiria sob `python -O`.
        raise RuntimeError(f"{rotulo}: retentativas esgotadas sem erro registrado.")
    raise ultimo_erro


def _build_overlay_render_cmd(
    *,
    composition: str,
    bundle_arg: str,
    output_path: Path,
    props_file: Path,
    concurrency: int,
    codec_profile: OverlayCodecProfile,
) -> list[str]:
    """Comando `npx remotion render` para overlay transparente.

    A escolha de codec/pixel-format vem do `codec_profile` (VP9+alpha por
    padrão; ProRes 4444 disponível para casos especiais).
    """
    return [
        "npx",
        "remotion",
        "render",
        bundle_arg,
        composition,
        str(output_path.absolute()),
        "--props",
        str(props_file.absolute()),
        *codec_profile.remotion_args,
        "--gl=angle",
        "--log=warn",
        "--concurrency",
        str(concurrency),
        "--overwrite",
    ]


def _assets_servidos_do_bundle(renderer_dir: Path) -> list[Path]:
    """Assets materializados por canal que o `remotion bundle` EMBUTE no bundle.

    O bundle Remotion copia `video-renderer/public/` (mascote em `public/sapo/`) e
    embute o `theme.config.json` (importado por `theme-v2.ts`). Esses arquivos são
    re-materializados por canal (`channel_assets_sync`) e mudam SEM tocar em `src/`.
    Se ficassem de fora do fingerprint, trocar de canal / re-render de poses daria
    cache-hit num bundle com o `public/sapo` antigo e a maioria dos overlays do
    mascote sumiria (D-190). Incluí-los força o rebuild quando o mascote/tema muda.
    """
    assets: list[Path] = []
    public_dir = renderer_dir / "public"
    if public_dir.is_dir():
        assets.extend(p for p in public_dir.rglob("*") if p.is_file())
    theme_config = renderer_dir / "theme.config.json"
    if theme_config.is_file():
        assets.append(theme_config)
    return assets


async def _preparar_bundle_overlay(output_dir: Path) -> Path:
    """Garante um bundle Remotion pronto para renderizar os overlays.

    Comportamento padrão: usa cache global em
    `video-renderer/.bundle-cache/<fingerprint>/`. Bundles iguais
    (mesmo conteúdo de `src/` + `package.json` + os assets servidos que o
    bundle embute — ver `_assets_servidos_do_bundle`) são reaproveitados
    entre execuções — economia de ~10–30s por renderização.

    Quando `AppSettings.render.bundle_cache_enabled` é False, faz o
    comportamento legado: bundle dedicado dentro de
    `output_dir/_remotion_bundle/`, sempre regenerado. Útil para
    debugar problemas de cache.
    """
    renderer_dir = Path(settings.video_renderer_dir)
    render_cfg = AppSettingsService.get().render

    if not render_cfg.bundle_cache_enabled:
        bundle_dir = output_dir / "_remotion_bundle"
        if bundle_dir.exists():
            shutil.rmtree(str(bundle_dir), ignore_errors=True)
        operational_info("Pipeline", "📦 Bundle Remotion (cache desligado — gerando dedicado)...")
        await _executar_bundle_remotion(bundle_dir, renderer_dir, label=output_dir.parent.name[:8])
        return bundle_dir

    cache = RemotionBundleCache(renderer_dir / ".bundle-cache")
    fingerprint = compute_src_fingerprint(
        renderer_dir / "src",
        extra_files=[
            renderer_dir / "package.json",
            # remotion.config.ts controla o bundle (defines/DefinePlugin, ex.: o
            # gate do mascote em D-197). Fica na raiz, fora de src/, entao precisa
            # entrar no fingerprint senao editá-lo nao invalida o cache.
            renderer_dir / "remotion.config.ts",
            *_assets_servidos_do_bundle(renderer_dir),
        ],
    )

    if cache.lookup(fingerprint) is not None:
        operational_info(
            "Pipeline",
            f"⚡ Bundle Remotion em cache (fp={fingerprint[:8]}). Pulando bundle.",
        )

    async def builder(target_dir: Path) -> None:
        operational_info("Pipeline", f"📦 Gerando bundle Remotion (fp={fingerprint[:8]})...")
        await _executar_bundle_remotion(target_dir, renderer_dir, label=fingerprint[:8])

    return await cache.get_or_create(fingerprint, builder)


async def _executar_bundle_remotion(target_dir: Path, renderer_dir: Path, *, label: str) -> None:
    """Invoca `npx remotion bundle` materializando o resultado em `target_dir`."""
    fila_dir = projetos_dir() / "fila_remotion"
    target_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "npx",
        "remotion",
        "bundle",
        "src/index.ts",
        "--out-dir",
        str(target_dir.absolute()),
        "--log=warn",
    ]
    job_id = f"overlay_bundle_{label}"
    await _executar_via_worker(
        fila_dir,
        job_id,
        cmd,
        renderer_dir,
        timeout=1800,
        category=WorkerJobCategory.BUNDLE,
    )
    if not (target_dir / "index.html").exists():
        raise RuntimeError(f"Bundle Remotion nao foi gerado corretamente em {target_dir}")


async def _preparar_overlay_chunks(
    corte: Corte,
    layout_card_padrao: str = "vertical",
    *,
    projeto_padrao: str | dict | None = None,
    global_padrao: str | dict | None = None,
) -> list[dict]:
    """Extrai cenas → entries → chunks. Faz fallback via CorteService se o
    objeto vier sem cenas hidratadas.

    I-036: `projeto_padrao`/`global_padrao` completam a cascade lazy do layout
    (F-048) — sem eles, um corte intocado resolvia modo `full` e os cards
    renderizavam sem `layout_card_zone`, divergindo do preview (que resolve a
    cascade no router de cenas) e tampando as janelas do palco.
    """
    operational_info("Pipeline", "-> Extraindo cenas do banco...")
    corte_fonte = corte
    cenas = _extrair_cenas(corte)
    if not cenas:
        from app.services.corte import CorteService

        operational_info(
            "Pipeline", "-> Cenas não encontradas no objeto, buscando via CorteService..."
        )
        corte_completo = await CorteService.obter_corte(corte.id)
        corte_fonte = corte_completo
        cenas = _extrair_cenas(corte_completo)

    operational_info("Pipeline", f"-> Cenas encontradas: {len(cenas)}")
    # O layout do corte vai CRU para a cascade: pré-normalizar preencheria
    # fundo/placa/compartilhada e a sentinela de corte intocado deixaria de
    # ser reconhecida (o fallback do projeto seria ignorado).
    cenas = aplicar_layout_card_por_contexto(
        cenas,
        _campo_corte(corte_fonte, "layout_youtube"),
        layout_card_padrao,
        fallback_layout=projeto_padrao,
        global_padrao=global_padrao,
    )
    overlay_entries = build_overlay_entries(cenas, fps=_OVERLAY_FPS)
    operational_info("Pipeline", f"-> Entradas de overlay geradas: {len(overlay_entries)}")
    return _agrupar_overlay_chunks(overlay_entries)


def _filtrar_chunks_pendentes(
    *,
    overlay_chunks: list[dict],
    overlays_dir: Path,
    start_from: str,
    continuar: bool,
    file_extension: str,
) -> list[dict]:
    """Decide quais chunks ainda precisam ser renderizados.

    - Quando retomando em `render_final`, todos os overlays são assumidos
      prontos e nada é re-renderizado.
    - Quando `continuar`, mantém apenas chunks cuja saída na extensão
      atual (`.webm` para VP9, `.mov` para ProRes) ainda não atinge o
      tamanho mínimo. Trocar o codec invalida o cache: chunks gravados
      em outra extensão são tratados como pendentes (re-renderizar).
    """
    if start_from == "render_final":
        operational_info(
            "Pipeline",
            "✅ Fase 2/4: Pulando overlays; retomada solicitada em fase posterior.",
        )
        return []

    if not continuar:
        return list(overlay_chunks)

    pendentes = [
        chunk
        for chunk in overlay_chunks
        if not _arquivo_minimo(
            overlays_dir / f"chunk_{chunk['id']}{file_extension}",
            _OVERLAY_MIN_BYTES_PRONTO,
        )
    ]
    operational_info(
        "Pipeline",
        f"-> Overlays pendentes (filtro continuar, ext={file_extension}): {len(pendentes)}",
    )
    return pendentes


async def _executar_render_final(
    clip_graded: Path,
    overlay_chunks: list[dict],
    overlays_dir: Path,
    output_path: Path,
    *,
    filtro: str | None = None,
    ffmpeg_log_path: Path | None = None,
) -> None:
    """Fase 3/4: composição de overlays + encode final em UMA passada FFmpeg.

    Substitui o par antigo (composição → clip_composed.mp4 → encode final).
    Elimina um ciclo de re-encode e o disco intermediário.
    """
    overlay_paths, overlay_timings = _resolver_overlays_para_composicao(
        overlay_chunks, overlays_dir
    )

    cmd = build_compose_and_encode_cmd(
        clip_graded,
        overlay_paths,
        overlay_timings,
        output_path,
    )

    if ffmpeg_log_path is not None:
        append_ffmpeg_command(
            ffmpeg_log_path,
            phase="render_final",
            filtro=filtro,
            cmd=cmd,
            extra={
                "overlays_count": len(overlay_paths),
                "input": str(clip_graded),
                "output": str(output_path),
            },
        )

    fila_dir = projetos_dir() / "fila_remotion"
    job_id = f"{output_path.stem}_render_final"
    await _executar_via_worker(
        fila_dir,
        job_id,
        cmd,
        output_path.parent,
        timeout=7200,
        category=WorkerJobCategory.RENDER_FINAL,
    )


def _resolver_overlays_para_composicao(
    overlay_chunks: list[dict],
    overlays_dir: Path,
) -> tuple[list[Path], list[dict]]:
    """Para cada chunk, escolhe entre o arquivo agrupado ou os `ov_*`
    individuais (fallback histórico). Aceita extensões legadas: se o
    chunk foi renderizado em ProRes (.mov) antes da mudança para VP9
    (.webm), continua usável sem re-renderizar.
    """
    overlay_paths: list[Path] = []
    overlay_timings: list[dict] = []

    for chunk in overlay_chunks:
        chunk_path = _localizar_overlay_existente(overlays_dir, f"chunk_{chunk['id']}")
        if chunk_path is not None:
            overlay_paths.append(chunk_path)
            overlay_timings.append({"start_sec": chunk["start_sec"], "end_sec": chunk["end_sec"]})
            continue

        for entry in chunk["entries"]:
            fallback_path = _localizar_overlay_existente(overlays_dir, f"ov_{entry.id}")
            if fallback_path is None:
                logger.warning(
                    "[Pipeline] Overlay chunk/individual nao encontrado (ext esperadas: %s): %s",
                    list(_OVERLAY_EXTENSIONS_LEGADAS),
                    overlays_dir / f"ov_{entry.id}.*",
                )
                continue
            overlay_paths.append(fallback_path)
            overlay_timings.append({"start_sec": entry.start_sec, "end_sec": entry.end_sec})

    return overlay_paths, overlay_timings


def _localizar_overlay_existente(overlays_dir: Path, stem: str) -> Path | None:
    """Retorna o primeiro `overlays_dir/<stem><ext>` que existe entre as
    extensões conhecidas, ou None se nenhum existe."""
    for ext in _OVERLAY_EXTENSIONS_LEGADAS:
        candidato = overlays_dir / f"{stem}{ext}"
        if candidato.exists():
            return candidato
    return None


async def _finalizar_corte(db, corte: Corte, upload_dir: Path) -> None:
    """Atualiza status do corte, gera metadados e copia thumbnail."""
    from app.services.remotion_render import RemotionRenderService

    await RemotionRenderService.finalizar_corte_com_sucesso(db, corte, upload_dir)


async def _aplicar_retencao_apos_grade(db, event_log: PipelineEventLog, corte: Corte) -> None:
    clip_path_before = corte.arquivo_clip_path
    retention = MediaRetentionService.aplicar_apos_grade(corte)
    if (
        not retention.removidos
        and not retention.erros
        and corte.arquivo_clip_path == clip_path_before
    ):
        return

    await db.commit()
    event_log.emit(
        "retencao_apos_grade",
        liberado_mb=retention.liberado_mb,
        removidos=retention.removidos,
        erros=retention.erros,
    )


def _normalizar_fase_alias(fase: str) -> str:
    """Mapeia aliases (`compose`, `encode`) para a fase canônica `render_final`."""
    return _ALIAS_FASES.get(fase, fase)


def _deve_limpar_artefatos(*, continuar: bool, start_from: str) -> bool:
    """Decide se `_limpar_a_partir_de` deve rodar antes do pipeline.

    Regras:
    - `continuar=False` → sempre limpa (re-render total).
    - `start_from='auto'` + `continuar=True` → não limpa (skip artefatos prontos
      em cada fase via `_deve_pular_fase` / `_filtrar_chunks_pendentes`).
    - `start_from='overlays'` + `continuar=True` → **não limpa**. É o modo
      "Continuar Fase 2": preserva chunks já renderizados; quando o pipeline
      morre no chunk N, basta retomar e só os faltantes/falhos rodam.
    - Outros `start_from` explícitos com `continuar=True` → limpa (usuário
      pediu reinício deliberado daquele ponto).
    """
    if not continuar:
        return True
    if start_from == "auto":
        return False
    if _normalizar_fase_alias(start_from) == "overlays":
        return False
    return True


def _deve_pular_fase(
    fase: str,
    start_from: str,
    continuar: bool,
    artefato_valido: bool,
) -> bool:
    """Decide se a fase pode ser pulada (artefato pronto + retomada autoriza)."""
    if not artefato_valido:
        return False
    if start_from == "auto":
        return continuar

    fase_norm = _normalizar_fase_alias(fase)
    start_norm = _normalizar_fase_alias(start_from)
    return _ORDEM_FASES.get(fase_norm, 0) < _ORDEM_FASES.get(start_norm, 0)


def _arquivo_minimo(path: Path, min_bytes: int) -> bool:
    return path.exists() and path.stat().st_size >= min_bytes


def _limpar_a_partir_de(
    start_from: str,
    graded_dir: Path,
    overlays_dir: Path,
    video_final: Path,
    parar_em: str | None = None,
    continuar: bool = False,
) -> None:
    """Remove artefatos da fase escolhida em diante.

    `start_from` aceita os nomes canônicos (`grade`, `overlays`,
    `render_final`) ou os aliases legados (`compose`, `encode`).

    `parar_em` limita a faixa de limpeza ao alcance pedido: num render
    parcial "só a grade" (start_from='grade', parar_em='grade') apagamos
    apenas `graded/`, preservando os overlays já renderizados.

    `continuar` (reaproveitar) preserva os overlays mesmo ao reiniciar pela
    grade: o caso "deu problema na grade, mas os overlays já terminaram" —
    refaz só a grade e reusa os overlays prontos (eles são transparentes e
    independem do conteúdo da grade). Só apagamos os overlays num reinício
    total da grade (`continuar=False`, "refazer do zero").
    """
    fase = _normalizar_fase_alias(start_from)
    if fase not in _ORDEM_FASES:
        fase = "grade"

    if fase == "grade":
        # Overlays só são apagados num reinício total pela grade (refazer do
        # zero). Com `continuar` (reaproveitar) ou `parar_em='grade'`, eles
        # ficam intactos para o compose final reutilizá-los.
        dirs_a_limpar = [graded_dir]
        if fase_dentro_do_alcance("overlays", parar_em) and not continuar:
            dirs_a_limpar.append(overlays_dir)
        for d in dirs_a_limpar:
            if d.exists():
                shutil.rmtree(str(d), ignore_errors=True)
            d.mkdir(parents=True, exist_ok=True)
    elif fase == "overlays":
        if overlays_dir.exists():
            shutil.rmtree(str(overlays_dir), ignore_errors=True)
        overlays_dir.mkdir(parents=True, exist_ok=True)
    # O video_final fica publicado; apenas sobras temporarias sao removidas.
    _remover_arquivo_temporario(_video_final_temporario(video_final))


def _video_final_temporario(video_final: Path) -> Path:
    return video_final.with_name(f"{video_final.stem}.rendering{video_final.suffix}")


def _remover_arquivo_temporario(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except PermissionError:
        logger.warning("[Pipeline] Arquivo temporario ainda em uso: %s", path)


async def _publicar_video_final(video_temporario: Path, video_final: Path) -> None:
    """Troca o video final com retry para handles breves do Windows."""
    for tentativa in range(1, 11):
        try:
            os.replace(video_temporario, video_final)
            return
        except PermissionError as e:
            if tentativa == 10:
                raise PermissionError(
                    f"Nao foi possivel substituir {video_final}; feche players, previews ou uploads que estejam usando o arquivo."
                ) from e
            await asyncio.sleep(0.5 * tentativa)


async def _executar_via_worker(
    fila_dir: Path,
    job_id: str,
    cmd: list[str],
    cwd: Path,
    timeout: int = 600,
    category: WorkerJobCategory = WorkerJobCategory.DEFAULT,
) -> None:
    """Facade fina sobre `RemotionWorkerQueue.submit_and_wait`.

    Mantida para preservar a assinatura usada em vários pontos do pipeline
    (e nos testes) — a lógica real de IPC vive em
    `app.infrastructure.worker_queue`.
    """
    operational_info("Pipeline", f"🚀 Enfileirando Job '{job_id}' no Native Worker...")
    logger.info("[Pipeline] Job %s -> CMD: %s", job_id, " ".join(str(c) for c in cmd))

    queue = RemotionWorkerQueue(fila_dir)
    job = WorkerJob(
        id=job_id,
        cmd=[str(c) for c in cmd],
        cwd=Path(cwd),
        category=category,
        timeout_sec=timeout,
    )
    await queue.submit_and_wait(job, log_level=current_log_level().value)


async def _validar_video_completo(path: Path) -> bool:
    """Versão async-friendly: roda a validação síncrona em thread separada.

    Antes este método chamava `subprocess.run` direto no event loop, o que
    bloqueava todo o pipeline (e qualquer outra tarefa async) durante os
    poucos segundos do ffprobe. Em `to_thread` o event loop continua livre.
    """
    return await asyncio.to_thread(_validar_video_completo_sync, path)


def _validar_video_completo_sync(path: Path) -> bool:
    """Valida que um artefato de vídeo existe, tem tamanho razoável e é
    decodificável (via ffprobe). Bloqueante — chamado a partir de
    `_validar_video_completo` via `asyncio.to_thread`.
    """
    import subprocess

    if not path.exists():
        operational_error("Pipeline", f"ERRO: Arquivo não existe: {path}")
        return False

    size_mb = path.stat().st_size / (1024 * 1024)
    if size_mb < 1.0:
        operational_error("Pipeline", f"ERRO: Arquivo muito pequeno ({size_mb:.2f} MB): {path}")
        return False

    try:
        res = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if res.returncode == 0:
            return True

        erro = res.stderr.lower()
        operational_error(
            "Pipeline", f"ffprobe retornou erro ({res.returncode}) para {path.name}: {erro}"
        )

        if "moov atom not found" in erro or "invalid data found" in erro:
            return False

        # Arquivo grande com erro desconhecido: aceita para não travar a retomada.
        logger.warning(
            "[Pipeline] ffprobe nao confirmou %s, mas o arquivo tem %.1f MB. Aceitando para retomada. Erro: %s",
            path.name,
            size_mb,
            erro.strip()[:240],
        )
        return True

    except (FileNotFoundError, subprocess.SubprocessError) as e:
        operational_info(
            "Pipeline",
            f"AVISO: ffprobe falhou ou nao encontrado ({type(e).__name__}). Aceitando por tamanho.",
        )
        return True
    except Exception as e:
        operational_error(
            "Pipeline", f"EXCEÇÃO na validação de {path.name}: {type(e).__name__} - {e}"
        )
        return False
