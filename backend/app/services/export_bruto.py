"""Mixin de geração do vídeo bruto e cortes lossless do ExportService.

Extraído de `export` (E-006). Corta o clip lossless, re-renderiza removendo
desvios (filter_complex ou fallback por segmentos), gera o bruto via Native
Worker, e helpers de FFmpeg (offset de áudio, corte simples, concat, probe de
duração, resolução do vídeo original).
"""

import asyncio
import json
from pathlib import Path

from app.channel_paths import (
    para_relativo_ao_projeto,
    projetos_dir,
    resolver_do_projeto,
)
from app.database import AsyncSessionLocal
from app.domain.bruto_interval import calcular_intervalo_bruto
from app.domain.ffmpeg_commands import (
    build_audio_offset_cmd,
    build_concat_cmd,
    build_filter_complex_cmd,
    build_lossless_cut_cmd,
)
from app.domain.segment_calculator import (
    calcular_segmentos,
    normalizar_desvio,
)
from app.domain.time_convert import seg_to_hms
from app.infrastructure.ffmpeg_runner import run_ffmpeg, run_ffmpeg_simple
from app.models import Corte, Projeto, StatusCorte
from app.services.app_logging import (
    current_log_level,
    operational_error,
    operational_info,
)


class _ExportBrutoMixin:
    @staticmethod
    async def cortar_clip_lossless(corte_id: str):
        """
        Corta o vídeo losslessly usando ffmpeg, removendo os desvios.

        Algoritmo:
        - Sem desvios: ffmpeg -ss inicio -to fim -i video.mp4 -c copy out.mp4
        - Com N desvios: corta cada segmento separado e concatena losslessly
          Segmentos gerados para um corte [T1,T2] com desvio [D1,D2]:
            parte1: [T1 -> D1], parte2: [D2 -> T2]
        """
        # Fachada resolvida em tempo de chamada (evita ciclo de import; o método
        # é staticmethod, então não há `cls` para navegar a MRO).
        from app.services.export import ExportService

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}

            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto:
                return {"status": "erro", "mensagem": "Projeto não encontrado"}

            projeto_id = corte.projeto_id
            video_path = projetos_dir() / projeto_id / "video.mp4"
            if not video_path.exists():
                # Tenta extensões alternativas
                for ext in ["mkv", "webm", "avi", "mov"]:
                    candidate = video_path.with_suffix(f".{ext}")
                    if candidate.exists():
                        video_path = candidate
                        break

            if not video_path.exists():
                async with AsyncSessionLocal() as db2:
                    c = await db2.get(Corte, corte_id)
                    if c:
                        c.status = (
                            StatusCorte.PROCESSADO
                        )  # usa PROCESSADO p/ erro tmb, erro_msg no projeto
                corte_dict = {
                    "status": "erro",
                    "mensagem": f"Arquivo de vídeo não encontrado em {projetos_dir()}/{projeto_id}/",
                }
                return corte_dict

            # Pasta de output
            out_dir = projetos_dir() / projeto_id / "cortes" / corte_id
            out_dir.mkdir(parents=True, exist_ok=True)

            import re

            safe_title = re.sub(r"[^A-Za-z0-9_\- ]", "", corte.titulo_proposto)
            safe_title = safe_title.replace(" ", "_")[:40]
            nome_arq = f"{corte.numero:02d}_{safe_title}"

            out_path = out_dir / f"{nome_arq}.mkv"

            if out_path.exists():
                try:
                    out_path.unlink()
                except Exception:
                    return {
                        "status": "erro",
                        "mensagem": f"{out_path.name} está aberto em outro programa. Feche-o e tente novamente.",
                    }

            try:
                # Extrai o clipe bruto exatamente no intervalo [inicio_seg, fim_seg] do corte.
                # Sem padding: a duração do arquivo coincide com (fim - inicio) mostrado no editor.
                inicio_real, fim_real = calcular_intervalo_bruto(
                    corte.inicio_seg,
                    corte.fim_seg,
                    projeto.duracao_segundos,
                )

                cmd = build_lossless_cut_cmd(video_path, out_path, inicio_real, fim_real)
                await ExportService._run_cmd_via_worker(
                    f"{corte_id}_lossless",
                    [str(c) for c in cmd],
                    str(out_dir.absolute()),
                )

                # F-063: corrige o lip-sync no bruto, se o corte tiver offset.
                await ExportService._aplicar_audio_offset(out_path, int(corte.audio_offset_ms or 0))

                # Gera o CSV de desvios automaticamente na pasta
                try:
                    await ExportService.gerar_csv_desvios_corte(corte_id)
                except Exception as e_csv:
                    operational_error(
                        "ExportService", f"Atenção: Erro ao auto-gerar CSV do LosslessCut: {e_csv}"
                    )

                # Atualiza banco — clip gerado, status processado se já era aprovado
                async with AsyncSessionLocal() as db2:
                    c = await db2.get(Corte, corte_id)
                    if c:
                        c.arquivo_clip_path = para_relativo_ao_projeto(str(out_path), c.projeto_id)
                        # Só avança para processado se já estava aprovado.
                        # Se estava proposto (geração bruta prévia), mantém proposto.
                        if c.status == StatusCorte.APROVADO:
                            c.status = StatusCorte.PROCESSADO
                        await db2.commit()

                return {"status": "pronto", "clip_path": str(out_path)}

            except Exception as e:
                operational_error("ExportService", f"Erro ao cortar {corte_id}: {e}")
                return {"status": "erro", "mensagem": str(e)}

    @staticmethod
    async def _run_cmd_via_worker(
        job_id: str, cmd: list[str], cwd: str, timeout: int = 600
    ) -> None:
        """Despacha um comando FFmpeg ao Native Worker (fila JSON) e aguarda o resultado.

        Mesmo mecanismo que gerar_bruto_via_worker — evita NotImplementedError do
        asyncio.create_subprocess_exec no Windows (SelectorEventLoop).

        Raises RuntimeError se o worker não responder no timeout ou reportar falha.
        """
        fila_dir = projetos_dir() / "fila_remotion"
        fila_dir.mkdir(parents=True, exist_ok=True)

        req_file = fila_dir / f"req_{job_id}.json"
        res_file = fila_dir / f"res_{job_id}.json"

        if req_file.exists():
            req_file.unlink()
        if res_file.exists():
            res_file.unlink()

        job_data = {"id": job_id, "cwd": cwd, "cmd": cmd, "log_level": current_log_level().value}
        with open(req_file, "w", encoding="utf-8") as f:
            json.dump(job_data, f, ensure_ascii=False)

        operational_info("ExportService", f"Job '{job_id}' enfileirado para Native Worker.")

        elapsed = 0
        while elapsed < timeout:
            if res_file.exists():
                break
            await asyncio.sleep(2)
            elapsed += 2

        if not res_file.exists():
            raise RuntimeError(f"Native Worker não respondeu em {timeout}s (job={job_id})")

        try:
            with open(res_file, encoding="utf-8") as f:
                resultado = json.load(f)
            res_file.unlink()
        except Exception as e:
            raise RuntimeError(f"Falha ao ler resposta do Native Worker: {e}") from e

        if resultado.get("status") != "sucesso":
            raise RuntimeError(f"FFmpeg falhou (worker): {resultado.get('erro', 'desconhecido')}")

    @classmethod
    async def processar_desvios_rerender(cls, corte_id: str):
        """
        Caminho A: Re-renderiza o vídeo removendo todos os desvios de forma automatizada usando ffmpeg filter_complex.
        """
        try:
            async with AsyncSessionLocal() as db:
                corte = await db.get(Corte, corte_id)
                if not corte:
                    return {"status": "erro", "mensagem": "Corte não encontrado"}

                projeto = await db.get(Projeto, corte.projeto_id)
                if not projeto:
                    return {"status": "erro", "mensagem": "Projeto não encontrado"}

                video_path = None
                db_video_path = str(resolver_do_projeto(projeto.arquivo_video_path, projeto.id))

                if db_video_path and Path(db_video_path).exists():
                    video_path = Path(db_video_path)
                else:
                    # Fallback: busca na pasta do projeto
                    base_path = projetos_dir() / corte.projeto_id / "video"
                    for ext in ["mkv", "webm", "avi", "mov", "mp4"]:
                        candidate = base_path.with_suffix(f".{ext}")
                        if candidate.exists():
                            video_path = candidate
                            break

                if not video_path or not video_path.exists():
                    return {
                        "status": "erro",
                        "mensagem": f"Arquivo de vídeo original não encontrado. (Procurado em: {projeto.arquivo_video_path})",
                    }

                out_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
                out_dir.mkdir(parents=True, exist_ok=True)

                # Output final consolidado (MKV preferível para evitar corrupção e manter sync no FFmpeg)
                out_path = out_dir / "clip_raw.mkv"
                if out_path.exists():
                    try:
                        out_path.unlink()
                    except Exception:
                        return {
                            "status": "erro",
                            "mensagem": "O arquivo de vídeo final está aberto em outro programa. Feche-o e tente novamente.",
                        }

                try:
                    desvios_raw = json.loads(corte.desvios or "[]")
                except json.JSONDecodeError:
                    print(
                        f"[ExportService] desvios do corte {corte_id} corrompidos "
                        f"(JSON inválido); assumindo lista vazia."
                    )
                    desvios_raw = []
                desvios = [normalizar_desvio(d) for d in desvios_raw]
                segmentos = calcular_segmentos(
                    float(corte.inicio_seg), float(corte.fim_seg), desvios
                )

                if not segmentos:
                    return {"status": "erro", "mensagem": "Nenhum segmento válido para renderizar."}

                if len(segmentos) > cls._SEGMENT_FALLBACK_THRESHOLD:
                    operational_info(
                        "ExportService",
                        f"Muitas partes ({len(segmentos)}), usando fallback por segmentos (re-encode).",
                    )
                    try:
                        await cls._rerender_by_reencode_segments_local(
                            video_path, out_path, segmentos
                        )
                        operational_info(
                            "ExportService",
                            "✅ Re-renderização por segmentos concluída com sucesso!",
                        )
                    except Exception as e:
                        operational_error("ExportService", f"❌ ERRO re-encode segments: {e}")
                        return {
                            "status": "erro",
                            "mensagem": "Erro na re-renderização por segmentos. Veja logs.",
                        }
                else:
                    cmd = build_filter_complex_cmd(video_path, out_path, segmentos)
                    operational_info(
                        "ExportService", f"Iniciando re-renderização do corte {corte_id}..."
                    )
                    result = await run_ffmpeg(cmd, label=f"rerender_{corte_id}")
                    if result.returncode != 0:
                        operational_error("ExportService", f"❌ ERRO FFmpeg:\n{result.stderr_tail}")
                        return {
                            "status": "erro",
                            "mensagem": "Erro na re-renderização. Veja os logs do servidor.",
                        }
                    operational_info("ExportService", "✅ Re-renderização concluída com sucesso!")

                # F-063: corrige o lip-sync no bruto, se o corte tiver offset.
                await cls._aplicar_audio_offset(out_path, int(corte.audio_offset_ms or 0))

                # Atualiza o arquivo de clip gerado para o novo (relativo ao projeto)
                corte.arquivo_clip_path = para_relativo_ao_projeto(str(out_path), corte.projeto_id)
                corte.status = StatusCorte.PROCESSADO
                await db.commit()

                return {"status": "pronto", "clip_path": str(out_path)}
        except Exception as e:
            import traceback

            operational_error(
                "ExportService", f"💥 Exceção na exportação: {e}\n{traceback.format_exc()}"
            )
            return {"status": "erro", "mensagem": f"Erro interno no servidor: {str(e)}"}

    @staticmethod
    async def _probe_duracao(file_path: Path) -> float | None:
        """Retorna a duração em segundos via ffprobe, ou None se falhar.

        Exemplo:
            >>> dur = await ExportService._probe_duracao(Path("clip.mkv"))
            >>> dur > 0
            True
        """
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(file_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            return float(stdout.decode().strip())
        except Exception:
            return None

    @staticmethod
    def _resolver_video_path(projeto, projeto_id: str):
        """Localiza o arquivo de vídeo original do projeto.

        Exemplo:
            >>> path = ExportService._resolver_video_path(projeto, "abc")
            >>> path.suffix
            '.mp4'
        """
        if projeto.arquivo_video_path and Path(projeto.arquivo_video_path).exists():
            return Path(projeto.arquivo_video_path)

        base_path = projetos_dir() / projeto_id / "video.mp4"
        if base_path.exists():
            return base_path

        for ext in ["mkv", "webm", "avi", "mov", "mp4"]:
            candidate = base_path.with_suffix(f".{ext}")
            if candidate.exists():
                return candidate

        return None

    @staticmethod
    async def _aplicar_audio_offset(clip_path: Path, offset_ms: int) -> None:
        """Aplica o offset de áudio (lip-sync, F-063) ao bruto recém-gerado.

        No-op quando offset_ms == 0 (caso padrão, sem regressão). Caso contrário,
        reescreve o clip no lugar, deslocando o áudio em relação ao vídeo. Como
        grade/overlay/render final herdam o áudio do bruto, a correção propaga.
        """
        if not offset_ms:
            return
        tmp_path = clip_path.with_name(f"{clip_path.stem}.offset.tmp{clip_path.suffix}")
        cmd = build_audio_offset_cmd(clip_path, tmp_path, offset_ms)
        await run_ffmpeg_simple(cmd, label="ffmpeg_audio_offset")
        tmp_path.replace(clip_path)

    @staticmethod
    async def _ffmpeg_corte_simples(video: Path, out: Path, inicio: float, fim: float):
        """Corta um segmento losslessly. Usa -ss INPUT para precisão."""
        cmd = build_lossless_cut_cmd(video, out, inicio, fim)
        await run_ffmpeg_simple(cmd, label="ffmpeg_corte_simples")

    @staticmethod
    async def _ffmpeg_concat(partes: list, out: Path):
        """Concatena várias partes losslessly usando ffmpeg concat demuxer."""
        concat_file = out.parent / "concat_list.txt"
        linhas = [f"file '{str(p.resolve())}'" for p in partes]
        concat_file.write_text("\n".join(linhas), encoding="utf-8")

        cmd = build_concat_cmd(concat_file, out)
        try:
            await run_ffmpeg_simple(cmd, label="ffmpeg_concat")
        finally:
            concat_file.unlink(missing_ok=True)

    @staticmethod
    async def _rerender_by_reencode_segments_local(
        video_path: Path, out_path: Path, segmentos: list
    ):
        """Re-encoda cada segmento separadamente e concatena os arquivos resultantes.

        Usado como fallback quando um filter_complex com muitas trims trava.
        """
        import tempfile as _temp

        temp_dir = Path(_temp.mkdtemp(prefix=f"tmp_rerender_{out_path.stem}_"))
        parts = []
        try:
            for idx, (seg_i, seg_f) in enumerate(segmentos):
                part = temp_dir / f"part_{idx:03d}.mkv"
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-nostdin",
                    "-i",
                    str(video_path),
                    "-ss",
                    seg_to_hms(seg_i),
                    "-to",
                    seg_to_hms(seg_f),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "ultrafast",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-movflags",
                    "+faststart",
                    str(part),
                ]
                await run_ffmpeg_simple(cmd, label=f"rerender_seg_{idx}")
                parts.append(str(part))

            concat_file = temp_dir / "concat_list.txt"
            # Backslash em expressão de f-string só é aceito a partir do
            # Python 3.12 (PEP 701); o CI roda 3.11 — manter o replace fora.
            caminhos = [str(Path(p).resolve()).replace("\\\\", "/") for p in parts]
            linhas = [f"file '{caminho}'" for caminho in caminhos]
            concat_file.write_text("\n".join(linhas), encoding="utf-8")

            cmd = [
                "ffmpeg",
                "-y",
                "-nostdin",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_file),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(out_path),
            ]
            await run_ffmpeg_simple(cmd, label="rerender_concat")
        finally:
            import shutil as _shutil

            _shutil.rmtree(str(temp_dir), ignore_errors=True)
