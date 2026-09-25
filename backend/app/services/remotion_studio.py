"""Abrir um corte no Remotion Studio (D-705).

O operador pede a URL do Studio; o caso de uso monta as props do corte — o
vídeo exportado, as cenas, o layout do YouTube com o fallback do projeto — e as
guarda. O Studio, aberto no navegador, busca essas props numa rota própria
(`video-renderer/src/Root.tsx`). O estado é do processo e tem um dono só: fica
aqui, com o caso de uso (ADR-0015 §3), e não no router, onde morava.
"""

from __future__ import annotations

import json

from app.config import settings
from app.core.channel_paths import projetos_dir
from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte.youtube_layout import (
    aplicar_layout_card_por_contexto,
    normalizar_layout_youtube,
)
from app.models import Corte, Projeto

# V1 desativada — todos os projetos usam V2 (nova identidade editorial).
_COMPOSICAO = "CenaYouTubeV2"
# O .mkv, quando existe, é o exportado mais recente.
_CLIPS_EXPORTADOS = ("clip_raw.mkv", "clip_raw.mp4")

_props_ativas: dict = {}


def props_ativas() -> dict:
    """As props do último corte aberto no Studio — vazio antes do primeiro."""
    return _props_ativas


async def abrir_no_studio(corte_id: str) -> dict:
    """Monta e guarda as props do corte; devolve a URL do Studio, a do vídeo e as props."""
    global _props_ativas
    async with AsyncSessionLocal() as db, db.begin():
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise NaoEncontrado("Corte não encontrado")
        projeto = await db.get(Projeto, corte.projeto_id)

    corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
    clip = next((corte_dir / n for n in _CLIPS_EXPORTADOS if (corte_dir / n).exists()), None)
    if clip is None:
        raise NaoEncontrado("Vídeo exportado não encontrado. Execute 'Exportar NLE' primeiro.")

    video_url = (
        f"{settings.backend_public_url}/videos/{corte.projeto_id}/cortes/{corte_id}/{clip.name}"
    )
    cenas_salvas = json.loads(corte.cenas_remotion or "[]")
    cenas = cenas_salvas.get("cenas", []) if isinstance(cenas_salvas, dict) else cenas_salvas
    layout_youtube = normalizar_layout_youtube(
        json.loads(getattr(corte, "layout_youtube", "") or "{}"),
        fallback_layout=getattr(projeto, "layout_youtube_padrao", None),
    )
    props = {
        "videoUrl": video_url,
        "letterbox": False,
        "filtroCss": "none",
        "cenas": aplicar_layout_card_por_contexto(cenas, layout_youtube),
        "layoutYoutube": layout_youtube,
        "sombraNivelPadrao": getattr(projeto, "sombra_nivel_padrao", "nenhuma") or "nenhuma",
        "layoutCardPadrao": getattr(projeto, "layout_card_padrao", "vertical") or "vertical",
    }
    _props_ativas = props

    # Porta vem da config: o Studio precisa ficar fora da faixa 3000-3100 que o
    # renderer usa para servir o bundle. Ver `remotion_studio_port`.
    return {
        "studio_url": f"http://localhost:{settings.remotion_studio_port}/{_COMPOSICAO}",
        "video_url": video_url,
        "props": props,
    }
