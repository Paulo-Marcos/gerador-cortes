"""
Serviço de Export — CSV LosslessCut + corte lossless com ffmpeg + processamento (áudio + intro/outro)

FACHADA (E-006): a lógica foi fatiada por responsabilidade em mixins
(`export_bulk_queue`, `export_bruto`, `export_processamento`).
`ExportService` recompõe todos eles por herança e detém o estado de classe —
toda chamada `ExportService.metodo(...)`/`cls.metodo(...)` continua resolvendo
pela MRO, então nenhum chamador muda.

`gerar_bruto_via_worker` fica AQUI (não num mixin) porque seus testes fazem
monkeypatch em globais deste módulo (`AsyncSessionLocal`, `build_bruto_pipeline`,
`projetos_dir`, `settings`); o método precisa lê-los no namespace da fachada.
"""

import asyncio
import json
import logging
from pathlib import Path

from app.config import settings
from app.core.channel_paths import para_relativo_ao_projeto, projetos_dir
from app.core.logging import (
    current_log_level,
    is_debug_enabled,
    operational_debug,
    operational_error,
)
from app.database import AsyncSessionLocal
from app.domain.corte.arranjo_blocos import parse as parse_arranjo
from app.domain.corte.arranjo_blocos import reconciliar, segmentos_na_ordem
from app.domain.corte.segment_calculator import (
    mesclar_desvios_sobrepostos,
    normalizar_desvio,
)
from app.infrastructure.render.bruto_pipeline import build_bruto_pipeline
from app.infrastructure.worker_queue import escrever_json_atomico
from app.models import Corte, Projeto, StatusCorte
from app.services.bruto_progress import BrutoProgress
from app.services.ciclo_de_vida import marcar_corte
from app.services.export_bruto import _ExportBrutoMixin
from app.services.export_bulk_queue import _ExportBulkQueueMixin
from app.services.export_processamento import _ExportProcessamentoMixin
from app.services.tasks import fire_and_forget

# O worker que falha às vezes deixa um arquivo quase vazio no lugar do bruto.
_TAMANHO_MINIMO_DO_BRUTO_BYTES = 1024
# Diferença aceitável entre a soma dos segmentos e a duração medida do bruto.
_TOLERANCIA_DE_DURACAO_SEG = 5.0

logger = logging.getLogger(__name__)

# Quanto esperar a resposta do worker pelo bruto, e de quanto em quanto olhar.
# A mensagem de timeout ("10 minutos") depende deste número.
_ESPERA_PELO_WORKER_S = 600
_INTERVALO_DE_CONSULTA_S = 2


class ExportService(
    _ExportBulkQueueMixin,
    _ExportBrutoMixin,
    _ExportProcessamentoMixin,
):
    # Acima deste número de segmentos, um único filter_complex fica grande/frágil
    # demais; caímos no fallback de re-encode por segmento (mais lento, robusto).
    _SEGMENT_FALLBACK_THRESHOLD: int = 10

    _tarefas_corte: dict[str, str] = {}
    _bulk_upload_sem: asyncio.Semaphore | None = None
    _fila_processamento: dict[str, dict[str, str]] = {}
    _fila_youtube: dict[str, dict[str, str]] = {}
    _bulk_brutos_sem: asyncio.Semaphore | None = None

    @classmethod
    async def gerar_bruto_via_worker(
        cls,
        corte_id: str,
        *,
        refazer_transcricao: bool = True,
        refazer_cenas: bool = True,
    ) -> dict:
        """Gera o vídeo bruto do corte delegando o FFmpeg ao Native Worker.

        Pipeline único: per-segment com PCM/h264 + concat demuxer estilo
        LosslessCut.  Detalhes em ``app.infrastructure.render.bruto_pipeline``.

        Output: ``clip_raw_<timestamp_ms>.mkv`` na pasta do corte.  Nome
        único evita conflito de lock com o player do navegador.

        D-160 — o vídeo bruto (silêncios + render) roda sempre; ``refazer_transcricao``
        e ``refazer_cenas`` gateiam as etapas derivadas. O endpoint mantém os dois
        ``True`` na 1ª geração (cadeia completa) e passa ``False`` na regeração
        quando o usuário não pediu opt-in — assim reprocessar o recorte não refaz
        texto/cenas que já estão bons.

        Returns:
            ``{"status": "pronto", "clip_path": str}`` em caso de sucesso, ou
            ``{"status": "erro", "mensagem": str}`` caso contrário.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}

            # D-455: o corte marcado com Fire ganha uma etapa a mais no fim da
            # esteira — a fábrica de shorts. Lida aqui, antes de qualquer passo,
            # para o dropdown de progresso já nascer com a lista certa.
            e_fire = bool(corte.is_fire)
            BrutoProgress.iniciar(corte_id, incluir_shorts=e_fire)
            await _salvaguarda_de_silencios(db, corte, corte_id)

            BrutoProgress.marcar(corte_id, "render", "rodando")
            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto:
                return {"status": "erro", "mensagem": "Projeto não encontrado"}

            video_path = cls._resolver_video_path(projeto, corte.projeto_id)
            if not video_path:
                return {"status": "erro", "mensagem": "Arquivo de vídeo original não encontrado."}

            out_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = _caminho_do_novo_bruto(out_dir)

            desvios = _desvios_do_corte(corte, corte_id)
            inicio_seg, fim_seg = _intervalo_dentro_do_video(corte, projeto)
            # Mescla desvios sobrepostos em intervalos atômicos.  Semanticamente
            # equivalente a passar a lista original para calcular_segmentos (que
            # já trata sobreposições via cursor), mas deixa explícito quantos
            # blocos de remoção únicos existem.
            desvios_mesclados = mesclar_desvios_sobrepostos(desvios)
            segmentos = _segmentos_do_bruto(corte, inicio_seg, fim_seg, desvios_mesclados)
            if not segmentos:
                return {"status": "erro", "mensagem": "Nenhum segmento válido."}

            # Log opcional (controlado por settings.bruto_verbose_log).
            log_path = out_dir / "DEBUG_gerar_bruto.log"
            if _log_detalhado():
                _registrar_segmentos(
                    log_path,
                    corte_id,
                    (inicio_seg, fim_seg, projeto.duracao_segundos),
                    desvios,
                    desvios_mesclados,
                    segmentos,
                )

            erro = await _renderizar_no_worker(
                corte_id, video_path, out_path, out_dir, segmentos, log_path
            )
            if erro:
                return erro

            # F-063: corrige o lip-sync no bruto, se o corte tiver offset. Aplicado
            # ANTES do probe de duração para que duracao_clip_seg reflita o arquivo
            # final. No-op quando offset=0 — cortes sem ajuste ficam idênticos.
            await cls._aplicar_audio_offset(out_path, int(corte.audio_offset_ms or 0))

            # Garantia 2: duração real está dentro de tolerância da esperada.
            duracao_esperada = sum(sf - si for si, sf in segmentos)
            duracao_real = await cls._probe_duracao(out_path)
            erro = _recusar_duracao_divergente(duracao_esperada, duracao_real)
            if erro:
                return erro

            _gravar_bruto_no_corte(corte, out_path, duracao_real)
            await db.commit()
            BrutoProgress.marcar(corte_id, "render", "concluido")

            await _etapas_derivadas(
                db,
                corte_id,
                out_path,
                e_fire=e_fire,
                refazer_transcricao=refazer_transcricao,
                refazer_cenas=refazer_cenas,
            )

            if _log_detalhado():
                logger.info(f"[ExportService] ✅ Bruto gerado: {out_path.name}")
            return {"status": "pronto", "clip_path": str(out_path)}


# ─── Os passos da geração do bruto (D-716: saíram de `gerar_bruto_via_worker`) ──
# Funções do módulo, não da classe, pelo mesmo motivo do método: os testes trocam
# globais daqui (`settings`, `build_bruto_pipeline`, `projetos_dir`...).


def _log_detalhado() -> bool:
    return settings.bruto_verbose_log or is_debug_enabled()


async def _salvaguarda_de_silencios(db, corte: Corte, corte_id: str) -> None:
    BrutoProgress.marcar(corte_id, "silencios", "rodando")
    # Salvaguarda F-017: roda retirada de silencios antes de calcular
    # segmentos. Garante que cliques em "Bruto" ou "Regerar bruto"
    # nunca produzam clip com silencios mesmo se o editor esqueceu de
    # rodar a detecao manual. limpar_anteriores=True remove apenas
    # desvios cujo motivo eh "Silencio Detectado (IA/Tecnico)";
    # desvios manuais sao preservados. Falha eh nao-fatal.
    try:
        from app.services.corte import CorteService

        await CorteService.detectar_silencios_tecnico(corte_id, limpar_anteriores=True)
        await db.refresh(corte)
        BrutoProgress.marcar(corte_id, "silencios", "concluido")
    except Exception as exc:  # noqa: BLE001 — etapa não-fatal: não derruba o bruto
        operational_error(
            "ExportService", f"Salvaguarda de silencios falhou para {corte_id}: {exc}"
        )
        BrutoProgress.marcar(corte_id, "silencios", "erro")


def _caminho_do_novo_bruto(out_dir: Path) -> Path:
    # Nome único por geração — evita conflito de lock com o player
    # do navegador, que segura o `clip_raw.mkv` carregado enquanto a
    # aba está aberta.  Cada `gerar-bruto` escreve em um arquivo novo
    # e o DB aponta pro mais recente.  Limpeza best-effort dos antigos.
    import time as _time

    out_path = out_dir / f"clip_raw_{int(_time.time() * 1000)}.mkv"

    # Cleanup best-effort de arquivos clip_raw* antigos.  Os que estão
    # lockados (player aberto) são ignorados; a próxima geração tenta
    # de novo eventualmente.
    for old in out_dir.glob("clip_raw*.mkv"):
        if old == out_path:
            continue
        try:
            old.unlink()
        except OSError as e:
            if _log_detalhado():
                logger.info(
                    f"[ExportService] Arquivo bruto antigo lockado: {old.name} ({e})",
                )
    return out_path


def _desvios_do_corte(corte: Corte, corte_id: str) -> list[dict]:
    try:
        desvios_raw = json.loads(corte.desvios or "[]")
    except json.JSONDecodeError:
        logger.warning(
            "[ExportService] desvios do corte %s corrompidos "
            "(JSON inválido); assumindo lista vazia.",
            corte_id,
        )
        desvios_raw = []
    return [normalizar_desvio(d) for d in desvios_raw]


def _intervalo_dentro_do_video(corte: Corte, projeto: Projeto) -> tuple[float, float]:
    # Limita fim_seg à duração real do vídeo para evitar segmentos além do final
    inicio_seg = float(corte.inicio_seg)
    fim_seg = float(corte.fim_seg)
    if projeto.duracao_segundos:
        fim_seg = min(fim_seg, float(projeto.duracao_segundos))
    return inicio_seg, fim_seg


def _segmentos_do_bruto(
    corte: Corte, inicio_seg: float, fim_seg: float, desvios_mesclados: list[dict]
) -> list[tuple[float, float]]:
    # D-576: a ORDEM sai do arranjo de blocos; o que SAI continua vindo
    # dos desvios. `reconciliar` reencaixa o arranjo no intervalo já
    # limitado à duração real do vídeo — sem isso um bloco poderia
    # apontar para além do fim do arquivo. Corte sem arranjo cai no
    # `calcular_segmentos` de sempre, byte a byte.
    arranjo = reconciliar(parse_arranjo(corte.arranjo_blocos), inicio_seg, fim_seg)
    segmentos_data = segmentos_na_ordem(arranjo, inicio_seg, fim_seg, desvios_mesclados)
    return [(s["start"], s["end"]) for s in segmentos_data]


def _registrar_segmentos(
    log_path: Path,
    corte_id: str,
    intervalo: tuple[float, float, float | None],
    desvios: list[dict],
    desvios_mesclados: list[dict],
    segmentos: list[tuple[float, float]],
) -> None:
    inicio_seg, fim_seg, duracao_video = intervalo
    debug_log = (
        f"================================================================================\n"
        f"[GERAR_BRUTO DEBUG] Corte: {corte_id}\n"
        f"Corte range: {inicio_seg}s -> {fim_seg}s  (duracao_video={duracao_video}s)\n"
        f"Total de {len(desvios)} desvios brutos, {len(desvios_mesclados)} após mesclar sobrepostos:\n"
    )
    for i, dv in enumerate(desvios_mesclados):
        tipo = dv.get("motivo", "???")[:60]
        debug_log += f"  [{i}] [{dv.get('inicio_seg')}s -> {dv.get('fim_seg')}s] {tipo}\n"
    debug_log += f"\nSegmentos CALCULADOS: {len(segmentos)}\n"
    for i, (seg_i, seg_f) in enumerate(segmentos):
        debug_log += f"  Seg[{i}]: [{seg_i:.3f}s -> {seg_f:.3f}s] dur={seg_f - seg_i:.3f}s\n"
    debug_log += "================================================================================"
    log_path.write_text(debug_log, encoding="utf-8")
    logger.info(debug_log)


async def _renderizar_no_worker(
    corte_id: str,
    video_path: Path,
    out_path: Path,
    out_dir: Path,
    segmentos: list[tuple[float, float]],
    log_path: Path,
) -> dict | None:
    """Despacha o bruto ao Native Worker e espera; devolve o erro, ou None se o arquivo saiu."""
    res_file = _enfileirar_bruto(corte_id, video_path, out_path, out_dir, segmentos, log_path)
    erro = await _erro_na_resposta_do_worker(res_file)
    if erro:
        return erro
    # Garantia 1: arquivo de saída foi criado com tamanho mínimo.
    if not out_path.exists() or out_path.stat().st_size < _TAMANHO_MINIMO_DO_BRUTO_BYTES:
        return {"status": "erro", "mensagem": "Arquivo bruto não foi gerado pelo worker."}
    return None


def _enfileirar_bruto(
    corte_id: str,
    video_path: Path,
    out_path: Path,
    out_dir: Path,
    segmentos: list[tuple[float, float]],
    log_path: Path,
) -> Path:
    """Grava o pedido na fila do worker e devolve onde a resposta vai aparecer."""
    # Despacho para o Native Worker (fila JSON evita NotImplementedError do
    # asyncio.create_subprocess_exec em Windows + SelectorEventLoop).
    fila_dir = projetos_dir() / "fila_remotion"
    fila_dir.mkdir(parents=True, exist_ok=True)

    job_id = f"{corte_id}_bruto"
    req_file = fila_dir / f"req_{job_id}.json"
    res_file = fila_dir / f"res_{job_id}.json"

    if req_file.exists():
        req_file.unlink()
    if res_file.exists():
        res_file.unlink()

    # Pipeline única: per-segment com PTS contíguo + concat estilo
    # LosslessCut.  Detalhes em app.infrastructure.render.bruto_pipeline.
    import tempfile as _temp

    # Diretório temporário único DENTRO da pasta do corte (não no tempdir
    # global, que é world-writable e tem nome previsível → colisão/TOCTOU
    # entre jobs). mkdtemp garante nome imprevisível e criação atômica.
    tmp_dir = Path(_temp.mkdtemp(prefix=f"tmp_rerender_{job_id}_", dir=str(out_dir)))

    pipeline = build_bruto_pipeline(
        video_path=video_path,
        out_path=out_path,
        work_dir=out_dir,
        tmp_dir=tmp_dir,
        segmentos=segmentos,
    )
    for path, content in pipeline.files.items():
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(content, encoding="utf-8")

    if _log_detalhado():
        _registrar_pipeline(pipeline, out_path, log_path)

    job_data = {
        "id": job_id,
        "cwd": str(out_dir.absolute()),
        "cmd": [str(c) for c in pipeline.cmd],
        "log_level": str(current_log_level()),
    }

    if _log_detalhado():
        logger.info(f"[ExportService] Enfileirando geração de bruto para {corte_id}...")
    # Escrita ATOMICA (.tmp + rename): o worker reage ao evento de
    # CRIACAO do arquivo, entao um `open(...,'w')` — que trunca para 0
    # bytes antes de gravar — fazia o `JSON.parse` estourar com
    # "Unexpected end of JSON input" e o job ser descartado.
    escrever_json_atomico(req_file, job_data)
    return res_file


def _registrar_pipeline(pipeline, out_path: Path, log_path: Path) -> None:
    cmd_summary = " ".join(str(c) for c in pipeline.cmd)
    files_summary = "\n".join(
        f"  - {p}  ({len(c.encode('utf-8'))} bytes)" for p, c in pipeline.files.items()
    )
    detail = (
        f"\n[PIPELINE DEBUG]\n"
        f"out_path: {out_path}\n"
        f"tmp_dir: {pipeline.tmp_dir}\n"
        f"arquivos auxiliares ({len(pipeline.files)}):\n{files_summary}\n"
        f"cmd dispatched: {cmd_summary}\n"
    )
    logger.info(detail)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(detail)


async def _erro_na_resposta_do_worker(res_file: Path) -> dict | None:
    """O erro da resposta do worker, ou None quando ele respondeu sucesso."""
    # Aguarda o Native Worker processar (polling com timeout de 10min)
    elapsed = 0
    while elapsed < _ESPERA_PELO_WORKER_S:
        if res_file.exists():
            break
        await asyncio.sleep(_INTERVALO_DE_CONSULTA_S)
        elapsed += _INTERVALO_DE_CONSULTA_S

    if not res_file.exists():
        return {
            "status": "erro",
            "mensagem": "Timeout: Native Worker não respondeu em 10 minutos.",
        }

    try:
        with open(res_file, encoding="utf-8") as f:
            resultado = json.load(f)
        res_file.unlink()
    except (OSError, ValueError):
        return {"status": "erro", "mensagem": "Falha ao ler resposta do Native Worker."}

    if resultado.get("status") != "sucesso":
        return {
            "status": "erro",
            "mensagem": f"FFmpeg falhou: {resultado.get('erro', 'desconhecido')}",
        }
    return None


def _recusar_duracao_divergente(duracao_esperada: float, duracao_real: float | None) -> dict | None:
    if (
        duracao_real is not None
        and abs(duracao_real - duracao_esperada) > _TOLERANCIA_DE_DURACAO_SEG
    ):
        # Sempre logamos divergência (mesmo com verbose off) — é erro grave.
        operational_error(
            "ExportService",
            f"⚠️ Duração divergente: esperado={duracao_esperada:.1f}s real={duracao_real:.1f}s",
        )
        return {
            "status": "erro",
            "mensagem": (
                f"Duração divergente: esperado={duracao_esperada:.1f}s, "
                f"real={duracao_real:.1f}s. Tente gerar novamente."
            ),
        }
    return None


def _gravar_bruto_no_corte(corte: Corte, out_path: Path, duracao_real: float | None) -> None:
    # Atualiza banco e sincroniza transcrição (path relativo ao projeto)
    corte.arquivo_clip_path = para_relativo_ao_projeto(str(out_path), corte.projeto_id)
    # Persiste a duração REAL do arquivo (medida via ffprobe) para o
    # frontend exibir o valor exato em vez de estimar.  Evita o
    # problema de mostrar "11:48" quando o arquivo tem 11:49.343.
    if duracao_real is not None:
        corte.duracao_clip_seg = float(duracao_real)
        if _log_detalhado():
            logger.info(
                f"[ExportService] duracao_clip_seg salvo: {duracao_real:.3f}s",
            )
    # Se estava aprovado, avança para processado
    if corte.status == "aprovado":
        marcar_corte(corte, StatusCorte.PROCESSADO, origem="export")


async def _etapas_derivadas(
    db,
    corte_id: str,
    out_path: Path,
    *,
    e_fire: bool,
    refazer_transcricao: bool,
    refazer_cenas: bool,
) -> None:
    """Transcrição, detecção de segmentos, cenas e shorts: derivam do bruto pronto."""
    # D-160 — a re-sincronização do texto (transcricao_final ↔ recorte
    # atual) é opt-in na regeração. Pular não afeta o vídeo bruto em si,
    # só o texto derivado usado por cenas/metadados.
    if refazer_transcricao:
        BrutoProgress.marcar(corte_id, "transcricao", "rodando")
        from app.services.corte import CorteService

        await CorteService.sincronizar_transcricao_corte(corte_id, db=db)
        BrutoProgress.marcar(corte_id, "transcricao", "concluido")

    _disparar_deteccao_de_segmentos(corte_id, out_path)

    # O status só vira "pronto" quando o worker inteiro retorna (inclui as
    # cenas abaixo) — assim o botão fica em loading até TUDO terminar.
    # F-038 — cenas via Claude APÓS o re-sync (transcrição já sem
    # silêncios), para os timings (startLeg) ficarem precisos. Import
    # lazy evita ciclo; falha é não-fatal (não derruba o bruto).
    # D-160 — cenas por IA também são opt-in na regeração (refazer_cenas).
    gerar_cenas = refazer_cenas and settings.claude_auto_cenas_no_bruto
    operational_debug(
        "ExportService",
        f"refazer_cenas={refazer_cenas} "
        f"claude_auto_cenas_no_bruto={settings.claude_auto_cenas_no_bruto}"
        f" -> {'iniciando cenas via Claude' if gerar_cenas else 'pulando cenas'}"
        f" p/ {corte_id}",
    )
    if gerar_cenas:
        await _gerar_cenas(corte_id)

    # D-455 — a fábrica de shorts do corte Fire, o "segundo passo" da
    # geração do bruto. Roda DEPOIS da transcrição (é dela, já rebaseada
    # na timeline do bruto, que os candidatos nascem) e é gateada por
    # Fire: só o corte que o editor marcou como top vira short.
    # Falha é não-fatal — a sugestão é derivada do bruto, não parte da
    # entrega dele, exatamente como as cenas acima.
    if e_fire and settings.claude_auto_shorts_no_bruto:
        await _sugerir_shorts(corte_id)


def _disparar_deteccao_de_segmentos(corte_id: str, out_path: Path) -> None:
    # F-054: dispara detecção de mudanças de cena no bruto recém-gerado.
    # Fire-and-forget — o usuário vê as sugestões aparecerem no painel de
    # YT layout assim que o React Query refetch ler `segmentos_detectados`
    # do banco. Falha é não-fatal: o botão manual ainda permite re-rodar.
    try:
        from app.services.deteccao_segmentos import executar_deteccao_segmentos

        fire_and_forget(
            executar_deteccao_segmentos(corte_id, out_path),
            name=f"deteccao-seg-{corte_id[:8]}",
        )
    except Exception as exc:  # noqa: BLE001 — etapa não-fatal: não derruba o bruto
        operational_error(
            "ExportService",
            f"Auto-trigger de detecção de segmentos falhou para {corte_id}: {exc}",
        )


async def _gerar_cenas(corte_id: str) -> None:
    BrutoProgress.marcar(corte_id, "cenas", "rodando")
    try:
        from app.services.cenas_remotion import CenasRemotionService

        await CenasRemotionService.gerar_cenas_via_claude(corte_id)
        BrutoProgress.marcar(corte_id, "cenas", "concluido")
    except Exception as exc:  # noqa: BLE001 — etapa não-fatal: não derruba o bruto
        BrutoProgress.marcar(corte_id, "cenas", "erro")
        operational_error("ExportService", f"Cenas via Claude falharam para {corte_id}: {exc}")


async def _sugerir_shorts(corte_id: str) -> None:
    BrutoProgress.marcar(corte_id, "shorts", "rodando")
    try:
        from app.services import shorts as shorts_store

        await shorts_store.sugerir_shorts(corte_id)
        BrutoProgress.marcar(corte_id, "shorts", "concluido")
    except Exception as exc:  # noqa: BLE001 — etapa não-fatal: não derruba o bruto
        BrutoProgress.marcar(corte_id, "shorts", "erro")
        operational_error("ExportService", f"Sugestão de shorts falhou para {corte_id}: {exc}")
