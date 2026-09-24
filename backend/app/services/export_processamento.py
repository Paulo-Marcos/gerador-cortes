"""Mixin de processamento final do clip: normalização, intro/outro, metadados,
versões multi-filtro e faststart.

Extraído de `export` (E-006). Consome o clip bruto e produz o `video.mp4`
pronto para upload (normaliza áudio + filtro, concatena intro/outro, copia
thumbnail/metadados) e as variações por filtro.
"""

import asyncio
import json
from pathlib import Path

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.config import settings
from app.database import AsyncSessionLocal
from app.infrastructure.ffmpeg_runner import run_ffmpeg
from app.infrastructure.render.cinema_filters import FILTROS_CINEMA, get_filtro_vf
from app.infrastructure.render.ffmpeg_commands import build_normalize_cmd
from app.models import Corte
from app.services.app_logging import operational_error, operational_info


class _ExportProcessamentoMixin:
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
        # D-647: declarava 8h e recebia 1h (o timeout se perdia no caminho em
        # thread). 1h é o que a produção sempre praticou — o número agora diz a
        # verdade. Aumentar exige medir uma normalização longa de verdade.
        result = await run_ffmpeg(cmd, label="ffmpeg_normalizar", timeout=3600)

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

            # D-645: o clipe inteiro — copiar no loop segura todas as telas.
            await asyncio.to_thread(shutil.copy2, str(clip_path), str(output_path))
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

        await asyncio.to_thread(_shutil.rmtree, str(temp_dir), ignore_errors=True)

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

    @classmethod
    async def processar_multiversion(
        cls,
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
                    # D-645: cada pasta guarda uma versão renderizada inteira.
                    await asyncio.to_thread(_shutil.rmtree, str(pasta), ignore_errors=True)
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
                        await cls._normalizar_audio(
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
                        await cls._normalizar_audio(clip_path, normalizado, filtro=filtro)
                        await cls._adicionar_intro_outro(normalizado, final)
                        import shutil

                        await asyncio.to_thread(shutil.copy2, str(final), str(destino))
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
