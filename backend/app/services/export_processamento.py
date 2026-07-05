"""Mixin de processamento final do clip: normalização, intro/outro, metadados,
versões multi-filtro e faststart.

Extraído de `export` (E-006). Consome o clip bruto e produz o `video.mp4`
pronto para upload (normaliza áudio + filtro, concatena intro/outro, copia
thumbnail/metadados) e as variações por filtro.
"""

import asyncio
import json
import shutil
from pathlib import Path

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.cinema_filters import FILTROS_CINEMA, get_filtro_vf
from app.domain.ffmpeg_commands import build_normalize_cmd
from app.infrastructure.ffmpeg_runner import run_ffmpeg
from app.models import Corte, Projeto
from app.services.app_logging import operational_error, operational_info


class _ExportProcessamentoMixin:
    @staticmethod
    async def processar_clip(corte_id: str, filtro: str = "nenhum"):
        """
        Processa um clip já cortado:
        1. Normaliza áudio e aplica filtro visual em uma ÚNICA passada (se possível)
        2. Concatena intro/outro (re-encodando se necessário, mas com preset leve)
        """
        from app.services.export import ExportService

        operational_info("service", f"🚀 [1/4] Iniciando processar_clip para o corte: {corte_id}")
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte or not corte.arquivo_clip_path:
                operational_error("service", f"❌ ABORTADO: Corte {corte_id} sem arquivo_clip_path")
                return
            await db.get(Projeto, corte.projeto_id)

        projeto_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
        projeto_dir.mkdir(parents=True, exist_ok=True)

        # Como o usuário pode salvar manualmente do LosslessCut o arquivo `clip_raw.mkv` ou `.mp4`
        clip_mkv = projeto_dir / "clip_raw.mkv"
        clip_mp4 = projeto_dir / "clip_raw.mp4"

        if clip_mkv.exists():
            clip_path = clip_mkv
            operational_info("service", f"Usando vídeo ajustado final (MKV): {clip_path}")
        elif clip_mp4.exists():
            clip_path = clip_mp4
            operational_info("service", f"Usando vídeo ajustado final (MP4): {clip_path}")
        else:
            clip_path = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)

        if not clip_path.exists():
            operational_error(
                "service", f"❌ ABORTADO: Arquivo de clip não encontrado: {clip_path}"
            )
            return

        # Passo 1: Normalização e Filtro
        operational_info("service", f"⚙️ [2/4] Iniciando Normalização + Filtro ('{filtro}')...")
        clip_normalizado = projeto_dir / "clip_normalized.mkv"
        try:
            await ExportService._normalizar_audio(clip_path, clip_normalizado, filtro=filtro)
        except Exception as e:
            operational_error("service", f"❌ ERRO em _normalizar_audio ({corte_id}): {e}")
            return

        if not clip_normalizado.exists():
            operational_error("service", "❌ FALHA: clip_normalized.mkv não foi criado!")
            return

        # Passo 2: Intro/Outro
        operational_info("service", "⚙️ [3/4] Iniciando Concatenação (Intro/Outro)...")
        clip_final = projeto_dir / "clip_final.mp4"
        await ExportService._adicionar_intro_outro(clip_normalizado, clip_final)

        if not clip_final.exists():
            operational_error("service", "❌ FALHA: clip_final.mp4 não foi criado!")
            return

        # Passo 3: Preparação final e copias
        operational_info("service", "📦 [4/4] Finalizando: Copiando para upload_ready...")
        upload_dir = projeto_dir / "upload_ready"
        upload_dir.mkdir(exist_ok=True)
        final_dest = upload_dir / "video.mp4"
        shutil.copy2(str(clip_final), str(final_dest))

        operational_info("service", "📄 Gerando metadados.txt...")
        await ExportService._gerar_metadados_txt(corte_id, upload_dir)

        # Copia a thumbnail se existir (busca no MetadadoCorte)
        from app.models import MetadadoCorte
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

            if meta and meta.thumbnail_path:
                thumb_source = resolver_do_projeto(meta.thumbnail_path, corte.projeto_id)
                if thumb_source.exists():
                    thumb_dest = upload_dir / "thumbnail.jpg"
                    shutil.copy2(str(thumb_source), str(thumb_dest))
                    operational_info("service", "🖼️ Thumbnail copiada para upload_ready.")

        operational_info(
            "service",
            f"✨ [CONCLUÍDO] Corte {corte_id} processado com sucesso! Caminho: {final_dest}",
        )

    @staticmethod
    async def _normalizar_audio(
        input_path: Path,
        output_path: Path,
        filtro: str = "nenhum",
        preview_segundos: int | None = None,
    ):
        """Aplica filtro de cor (se houver) e normaliza áudio para padrão Youtube."""
        filtro_vf = get_filtro_vf(filtro)
        cmd = build_normalize_cmd(input_path, output_path, filtro_vf=filtro_vf)

        if preview_segundos:
            cmd = ["ffmpeg", "-y", "-nostdin", "-t", str(preview_segundos)] + cmd[3:]

        operational_info("ExportService", f"Normalizando vídeo/áudio: {output_path.name}...")
        result = await run_ffmpeg(cmd, label="ffmpeg_normalizar", timeout=28800)

        if result.returncode != 0:
            raise RuntimeError(f"Falha na normalização de áudio: {result.stderr_tail}")

        if not output_path.exists():
            raise RuntimeError("Output file was not created by ffmpeg normalization.")

    @staticmethod
    async def _adicionar_intro_outro(clip_path: Path, output_path: Path):
        """ffmpeg: concatena intro.mp4 + clip (+ outro.mp4 se existir)."""
        assets_dir = Path(settings.assets_dir) / "intro"
        intro = assets_dir / "intro.mp4"
        outro = assets_dir / "outro.mp4"

        partes = []
        if intro.exists():
            partes.append(str(intro))
        partes.append(str(clip_path))
        if outro.exists():
            partes.append(str(outro))

        if len(partes) == 1:
            # Sem intro/outro: copia clip diretamente
            import shutil

            shutil.copy2(str(clip_path), str(output_path))
            return

        # Com intro/outro: precisa re-encodar tudo compatível
        # Primeiro, normaliza cada parte para formato padrão (h264+aac)
        partes_normalized = []
        temp_dir = output_path.parent / ".temp_concat"
        temp_dir.mkdir(exist_ok=True)

        for idx, parte_path in enumerate(partes):
            normalized = temp_dir / f"part_{idx}.mkv"
            if not normalized.exists():
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-nostdin",
                    "-i",
                    parte_path,
                    "-c:v",
                    "libx264",
                    "-preset",
                    "superfast",
                    "-crf",
                    "22",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-ar",
                    "48000",
                    "-max_muxing_queue_size",
                    "1024",
                    "-movflags",
                    "+faststart",
                    str(normalized),
                ]
                from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple

                try:
                    await run_ffmpeg_simple(cmd, label=f"concat-normalize-{idx}")
                except Exception as e:
                    operational_error("concat-normalize", f"Erro ao normalizar part_{idx}: {e}")
                    raise RuntimeError(f"Falha ao normalizar parte {idx}") from e

            partes_normalized.append(str(normalized))

        # Depois, concatena usando concat demuxer com inputs já normalizados
        concat_file = temp_dir / "concat_list.txt"
        linhas = [f"file '{p}'" for p in partes_normalized]
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
            str(output_path),
        ]
        from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple

        try:
            await run_ffmpeg_simple(cmd, label="ffmpeg_concat")
            returncode = 0
        except Exception as e:
            operational_error("ffmpeg_concat", f"Falha na concatenação: {e}")
            returncode = -1

        # Limpa temporários
        import shutil as _shutil

        _shutil.rmtree(str(temp_dir), ignore_errors=True)

        if returncode != 0:
            raise RuntimeError("ffmpeg_concat falhou")

    @staticmethod
    async def _gerar_metadados_txt(corte_id: str, upload_dir: Path):
        """Gera arquivo de texto com metadados prontos para copiar no YouTube Studio."""
        from app.models import MetadadoCorte
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

        if not meta:
            return

        tags = json.loads(meta.tags_youtube or "[]")
        conteudo = f"""=== TÍTULO ===
{meta.titulo_youtube}

=== DESCRIÇÃO ===
{meta.descricao_youtube}

=== TAGS ===
{", ".join(tags)}
"""
        (upload_dir / "metadados.txt").write_text(conteudo, encoding="utf-8")

    @staticmethod
    async def processar_multiversion(
        corte_id: str,
        filtros: list[str] | None = None,
        preview: bool = False,
        preview_segundos: int = 10,
    ):
        """
        Gera múltiplas versões do clip em paralelo, uma para cada filtro.
        - preview=False: versão completa em versoes/{filtro}/video.mp4
        - preview=True: clip de N segundos sem intro/outro em versoes/{filtro}/preview.mp4
        """
        from app.services.export import ExportService

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte or not corte.arquivo_clip_path:
                operational_error("MultiVersion", f"Clip bruto não encontrado para {corte_id}")
                return

        if filtros is None:
            filtros = list(FILTROS_CINEMA.keys())

        clip_path = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
        if not clip_path.exists():
            operational_error("MultiVersion", f"Arquivo não encontrado: {clip_path}")
            return

        projeto_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
        versoes_dir = projeto_dir / "versoes"
        versoes_dir.mkdir(parents=True, exist_ok=True)

        # Limpa pastas de filtros antigos que não existem mais no dicionário atual
        filtros_validos = set(FILTROS_CINEMA.keys())
        if versoes_dir.exists():
            import shutil as _shutil

            for pasta in versoes_dir.iterdir():
                if pasta.is_dir() and pasta.name not in filtros_validos:
                    _shutil.rmtree(str(pasta), ignore_errors=True)
                    operational_info("MultiVersion", f"Pasta obsoleta removida: {pasta.name}")

        async def _gerar_versao(filtro: str, sem: asyncio.Semaphore):
            async with sem:  # máximo 2 ffmpeg simultâneos — evita OOM kill
                info = FILTROS_CINEMA.get(filtro, {})
                versao_dir = versoes_dir / filtro
                versao_dir.mkdir(exist_ok=True)

                if preview:
                    # Preview rápido de N segundos sem intro/outro
                    destino = versao_dir / "preview.mp4"
                    try:
                        await ExportService._normalizar_audio(
                            clip_path, destino, filtro=filtro, preview_segundos=preview_segundos
                        )
                        operational_info(
                            "MultiVersion",
                            f"Preview '{filtro}' concluído ({preview_segundos}s): {destino}",
                        )
                    except Exception as e:
                        operational_error("MultiVersion", f"Erro no preview '{filtro}': {e}")
                else:
                    # Versão completa com intro/outro
                    normalizado = versao_dir / "clip_normalized.mkv"
                    final = versao_dir / "clip_final.mp4"
                    destino = versao_dir / "video.mp4"
                    try:
                        await ExportService._normalizar_audio(clip_path, normalizado, filtro=filtro)
                        await ExportService._adicionar_intro_outro(normalizado, final)
                        import shutil

                        shutil.copy2(str(final), str(destino))
                        operational_info("MultiVersion", f"Versão '{filtro}' concluída: {destino}")
                    except Exception as e:
                        operational_error("MultiVersion", f"Erro na versão '{filtro}': {e}")

                # Salva metadados da versão (usado em ambos os modos)
                meta_json = {
                    "filtro": filtro,
                    "nome": info.get("nome", filtro),
                    "descricao": info.get("descricao", ""),
                    "preview": preview,
                }
                (versao_dir / "meta.json").write_text(
                    json.dumps(meta_json, ensure_ascii=False), encoding="utf-8"
                )

        modo = "preview" if preview else "completo"
        sem = asyncio.Semaphore(4)
        operational_info(
            "MultiVersion", f"Gerando {len(filtros)} versões (modo={modo}, max 4 simultâneos)"
        )
        await asyncio.gather(*[_gerar_versao(f, sem) for f in filtros])
        operational_info("MultiVersion", f"Concluído para corte {corte_id}")

    @staticmethod
    async def aplicar_faststart(corte_id: str):
        """Aplica faststart num arquivo video.mp4 final de forma super rápida (sem re-encode)"""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}

        video_path = (
            projetos_dir() / corte.projeto_id / "cortes" / corte_id / "upload_ready" / "video.mp4"
        )
        if not video_path.exists():
            return {"status": "erro", "mensagem": "Video final não encontrado em upload_ready"}

        temp_path = video_path.with_name("video_temp.mp4")

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(temp_path),
        ]

        from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple

        try:
            await run_ffmpeg_simple(cmd, label="faststart")
        except Exception as e:
            operational_error("faststart", f"Erro: {e}")
            if temp_path.exists():
                temp_path.unlink()
            return {"status": "erro", "mensagem": "Falha no FFmpeg ao aplicar faststart"}

        # Substitui o original
        temp_path.replace(video_path)
        return {"status": "ok", "mensagem": "Faststart aplicado com sucesso"}
