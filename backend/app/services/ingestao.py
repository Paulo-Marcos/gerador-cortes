"""
Serviço de Ingestão — download yt-dlp + extração de legendas
"""

import asyncio
import json
import os
import re
import traceback
import uuid
from pathlib import Path
from typing import AsyncGenerator

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Projeto, StatusProjeto

# Registro de filas de progresso por projeto
_progress_queues: dict[str, asyncio.Queue] = {}


class IngestaoService:

    @staticmethod
    async def processar_projeto(projeto_id: str, youtube_url: str):
        """Pipeline completo: download + transcrição."""
        print(f"[INGESTAO] >>> INICIANDO processar_projeto para {projeto_id}", flush=True)
        queue = asyncio.Queue()
        _progress_queues[projeto_id] = queue

        try:
            print(f"[INGESTAO] Atualizando status para BAIXANDO...", flush=True)
            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.BAIXANDO)
            print(f"[INGESTAO] Status BAIXANDO salvo. Iniciando download de: {youtube_url}", flush=True)
            video_path = await IngestaoService._baixar_video(projeto_id, youtube_url, queue)

            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.TRANSCREVENDO)
            transcricao = await IngestaoService._extrair_legenda(projeto_id, youtube_url, video_path)

            await IngestaoService._salvar_transcricao(projeto_id, transcricao, video_path)
            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.PRONTO)
            await queue.put({"status": "pronto", "progresso": 100})

        except Exception as e:
            print(f"\n{'='*60}")
            print(f"ERRO NA INGESTAO DO PROJETO {projeto_id}")
            print(f"Tipo: {type(e).__name__}")
            print(f"Mensagem: {e}")
            print("Stack trace completo:")
            traceback.print_exc()
            print(f"{'='*60}\n")
            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.ERRO, str(e))
            await queue.put({"status": "erro", "mensagem": str(e)})
        finally:
            _progress_queues.pop(projeto_id, None)

    @staticmethod
    async def _baixar_video(projeto_id: str, url: str, queue: asyncio.Queue) -> str:
        """Executa yt-dlp para baixar o vídeo."""
        projeto_dir = Path(settings.projetos_dir) / projeto_id
        projeto_dir.mkdir(parents=True, exist_ok=True)

        output_template = str(projeto_dir / "video.%(ext)s")

        cmd = [
            "yt-dlp",
            "-f", settings.ytdlp_format,
            "--output", output_template,
            "--write-info-json",   # salva metadados JSON
            "--newline",           # progresso linha a linha
            "--merge-output-format", "mp4",
            url,
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        # Lê progresso linha a linha E guarda todas as linhas para debug
        output_lines = []
        async for line in process.stdout:
            text = line.decode("utf-8", errors="ignore").strip()
            output_lines.append(text)
            print(f"[yt-dlp] {text}", flush=True)  # mostra tudo nos logs
            match = re.search(r"\[download\]\s+([\d.]+)%", text)
            if match:
                progress = float(match.group(1))
                await queue.put({"status": "baixando", "progresso": progress})
                await IngestaoService._salvar_progresso(projeto_id, progress)

        await process.wait()
        if process.returncode != 0:
            raise RuntimeError(f"yt-dlp falhou com código {process.returncode}")

        # Encontra o arquivo de vídeo gerado
        video_files = list(projeto_dir.glob("video.mp4"))
        if not video_files:
            video_files = list(projeto_dir.glob("video.*"))
        if not video_files:
            raise RuntimeError("Arquivo de vídeo não encontrado após download")

        return str(video_files[0])

    @staticmethod
    async def _extrair_legenda(projeto_id: str, url: str, video_path: str) -> list[dict]:
        """
        Tenta extrair a legenda automática do YouTube via yt-dlp.
        Retorna lista de segmentos com { inicio, fim, texto }.
        """
        projeto_dir = Path(video_path).parent
        subs_path = projeto_dir / "subtitles"
        subs_path.mkdir(exist_ok=True)

        cmd = [
            "yt-dlp",
            "--write-auto-sub",
            "--write-sub",
            "--sub-lang", "pt,pt-BR,pt-PT,en",
            "--sub-format", "vtt",
            "--skip-download",
            "--output", str(subs_path / "sub"),
            url,
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        await process.wait()

        # Procura arquivo VTT gerado
        vtt_files = list(subs_path.glob("*.vtt"))
        if not vtt_files:
            # Sem legenda disponível — retorna placeholder
            return [{"inicio": "00:00:00.000", "fim": "00:00:01.000",
                     "texto": "[Legenda automática não disponível para este vídeo]"}]

        # Parseia VTT para lista de segmentos
        return IngestaoService._parse_vtt(vtt_files[0].read_text(encoding="utf-8"))

    @staticmethod
    def _parse_vtt(vtt_content: str) -> list[dict]:
        """Converte conteúdo VTT em lista de segmentos com timestamps."""
        segmentos = []
        blocks = vtt_content.strip().split("\n\n")

        for block in blocks:
            lines = block.strip().split("\n")
            time_line = next((l for l in lines if "-->" in l), None)
            if not time_line:
                continue

            partes = time_line.split("-->")
            if len(partes) != 2:
                continue

            inicio = partes[0].strip().split(" ")[0]
            fim = partes[1].strip().split(" ")[0]
            texto = " ".join(l for l in lines if "-->" not in l and not l.isdigit()).strip()
            # Remove tags HTML do VTT (<c>, <b>, etc.)
            texto = re.sub(r"<[^>]+>", "", texto).strip()

            if texto:
                segmentos.append({"inicio": inicio, "fim": fim, "texto": texto})

        return segmentos

    @staticmethod
    async def _salvar_transcricao(projeto_id: str, transcricao: list[dict], video_path: str):
        """Salva transcrição e metadados do vídeo no banco."""
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if projeto:
                projeto.transcricao_raw = json.dumps(transcricao, ensure_ascii=False)
                projeto.arquivo_video_path = video_path

                # Tenta carregar metadados do info.json do yt-dlp
                info_files = list(Path(video_path).parent.glob("*.info.json"))
                if info_files:
                    info = json.loads(info_files[0].read_text(encoding="utf-8"))
                    projeto.titulo_live = info.get("title", "")
                    projeto.duracao_segundos = info.get("duration", 0)
                    projeto.data_live = info.get("upload_date", "")

                await db.commit()

    @staticmethod
    async def _atualizar_status(projeto_id: str, status: str, erro: str = ""):
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if projeto:
                projeto.status = status
                projeto.erro_msg = erro
                await db.commit()

    @staticmethod
    async def _salvar_progresso(projeto_id: str, progresso: float):
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if projeto:
                projeto.progresso_download = progresso
                await db.commit()

    @staticmethod
    async def stream_progresso(projeto_id: str) -> AsyncGenerator[dict, None]:
        """Gerador assíncrono de updates de progresso via WebSocket."""
        queue = _progress_queues.get(projeto_id)
        if not queue:
            yield {"status": "sem_progresso", "mensagem": "Nenhum download em andamento"}
            return

        while True:
            update = await queue.get()
            yield update
            if update.get("status") in ("pronto", "erro"):
                break
