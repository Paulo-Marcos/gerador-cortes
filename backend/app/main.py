import asyncio
import os
import re
import sys

# ProactorEventLoop is required on Windows for asyncio.create_subprocess_exec
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
from contextlib import asynccontextmanager

from app.channel_layout_migration import garantir_layout_de_canais
from app.channel_paths import projetos_dir
from app.config import settings
from app.database import init_db
from app.routers import (
    avaliacoes_thumbnail,
    channels,
    claude_ia,
    cortes,
    export,
    mascot,
    metadados,
    presets,
    projetos,
    ranking_lives,
    retratos,
    shorts,
    youtube_browser,
)
from app.routers import (
    settings as app_settings,
)
from app.services.app_logging import install_log_controls
from app.services.remotion_render import RemotionRenderService
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    install_log_controls()

    # Multi-canal (Opção X): antes de abrir o banco/gerar, garante que o
    # `instance/` esteja no layout `channels/<ativo>/`. Migra o layout plano
    # legado (lossless) e materializa o canal default numa instalação nova.
    garantir_layout_de_canais()

    for dir_path in [str(projetos_dir()), settings.assets_dir]:
        os.makedirs(dir_path, exist_ok=True)

    await init_db()

    try:
        await RemotionRenderService.sincronizar_tarefas_concluidas()
    except Exception as e:
        print(f"[Main] Erro na sincronização inicial: {e}")

    yield


app = FastAPI(
    title="CortadorLive API",
    description="Pipeline de transformação de Lives em cortes analíticos para YouTube",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*"
    ],  # Simplifica para aceitar de qualquer porta (Remotion muda entre 3000-3010)
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*", "Range"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

app.include_router(projetos.router, prefix="/api/projetos", tags=["Projetos"])
app.include_router(cortes.router, prefix="/api/cortes", tags=["Cortes"])
app.include_router(metadados.router, prefix="/api/metadados", tags=["Metadados"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])
app.include_router(youtube_browser.router, prefix="/api/youtube", tags=["YouTube Browser"])
app.include_router(shorts.router, prefix="/api/shorts", tags=["Shorts"])
app.include_router(app_settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(mascot.router, prefix="/api/mascot", tags=["Mascote"])
app.include_router(retratos.router, prefix="/api/retratos", tags=["Retratos"])
app.include_router(claude_ia.router, prefix="/api/claude", tags=["Claude IA"])
app.include_router(presets.router, prefix="/api/presets", tags=["Presets"])
app.include_router(ranking_lives.router, prefix="/api/ranking-lives", tags=["Ranking Lives"])
app.include_router(
    avaliacoes_thumbnail.router, prefix="/api/avaliacoes-thumbnail", tags=["Avaliações Thumbnail"]
)
app.include_router(channels.router, prefix="/api/channels", tags=["Canais"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "CortadorLive Backend"}


# StaticFiles does not support Range — this endpoint handles byte-range streaming for video seeking
CHUNK_SIZE = 1024 * 512  # 512 KB por chunk


@app.head("/videos/{projeto_id}/{filename:path}")
@app.get("/videos/{projeto_id}/{filename:path}")
async def servir_video(projeto_id: str, filename: str, request: Request):
    """
    Serve arquivos de vídeo com suporte completo a HTTP Range Requests.
    Necessário para que o <video> do browser consiga fazer seeking.
    """
    # Guarda contra path traversal: o backend sobe em --host 0.0.0.0, então
    # `filename` ({filename:path}) e `projeto_id` são entrada não confiável.
    # Resolvemos o caminho e exigimos que ele fique dentro de projetos/<id>.
    projetos_root = projetos_dir().resolve()
    base_dir = (projetos_root / projeto_id).resolve()
    candidato = (base_dir / filename).resolve()
    if not (base_dir.is_relative_to(projetos_root) and candidato.is_relative_to(base_dir)):
        raise HTTPException(status_code=403, detail="Acesso negado")
    video_path = str(candidato)

    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail=f"Arquivo não encontrado: {filename}")

    file_size = os.path.getsize(video_path)
    range_header = request.headers.get("Range", None)
    ext = filename.lower()
    if ext.endswith(".mp4"):
        content_type = "video/mp4"
    elif ext.endswith(".webm"):
        content_type = "video/webm"
    elif ext.endswith(".mkv"):
        content_type = "video/x-matroska"
    elif ext.endswith(".jpg") or ext.endswith(".jpeg"):
        content_type = "image/jpeg"
    elif ext.endswith(".png"):
        content_type = "image/png"
    elif ext.endswith(".webp"):
        content_type = "image/webp"
    else:
        content_type = "application/octet-stream"

    if range_header:
        match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not match:
            raise HTTPException(status_code=416, detail="Range inválido")

        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else file_size - 1
        end = min(end, file_size - 1)

        if start > end or start >= file_size:
            raise HTTPException(
                status_code=416,
                detail="Range fora dos limites",
                headers={"Content-Range": f"bytes */{file_size}"},
            )

        content_length = end - start + 1

        def iterfile():
            with open(video_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk = f.read(min(CHUNK_SIZE, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iterfile(),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Cache-Control": "no-cache",
            },
        )
    else:

        def iterfile_full():
            with open(video_path, "rb") as f:
                while chunk := f.read(CHUNK_SIZE):
                    yield chunk

        return StreamingResponse(
            iterfile_full(),
            status_code=200,
            media_type=content_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Cache-Control": "no-cache",
            },
        )
