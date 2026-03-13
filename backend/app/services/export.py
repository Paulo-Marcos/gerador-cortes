"""
Serviço de Export — CSV LosslessCut + corte lossless com ffmpeg + processamento (áudio + intro/outro)
"""

import asyncio
import json
import tempfile
from pathlib import Path

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Corte, Projeto, StatusCorte


def _hms_to_srt(hms: str) -> str:
    """Converte HH:MM:SS para HH:MM:SS.000 (formato LosslessCut)."""
    partes = hms.split(":")
    if len(partes) == 3:
        return f"{hms}.000"
    return hms


def _seg_to_hms(seg: float) -> str:
    """Converte segundos para HH:MM:SS.mmm (compatível com ffmpeg -ss)."""
    h = int(seg // 3600)
    m = int((seg % 3600) // 60)
    s = seg % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


class ExportService:

    @staticmethod
    async def gerar_csv_losslesscut(projeto_id: str, db=None) -> str:
        """
        Gera CSV compatível com LosslessCut para um projeto.
        Inclui todos os segmentos aprovados e seus desvios (marcados como DESVIO_).
        """
        from sqlalchemy import select

        close_db = False
        if db is None:
            from app.database import AsyncSessionLocal
            db = AsyncSessionLocal()
            close_db = True

        try:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(Corte.status.in_([StatusCorte.APROVADO, StatusCorte.PROPOSTO]))
                .order_by(Corte.numero)
            )
            cortes = result.scalars().all()

            linhas = ["start,end,name"]
            for corte in cortes:
                nome = f"Tema{corte.numero}_{corte.titulo_proposto[:40].replace(' ', '_')}"
                linhas.append(f"{_hms_to_srt(corte.inicio_hms)},{_hms_to_srt(corte.fim_hms)},{nome}")

                desvios = json.loads(corte.desvios or "[]")
                for i, desvio in enumerate(desvios):
                    motivo = desvio.get("motivo", "")[:30].replace(" ", "_").replace(",", "")
                    nome_desvio = f"DESVIO_{corte.numero}_{i+1}_{motivo}"
                    linhas.append(
                        f"{_hms_to_srt(desvio['inicio_hms'])},"
                        f"{_hms_to_srt(desvio['fim_hms'])},"
                        f"{nome_desvio}"
                    )

            csv_dir = Path(settings.projetos_dir) / projeto_id
            csv_dir.mkdir(parents=True, exist_ok=True)
            csv_path = csv_dir / "losslesscut.csv"
            csv_path.write_text("\n".join(linhas), encoding="utf-8")
            return str(csv_path)
        finally:
            if close_db:
                await db.close()

    @staticmethod
    async def cortar_clip_lossless(corte_id: str):
        """
        Corta o vídeo losslessly usando ffmpeg, removendo os desvios.

        Algoritmo:
        - Sem desvios: ffmpeg -ss inicio -to fim -i video.mp4 -c copy out.mp4
        - Com N desvios: corta cada segmento separado e concatena losslessly
          Segmentos gerados para um corte [T1,T2] com desvio [D1,D2]:
            parte1: [T1 → D1], parte2: [D2 → T2]
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}

            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto:
                return {"status": "erro", "mensagem": "Projeto não encontrado"}

            projeto_id = corte.projeto_id
            video_path = Path(settings.projetos_dir) / projeto_id / "video.mp4"
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
                        c.status = StatusCorte.PROCESSADO  # usa PROCESSADO p/ erro tmb, erro_msg no projeto
                corte_dict = {
                    "status": "erro",
                    "mensagem": f"Arquivo de vídeo não encontrado em {settings.projetos_dir}/{projeto_id}/"
                }
                return corte_dict

            desvios = json.loads(corte.desvios or "[]")

            # Monta lista de segmentos [inicio, fim] sem os desvios
            # Ordena desvios por início para garantir ordem
            desvios_ordenados = sorted(desvios, key=lambda d: d.get("inicio_seg", 0))
            segmentos = ExportService._calcular_segmentos(
                corte.inicio_seg, corte.fim_seg, desvios_ordenados
            )

            # Pasta de output
            out_dir = Path(settings.projetos_dir) / projeto_id / "cortes" / corte_id
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = out_dir / "clip_raw.mp4"

            try:
                if len(segmentos) == 1:
                    # Sem desvios — corte simples lossless
                    inicio, fim = segmentos[0]
                    await ExportService._ffmpeg_corte_simples(
                        video_path, out_path, inicio, fim
                    )
                else:
                    # Com desvios — corta partes e concatena
                    partes = []
                    for i, (inicio, fim) in enumerate(segmentos):
                        parte = out_dir / f"parte_{i:03d}.mp4"
                        await ExportService._ffmpeg_corte_simples(video_path, parte, inicio, fim)
                        partes.append(parte)

                    await ExportService._ffmpeg_concat(partes, out_path)

                    # Remove partes temporárias
                    for parte in partes:
                        parte.unlink(missing_ok=True)

                # Atualiza banco — clip gerado, status processado
                async with AsyncSessionLocal() as db2:
                    c = await db2.get(Corte, corte_id)
                    if c:
                        c.arquivo_clip_path = str(out_path)
                        c.status = StatusCorte.PROCESSADO
                        await db2.commit()

                return {"status": "pronto", "clip_path": str(out_path)}

            except Exception as e:
                print(f"[ExportService] Erro ao cortar {corte_id}: {e}")
                return {"status": "erro", "mensagem": str(e)}

    @staticmethod
    def _calcular_segmentos(inicio: float, fim: float, desvios: list) -> list:
        """
        Retorna lista de (inicio, fim) após remover os desvios do intervalo [inicio, fim].
        Desvios fora do intervalo do corte são ignorados.
        """
        segmentos = []
        cursor = inicio

        for desvio in desvios:
            d_ini = desvio.get("inicio_seg", 0)
            d_fim = desvio.get("fim_seg", 0)

            # Clipa o desvio ao intervalo do corte
            d_ini = max(d_ini, inicio)
            d_fim = min(d_fim, fim)

            if d_ini <= cursor or d_fim <= d_ini:
                continue  # desvio inválido ou atrás do cursor

            # Segmento antes do desvio
            if d_ini > cursor:
                segmentos.append((cursor, d_ini))

            cursor = d_fim

        # Segmento final (depois do último desvio)
        if cursor < fim:
            segmentos.append((cursor, fim))

        return segmentos if segmentos else [(inicio, fim)]

    @staticmethod
    async def _ffmpeg_corte_simples(video: Path, out: Path, inicio: float, fim: float):
        """Corta um segmento losslessly. Usa -ss INPUT para precisão."""
        cmd = [
            "ffmpeg", "-y",
            "-ss", _seg_to_hms(inicio),
            "-to", _seg_to_hms(fim),
            "-i", str(video),
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            str(out)
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg falhou: {stderr.decode()[-500:]}")

    @staticmethod
    async def _ffmpeg_concat(partes: list, out: Path):
        """Concatena várias partes losslessly usando ffmpeg concat demuxer."""
        concat_file = out.parent / "concat_list.txt"
        linhas = [f"file '{str(p.resolve())}'" for p in partes]
        concat_file.write_text("\n".join(linhas), encoding="utf-8")

        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_file),
            "-c", "copy",
            str(out)
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        concat_file.unlink(missing_ok=True)
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg concat falhou: {stderr.decode()[-500:]}")

    @staticmethod
    async def processar_clip(corte_id: str, filtro: str = "nenhum"):
        """
        Processa um clip já cortado:
        1. Normaliza áudio para -14 LUFS / -1.0 dBTP
        2. Aplica filtro visual (se selecionado)
        3. Concatena intro + clip (+ outro, se existir)
        4. Salva em upload_ready/
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte or not corte.arquivo_clip_path:
                print(f"[processar_clip] Corte {corte_id} sem arquivo_clip_path")
                return
            await db.get(Projeto, corte.projeto_id)

        clip_path = Path(corte.arquivo_clip_path)
        if not clip_path.exists():
            print(f"[processar_clip] Arquivo de clip não encontrado: {clip_path}")
            return

        projeto_dir = Path(settings.projetos_dir) / corte.projeto_id / "cortes" / corte_id
        projeto_dir.mkdir(parents=True, exist_ok=True)

        print(f"[processar_clip] Iniciando filtro='{filtro}' para {corte_id}")
        print(f"[processar_clip] Input: {clip_path}")

        clip_normalizado = projeto_dir / "clip_normalized.mp4"
        try:
            await ExportService._normalizar_audio(clip_path, clip_normalizado, filtro=filtro)
        except Exception as e:
            print(f"[processar_clip] ERRO em _normalizar_audio: {e}")
            return

        if not clip_normalizado.exists():
            print(f"[processar_clip] FALHA: clip_normalized.mp4 não foi criado! Verifique os logs do ffmpeg acima.")
            return

        clip_final = projeto_dir / "clip_final.mp4"
        await ExportService._adicionar_intro_outro(clip_normalizado, clip_final)

        if not clip_final.exists():
            print(f"[processar_clip] FALHA: clip_final.mp4 não foi criado!")
            return

        upload_dir = projeto_dir / "upload_ready"
        upload_dir.mkdir(exist_ok=True)
        final_dest = upload_dir / "video.mp4"
        import shutil
        shutil.copy2(str(clip_final), str(final_dest))

        await ExportService._gerar_metadados_txt(corte_id, upload_dir)
        print(f"[processar_clip] ✅ Sucesso! Arquivo final: {final_dest}")

    # ────────────────────────────────────────────────────────────
    # PREDEFINIÇÕES DE FILTROS CINEMATOGRÁFICOS HÍBRIDOS
    # Todos os filtros partem da base cinemática (teal+orange+letterbox)
    # e acrescentam a 'essência' do segundo estilo.
    # ────────────────────────────────────────────────────────────

    # Bloco base cinemático (reutilizado em todos os híbridos)
    # rh=0.08 (era 0.15): menos amarelado nos realces
    _BASE_CINEMATIC = (
        "curves=r='0/0.05 0.5/0.55 1/0.95':g='0/0.03 0.5/0.5 1/0.92':b='0/0.05 0.5/0.48 1/0.9',"
        "colorbalance=rs=-0.1:gs=0.0:bs=0.1:rh=0.08:gh=0.0:bh=-0.15,"
        "vignette=PI/5,"
        "drawbox=y=0:color=black:height=ih*0.08:t=fill,"
        "drawbox=y=ih-ih*0.08:color=black:height=ih*0.08:t=fill"
    )

    FILTROS_CINEMA: dict = {
        "nenhum": {
            "nome": "Original",
            "vf": None,
            "descricao": "Sem filtro de cor"
        },
        "cinematic": {
            "nome": "Cinemático I (Teal/Orange atual)",
            "vf": (
                # Curvas com lifted blacks
                "curves=r='0/0.05 0.5/0.55 1/0.95':g='0/0.03 0.5/0.5 1/0.92':b='0/0.05 0.5/0.48 1/0.9',"
                # rh=0.08 = laranja moderado nos realces
                "colorbalance=rs=-0.1:gs=0.0:bs=0.1:rh=0.08:gh=0.0:bh=-0.15,"
                "eq=contrast=1.12:saturation=0.85:brightness=-0.02,"
                "vignette=PI/5,"
                "drawbox=y=0:color=black:height=ih*0.08:t=fill,"
                "drawbox=y=ih-ih*0.08:color=black:height=ih*0.08:t=fill"
            ),
            "descricao": "Teal/Orange original, letterbox 2.35:1"
        },
        "cinematic_ii": {
            "nome": "Cinemático II (menos laranja)",
            "vf": (
                "curves=r='0/0.05 0.5/0.55 1/0.95':g='0/0.03 0.5/0.5 1/0.92':b='0/0.05 0.5/0.48 1/0.9',"
                # rh=0.04 = laranja suave, bh=-0.1 = menos frio
                "colorbalance=rs=-0.1:gs=0.0:bs=0.1:rh=0.04:gh=0.0:bh=-0.1,"
                "eq=contrast=1.12:saturation=0.85:brightness=-0.02,"
                "vignette=PI/5,"
                "drawbox=y=0:color=black:height=ih*0.08:t=fill,"
                "drawbox=y=ih-ih*0.08:color=black:height=ih*0.08:t=fill"
            ),
            "descricao": "Teal/Orange suavizado, menos quente nos realces"
        },
        "cinematic_iii": {
            "nome": "Cinemático III (realces neutros)",
            "vf": (
                "curves=r='0/0.05 0.5/0.55 1/0.95':g='0/0.03 0.5/0.5 1/0.92':b='0/0.05 0.5/0.48 1/0.9',"
                # rh=0.0, bh=-0.05 = realces quase neutros, só teal nas sombras
                "colorbalance=rs=-0.1:gs=0.0:bs=0.1:rh=0.0:gh=0.0:bh=-0.05,"
                "eq=contrast=1.12:saturation=0.85:brightness=-0.02,"
                "vignette=PI/5,"
                "drawbox=y=0:color=black:height=ih*0.08:t=fill,"
                "drawbox=y=ih-ih*0.08:color=black:height=ih*0.08:t=fill"
            ),
            "descricao": "Teal puro, realces neutros, sem laranja"
        },
        "cine_frio": {
            "nome": "Cinemático + Frio",
            "vf": (
                "curves=r='0/0.04 0.5/0.52 1/0.93':g='0/0.04 0.5/0.5 1/0.92':b='0/0.07 0.5/0.52 1/0.92',"
                "colorbalance=rs=-0.12:gs=0.0:bs=0.18:bm=0.08:rh=0.05:gh=0.0:bh=-0.1,"
                "eq=contrast=1.1:saturation=0.88:brightness=-0.02,"
                "vignette=PI/5,"
                "drawbox=y=0:color=black:height=ih*0.08:t=fill,"
                "drawbox=y=ih-ih*0.08:color=black:height=ih*0.08:t=fill"
            ),
            "descricao": "Teal dominante, Blue Hour, realces frios"
        },
        "cine_vintage": {
            "nome": "Cinemático + Vintage",
            "vf": (
                # Mesma cor do Cinemático I (aprovado) + grão de película
                "curves=r='0/0.05 0.5/0.55 1/0.95':g='0/0.03 0.5/0.5 1/0.92':b='0/0.05 0.5/0.48 1/0.9',"
                "colorbalance=rs=-0.1:gs=0.0:bs=0.1:rh=0.08:gh=0.0:bh=-0.15,"
                "eq=contrast=1.12:saturation=0.85:brightness=-0.02,"
                "noise=c0s=10:c0f=t+u,"
                "vignette=PI/4,"
                "drawbox=y=0:color=black:height=ih*0.08:t=fill,"
                "drawbox=y=ih-ih*0.08:color=black:height=ih*0.08:t=fill"
            ),
            "descricao": "Cinem\u00e1tico I + gr\u00e3o de pel\u00edcula Kodak, vinheta forte"
        },
    }

    @classmethod
    def _get_filtro_vf(cls, filtro: str) -> str | None:
        return cls.FILTROS_CINEMA.get(filtro, {}).get("vf")

    @staticmethod
    async def _normalizar_audio(
        input_path: Path,
        output_path: Path,
        filtro: str = "nenhum",
        preview_segundos: int | None = None,
    ):
        """ffmpeg: normaliza áudio e aplica filtro visual. Se preview_segundos definido, gera apenas N segundos."""
        filtro_vf = ExportService._get_filtro_vf(filtro)
        af = "loudnorm=I=-14:TP=-1.0:LRA=11"

        cmd = ["ffmpeg", "-y"]

        # Preview: extrai N segundos a partir de 10% da duração para ser representativo
        if preview_segundos:
            probe = await asyncio.create_subprocess_exec(
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(input_path),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            probe_out, _ = await probe.communicate()
            try:
                duracao = float(probe_out.decode().strip())
                offset = max(0.0, duracao * 0.10)  # começa em 10% do vídeo
            except (ValueError, IndexError):
                offset = 0.0
            cmd += ["-ss", str(offset), "-i", str(input_path), "-t", str(preview_segundos)]
        else:
            cmd += ["-i", str(input_path)]

        if filtro_vf:
            cmd += ["-vf", filtro_vf, "-af", af,
                    "-c:v", "libx264", "-preset", "fast", "-crf", "20",
                    "-c:a", "aac", "-b:a", "192k"]
        else:
            cmd += ["-af", af, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k"]
        cmd.append(str(output_path))

        print(f"[ffmpeg] filtro='{filtro}' preview={preview_segundos}s | CMD: {' '.join(cmd)}")

        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        stderr_txt = stderr.decode(errors='replace')

        if proc.returncode != 0:
            print(f"[ffmpeg] ERRO (returncode={proc.returncode}) filtro='{filtro}':")
            print(f"[ffmpeg] --- stderr ---\n{stderr_txt[-800:]}")
            raise RuntimeError(f"ffmpeg falhou (filtro={filtro}) returncode={proc.returncode}")

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
            import shutil
            shutil.copy2(str(clip_path), str(output_path))
            return

        # Obter Dimensões Nativas do clipe original para não distorcer o resultado Final
        probe = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "error", "-show_entries", "stream=width,height",
            "-of", "csv=p=0:s=x", str(clip_path),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        probe_out, _ = await probe.communicate()
        w, h = 1920, 1080  # fallback
        try:
            res_str = probe_out.decode().strip().split(r'\n')[0] # Pega a primeira linha
            if 'x' in res_str:
                res = res_str.split('x')
                w, h = int(res[0]), int(res[1])
        except Exception as e:
            print(f"[ExportService] Falha ao extrair dimensões base com ffprobe. Usando o padrão 1920x1080. Erro: {e}")

        # Montagem de Filtros Complexos para igualar codecs, framerate, pixels...
        n = len(partes)
        cmd = ["ffmpeg", "-y"]
        for p in partes:
            cmd.extend(["-i", p])

        filter_parts = []
        concat_inputs = ""
        for i in range(n):
            # Equaliza a resolução adicionando pad (faixa preta) para vídeos que não cobrem a dimensão exata
            # e forçando o pixel aspect ratio (SAR=1)
            filter_parts.append(f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v{i}];")
            # Força o aresample p/ 44.1kHz para não ter engasgos no audio base
            filter_parts.append(f"[{i}:a]aresample=44100[a{i}];")
            
            concat_inputs += f"[v{i}][a{i}]"

        filter_str = "".join(filter_parts) + f"{concat_inputs}concat=n={n}:v=1:a=1[v][a]"

        cmd.extend([
            "-filter_complex", filter_str,
            "-map", "[v]",
            "-map", "[a]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "20",
            "-c:a", "aac",
            "-b:a", "192k",
            str(output_path)
        ])

        print(f"[ffmpeg_concat] CMD: {' '.join(cmd)}")
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            print(f"[ffmpeg_concat] Falha na concatenação:")
            print(stderr.decode()[-800:])
            raise RuntimeError(f"ffmpeg_concat falhou, returncode={proc.returncode}")

    @staticmethod
    async def _gerar_metadados_txt(corte_id: str, upload_dir: Path):
        """Gera arquivo de texto com metadados prontos para copiar no YouTube Studio."""
        from sqlalchemy import select
        from app.models import MetadadoCorte

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
{', '.join(tags)}
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
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte or not corte.arquivo_clip_path:
                print(f"[MultiVersion] Clip bruto não encontrado para {corte_id}")
                return

        if filtros is None:
            filtros = list(ExportService.FILTROS_CINEMA.keys())

        clip_path = Path(corte.arquivo_clip_path)
        if not clip_path.exists():
            print(f"[MultiVersion] Arquivo não encontrado: {clip_path}")
            return

        projeto_dir = Path(settings.projetos_dir) / corte.projeto_id / "cortes" / corte_id
        versoes_dir = projeto_dir / "versoes"
        versoes_dir.mkdir(parents=True, exist_ok=True)

        # Limpa pastas de filtros antigos que não existem mais no dicionário atual
        filtros_validos = set(ExportService.FILTROS_CINEMA.keys())
        if versoes_dir.exists():
            import shutil as _shutil
            for pasta in versoes_dir.iterdir():
                if pasta.is_dir() and pasta.name not in filtros_validos:
                    _shutil.rmtree(str(pasta), ignore_errors=True)
                    print(f"[MultiVersion] Pasta obsoleta removida: {pasta.name}")

        async def _gerar_versao(filtro: str, sem: asyncio.Semaphore):
            async with sem:  # máximo 2 ffmpeg simultâneos — evita OOM kill
                info = ExportService.FILTROS_CINEMA.get(filtro, {})
                versao_dir = versoes_dir / filtro
                versao_dir.mkdir(exist_ok=True)

                if preview:
                    # Preview rápido de N segundos sem intro/outro
                    destino = versao_dir / "preview.mp4"
                    try:
                        await ExportService._normalizar_audio(
                            clip_path, destino, filtro=filtro,
                            preview_segundos=preview_segundos
                        )
                        print(f"[MultiVersion] Preview '{filtro}' concluído ({preview_segundos}s): {destino}")
                    except Exception as e:
                        print(f"[MultiVersion] Erro no preview '{filtro}': {e}")
                else:
                    # Versão completa com intro/outro
                    normalizado = versao_dir / "clip_normalized.mp4"
                    final = versao_dir / "clip_final.mp4"
                    destino = versao_dir / "video.mp4"
                    try:
                        await ExportService._normalizar_audio(clip_path, normalizado, filtro=filtro)
                        await ExportService._adicionar_intro_outro(normalizado, final)
                        import shutil
                        shutil.copy2(str(final), str(destino))
                        print(f"[MultiVersion] Versão '{filtro}' concluída: {destino}")
                    except Exception as e:
                        print(f"[MultiVersion] Erro na versão '{filtro}': {e}")

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

        sem = asyncio.Semaphore(2)  # máximo 2 processos ffmpeg ao mesmo tempo
        modo = "preview" if preview else "completo"
        print(f"[MultiVersion] Gerando {len(filtros)} versões (modo={modo}, max 2 simultâneos)")
        await asyncio.gather(*[_gerar_versao(f, sem) for f in filtros])
        print(f"[MultiVersion] Concluído para corte {corte_id}")

