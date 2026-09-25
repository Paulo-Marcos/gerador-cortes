import asyncio
import logging
import os
import re
import sys

# ProactorEventLoop is required on Windows for asyncio.create_subprocess_exec
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
from contextlib import asynccontextmanager

from app import channel_paths, editorial_scaffolds
from app import editorial_skills as editorial_skills_service
from app.channel_layout_migration import garantir_layout_de_canais
from app.channel_paths import projetos_dir
from app.config import VERSAO_DO_APP, settings
from app.database import init_db
from app.routers import (
    avaliacao_bruto,
    avaliacao_cortes,
    avaliacoes_thumbnail,
    channels,
    claude_ia,
    cortes,
    diarizacao,
    editorial_skills,
    export,
    mascot,
    metadados,
    ordem_cortes,
    presets,
    projetos,
    ranking_lives,
    retratos,
    shorts,
    sincronizacao,
    youtube_browser,
)
from app.routers import (
    settings as app_settings,
)
from app.routers.errors import registrar_tratadores
from app.routers.seguranca_local import ORIGEM_LOCAL_REGEX, GuardaDeOrigemLocal
from app.services import channels as channels_service
from app.services import encerramento, settings_store
from app.services.app_logging import install_log_controls
from app.services.app_settings import AppSettingsService
from app.services.remotion_render import RemotionRenderService
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    install_log_controls()

    # Multi-canal (Opção X): antes de abrir o banco/gerar, garante que o
    # `instance/` esteja no layout `channels/<ativo>/`. Migra o layout plano
    # legado (lossless) e materializa o canal default numa instalação nova.
    garantir_layout_de_canais()

    for dir_path in [str(projetos_dir()), settings.assets_dir]:
        os.makedirs(dir_path, exist_ok=True)

    # D-191: as configurações vivem no banco (`instance/settings.db`). Inicializa o
    # banco de settings e MIGRA (idempotente) a config já existente em arquivo —
    # identidade de todos os canais + app settings do canal ativo — para o banco,
    # sem intervenção manual. Best-effort: um erro de config não derruba o boot.
    try:
        settings_store.inicializar(channel_paths.settings_db_path())
        channels_service.migrar_identidades_para_banco()
        AppSettingsService.get()  # semeia app_settings do canal ativo a partir do arquivo
        editorial_skills_service.migrar_skills_do_canal_ativo()  # E-021: semeia as 5 skills
        # D-330: no mesmo ponto do boot, alinha o scaffold V1 ao default v2. Chamada
        # daqui, e não de dentro das skills, para as duas não se importarem (D-697).
        editorial_scaffolds.migrar_scaffolds_do_canal_ativo()
    except Exception as e:  # noqa: BLE001 — boot resiliente a I/O de config
        logger.warning("[Settings] Falha ao migrar configs para o banco: %s", e)

    await init_db()

    try:
        await RemotionRenderService.sincronizar_tarefas_concluidas()
    except Exception as e:
        logger.warning("[Main] Erro na sincronização inicial: %s", e)

    yield

    # D-653: até aqui não havia NADA depois do yield — fechar o app deixava
    # tarefas de fundo no meio do caminho, ffmpeg comendo CPU e o banco com
    # conexões abertas. A lógica vive em `services/encerramento` para este
    # arquivo (travado) mudar o mínimo.
    await encerramento.encerrar_com_calma()


app = FastAPI(
    title="CortadorLive API",
    description="Pipeline de transformação de Lives em cortes analíticos para YouTube",
    version=VERSAO_DO_APP,
    lifespan=lifespan,
)

# D-697: erro de domínio vira HTTP pelo significado, e não por decisão de cada router.
registrar_tratadores(app)

app.add_middleware(
    CORSMiddleware,
    # D-745: só origens desta máquina, em qualquer porta (o renderer sobe o seu
    # servidor numa porta sorteada entre 3000 e 3100). Antes era "*", e qualquer
    # site aberto no navegador lia a API local.
    allow_origin_regex=ORIGEM_LOCAL_REGEX,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*", "Range"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)
# Registrada depois do CORS = roda antes dele. Fecha o que o CORS não fecha:
# POST simples, WebSocket e DNS rebinding (ver app/routers/seguranca_local.py).
app.add_middleware(GuardaDeOrigemLocal)

app.include_router(projetos.router, prefix="/api/projetos", tags=["Projetos"])
app.include_router(cortes.router, prefix="/api/cortes", tags=["Cortes"])
app.include_router(metadados.router, prefix="/api/metadados", tags=["Metadados"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])
app.include_router(youtube_browser.router, prefix="/api/youtube", tags=["YouTube Browser"])
app.include_router(app_settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(mascot.router, prefix="/api/mascot", tags=["Mascote"])
app.include_router(retratos.router, prefix="/api/retratos", tags=["Retratos"])
app.include_router(claude_ia.router, prefix="/api/claude", tags=["Claude IA"])
app.include_router(diarizacao.router, prefix="/api/diarizacao", tags=["Diarização"])
app.include_router(presets.router, prefix="/api/presets", tags=["Presets"])
app.include_router(ranking_lives.router, prefix="/api/ranking-lives", tags=["Ranking Lives"])
app.include_router(
    avaliacao_cortes.router, prefix="/api/avaliacao-cortes", tags=["Avaliação de Cortes"]
)
app.include_router(
    avaliacoes_thumbnail.router, prefix="/api/avaliacoes-thumbnail", tags=["Avaliações Thumbnail"]
)
# D-447: avaliação automática da estrutura do bruto (nota + apontamentos).
app.include_router(
    avaliacao_bruto.router, prefix="/api/avaliacao-bruto", tags=["Avaliação do Bruto"]
)
app.include_router(shorts.router, prefix="/api/shorts", tags=["Shorts"])
# D-491: quatro vezes numa sessao so, um bug foi cacado onde ele nao estava —
# backend velho no ar, npm install faltando, coluna que so nasce no boot. Este
# router torna visivel a diferenca entre o que roda e o que esta no disco.
app.include_router(sincronizacao.router, prefix="/api/sincronizacao", tags=["Sincronizacao"])
# D-448: pin explícito de posição — a ordem padrão (cronológica) não tem endpoint.
app.include_router(ordem_cortes.router, prefix="/api/ordem-cortes", tags=["Ordem dos Cortes"])
app.include_router(channels.router, prefix="/api/channels", tags=["Canais"])
app.include_router(
    editorial_skills.router, prefix="/api/editorial-skills", tags=["Skills editoriais"]
)


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
