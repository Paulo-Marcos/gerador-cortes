"""
Serviço de Export — CSV LosslessCut + corte lossless com ffmpeg + processamento (áudio + intro/outro)

FACHADA (E-006): a lógica foi fatiada por responsabilidade em mixins
(`export_bulk_queue`, `export_csv`, `export_bruto`, `export_processamento`).
`ExportService` recompõe todos eles por herança e detém o estado de classe —
toda chamada `ExportService.metodo(...)`/`cls.metodo(...)` continua resolvendo
pela MRO, então nenhum chamador muda.

`gerar_bruto_via_worker` fica AQUI (não num mixin) porque seus testes fazem
monkeypatch em globais deste módulo (`AsyncSessionLocal`, `build_bruto_pipeline`,
`projetos_dir`, `settings`); o método precisa lê-los no namespace da fachada.
"""

import asyncio
import importlib.util
import json
from pathlib import Path

# Instala auto-editor automaticamente em tempo de execução para não quebrar o container docker existente
if importlib.util.find_spec("auto_editor") is None:
    import subprocess

    # Bootstrap em tempo de import (antes de app_logging ser importado abaixo):
    # mantém print puro de propósito — não há infra de log disponível aqui ainda.
    print("[ExportService] Instalando auto-editor via pip...")
    subprocess.check_call(["pip", "install", "auto-editor"])

from app.channel_paths import para_relativo_ao_projeto, projetos_dir
from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.bruto_pipeline import build_bruto_pipeline
from app.domain.segment_calculator import (
    calcular_segmentos,
    mesclar_desvios_sobrepostos,
    normalizar_desvio,
)
from app.models import Corte, Projeto
from app.services.app_logging import (
    current_log_level,
    is_debug_enabled,
    operational_debug,
    operational_error,
)
from app.services.bruto_progress import BrutoProgress
from app.services.export_bruto import _ExportBrutoMixin
from app.services.export_bulk_queue import _ExportBulkQueueMixin
from app.services.export_csv import _ExportCsvMixin
from app.services.export_processamento import _ExportProcessamentoMixin
from app.services.tasks import fire_and_forget


class ExportService(
    _ExportBulkQueueMixin,
    _ExportCsvMixin,
    _ExportBrutoMixin,
    _ExportProcessamentoMixin,
):
    # Acima deste número de segmentos, um único filter_complex fica grande/frágil
    # demais; caímos no fallback de re-encode por segmento (mais lento, robusto).
    _SEGMENT_FALLBACK_THRESHOLD: int = 10

    _tarefas_corte: dict[str, str] = {}
    _bulk_processar_sem: asyncio.Semaphore | None = None
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
        LosslessCut.  Detalhes em ``app.domain.bruto_pipeline``.

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

            BrutoProgress.iniciar(corte_id)
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
            except Exception as exc:
                operational_error(
                    "ExportService", f"Salvaguarda de silencios falhou para {corte_id}: {exc}"
                )
                BrutoProgress.marcar(corte_id, "silencios", "erro")

            BrutoProgress.marcar(corte_id, "render", "rodando")
            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto:
                return {"status": "erro", "mensagem": "Projeto não encontrado"}

            video_path = cls._resolver_video_path(projeto, corte.projeto_id)
            if not video_path:
                return {"status": "erro", "mensagem": "Arquivo de vídeo original não encontrado."}

            out_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
            out_dir.mkdir(parents=True, exist_ok=True)

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
                    if settings.bruto_verbose_log or is_debug_enabled():
                        print(
                            f"[ExportService] Arquivo bruto antigo lockado: {old.name} ({e})",
                            flush=True,
                        )

            try:
                desvios_raw = json.loads(corte.desvios or "[]")
            except json.JSONDecodeError:
                print(
                    f"[ExportService] desvios do corte {corte_id} corrompidos "
                    f"(JSON inválido); assumindo lista vazia."
                )
                desvios_raw = []
            desvios = [normalizar_desvio(d) for d in desvios_raw]

            # Limita fim_seg à duração real do vídeo para evitar segmentos além do final
            inicio_seg = float(corte.inicio_seg)
            fim_seg = float(corte.fim_seg)
            if projeto.duracao_segundos:
                fim_seg = min(fim_seg, float(projeto.duracao_segundos))

            # Mescla desvios sobrepostos em intervalos atômicos.  Semanticamente
            # equivalente a passar a lista original para calcular_segmentos (que
            # já trata sobreposições via cursor), mas deixa explícito quantos
            # blocos de remoção únicos existem.
            desvios_mesclados = mesclar_desvios_sobrepostos(desvios)

            segmentos_data = calcular_segmentos(inicio_seg, fim_seg, desvios_mesclados)
            segmentos = [(s["start"], s["end"]) for s in segmentos_data]

            if not segmentos:
                return {"status": "erro", "mensagem": "Nenhum segmento válido."}

            # Log opcional (controlado por settings.bruto_verbose_log).
            log_path = out_dir / "DEBUG_gerar_bruto.log"
            if settings.bruto_verbose_log or is_debug_enabled():
                debug_log = (
                    f"================================================================================\n"
                    f"[GERAR_BRUTO DEBUG] Corte: {corte_id}\n"
                    f"Corte range: {inicio_seg}s -> {fim_seg}s  (duracao_video={projeto.duracao_segundos}s)\n"
                    f"Total de {len(desvios)} desvios brutos, {len(desvios_mesclados)} após mesclar sobrepostos:\n"
                )
                for i, dv in enumerate(desvios_mesclados):
                    tipo = dv.get("motivo", "???")[:60]
                    debug_log += (
                        f"  [{i}] [{dv.get('inicio_seg')}s -> {dv.get('fim_seg')}s] {tipo}\n"
                    )
                debug_log += f"\nSegmentos CALCULADOS: {len(segmentos)}\n"
                for i, (seg_i, seg_f) in enumerate(segmentos):
                    debug_log += (
                        f"  Seg[{i}]: [{seg_i:.3f}s -> {seg_f:.3f}s] dur={seg_f - seg_i:.3f}s\n"
                    )
                debug_log += "================================================================================"
                log_path.write_text(debug_log, encoding="utf-8")
                print(debug_log, flush=True)

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
            # LosslessCut.  Detalhes em app.domain.bruto_pipeline.
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

            if settings.bruto_verbose_log or is_debug_enabled():
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
                print(detail, flush=True)
                with open(log_path, "a", encoding="utf-8") as f:
                    f.write(detail)

            job_data = {
                "id": job_id,
                "cwd": str(out_dir.absolute()),
                "cmd": [str(c) for c in pipeline.cmd],
                "log_level": current_log_level().value,
            }

            if settings.bruto_verbose_log or is_debug_enabled():
                print(
                    f"[ExportService] Enfileirando geração de bruto para {corte_id}...", flush=True
                )
            with open(req_file, "w", encoding="utf-8") as f:
                json.dump(job_data, f, ensure_ascii=False)

            # Aguarda o Native Worker processar (polling com timeout de 10min)
            timeout = 600
            elapsed = 0
            while elapsed < timeout:
                if res_file.exists():
                    break
                await asyncio.sleep(2)
                elapsed += 2

            if not res_file.exists():
                return {
                    "status": "erro",
                    "mensagem": "Timeout: Native Worker não respondeu em 10 minutos.",
                }

            try:
                with open(res_file, encoding="utf-8") as f:
                    resultado = json.load(f)
                res_file.unlink()
            except Exception:
                return {"status": "erro", "mensagem": "Falha ao ler resposta do Native Worker."}

            if resultado.get("status") != "sucesso":
                return {
                    "status": "erro",
                    "mensagem": f"FFmpeg falhou: {resultado.get('erro', 'desconhecido')}",
                }

            # Garantia 1: arquivo de saída foi criado com tamanho mínimo.
            if not out_path.exists() or out_path.stat().st_size < 1024:
                return {"status": "erro", "mensagem": "Arquivo bruto não foi gerado pelo worker."}

            # F-063: corrige o lip-sync no bruto, se o corte tiver offset. Aplicado
            # ANTES do probe de duração para que duracao_clip_seg reflita o arquivo
            # final. No-op quando offset=0 — cortes sem ajuste ficam idênticos.
            await cls._aplicar_audio_offset(out_path, int(corte.audio_offset_ms or 0))

            # Garantia 2: duração real está dentro de tolerância da esperada.
            duracao_esperada = sum(sf - si for si, sf in segmentos)
            duracao_real = await cls._probe_duracao(out_path)
            if duracao_real is not None and abs(duracao_real - duracao_esperada) > 5.0:
                # Sempre logamos divergência (mesmo com verbose off) — é erro grave.
                operational_error(
                    "ExportService",
                    f"⚠️ Duração divergente: "
                    f"esperado={duracao_esperada:.1f}s real={duracao_real:.1f}s",
                )
                return {
                    "status": "erro",
                    "mensagem": (
                        f"Duração divergente: esperado={duracao_esperada:.1f}s, "
                        f"real={duracao_real:.1f}s. Tente gerar novamente."
                    ),
                }

            # Atualiza banco e sincroniza transcrição (path relativo ao projeto)
            corte.arquivo_clip_path = para_relativo_ao_projeto(str(out_path), corte.projeto_id)
            # Persiste a duração REAL do arquivo (medida via ffprobe) para o
            # frontend exibir o valor exato em vez de estimar.  Evita o
            # problema de mostrar "11:48" quando o arquivo tem 11:49.343.
            if duracao_real is not None:
                corte.duracao_clip_seg = float(duracao_real)
                if settings.bruto_verbose_log or is_debug_enabled():
                    print(
                        f"[ExportService] duracao_clip_seg salvo: {duracao_real:.3f}s",
                        flush=True,
                    )
            # Se estava aprovado, avança para processado
            if corte.status == "aprovado":
                corte.status = "processado"
            await db.commit()
            BrutoProgress.marcar(corte_id, "render", "concluido")

            # D-160 — a re-sincronização do texto (transcricao_final ↔ recorte
            # atual) é opt-in na regeração. Pular não afeta o vídeo bruto em si,
            # só o texto derivado usado por cenas/metadados.
            if refazer_transcricao:
                BrutoProgress.marcar(corte_id, "transcricao", "rodando")
                from app.services.corte import CorteService

                await CorteService.sincronizar_transcricao_corte(corte_id, db=db)
                BrutoProgress.marcar(corte_id, "transcricao", "concluido")

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
            except Exception as exc:
                operational_error(
                    "ExportService",
                    f"Auto-trigger de detecção de segmentos falhou para {corte_id}: {exc}",
                )

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
                BrutoProgress.marcar(corte_id, "cenas", "rodando")
                try:
                    from app.services.claude_ia import ClaudeIaService

                    await ClaudeIaService.gerar_cenas_via_claude(corte_id)
                    BrutoProgress.marcar(corte_id, "cenas", "concluido")
                except Exception as exc:
                    BrutoProgress.marcar(corte_id, "cenas", "erro")
                    operational_error(
                        "ExportService", f"Cenas via Claude falharam para {corte_id}: {exc}"
                    )

            if settings.bruto_verbose_log or is_debug_enabled():
                print(f"[ExportService] ✅ Bruto gerado: {out_path.name}", flush=True)
            return {"status": "pronto", "clip_path": str(out_path)}
