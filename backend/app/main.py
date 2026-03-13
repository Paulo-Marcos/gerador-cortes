"""
CortadorLive Backend — FastAPI Application
Pipeline de cortes de Lives do YouTube
"""

import os
import re
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager

from app.database import init_db
from app.routers import projetos, cortes, metadados, export


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicializa o banco de dados ao subir a aplicação."""
    await init_db()
    yield


app = FastAPI(
    title="CortadorLive API",
    description="Pipeline de transformação de Lives em cortes analíticos para YouTube",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — permite requisições do frontend Angular (localhost:4200)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Range"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

# Routers
app.include_router(projetos.router, prefix="/api/projetos", tags=["Projetos"])
app.include_router(cortes.router, prefix="/api/cortes", tags=["Cortes"])
app.include_router(metadados.router, prefix="/api/metadados", tags=["Metadados"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "CortadorLive Backend"}


# ─── Endpoint de vídeo com suporte a Range Requests (necessário para seeking) ──
# O StaticFiles do FastAPI não suporta Range — este endpoint resolve isso.

PROJETOS_DIR = os.getenv("PROJETOS_DIR", "./projetos")
CHUNK_SIZE = 1024 * 512  # 512 KB por chunk


@app.get("/videos/{projeto_id}/{filename:path}")
async def servir_video(projeto_id: str, filename: str, request: Request):
    """
    Serve arquivos de vídeo com suporte completo a HTTP Range Requests.
    Necessário para que o <video> do browser consiga fazer seeking.
    """
    video_path = os.path.join(PROJETOS_DIR, projeto_id, filename)

    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail=f"Arquivo não encontrado: {filename}")

    file_size = os.path.getsize(video_path)
    range_header = request.headers.get("Range", None)

    # Detecta content-type pelo nome do arquivo
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
        # Parse do Range: bytes=start-end
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
        # Sem Range — retorna o arquivo completo
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
