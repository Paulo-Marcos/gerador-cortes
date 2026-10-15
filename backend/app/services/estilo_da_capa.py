"""Como a capa do TikTok se desenha: onde fica cada componente e em que estilo.

Separado da montagem (`capa_tiktok.py`), que cuida do texto, da arte e do
gerador: aqui só se decide o desenho (D-532, D-932).
"""

from __future__ import annotations

import json
import logging

from app.services import palco_por_escopo
from app.services.app_settings import AppSettingsService

logger = logging.getLogger(__name__)


def ajuste_do_layout() -> dict:
    """Onde o operador pôs cada componente, das configurações globais (D-532).

    JSON inválido vira `{}` — a capa sai no padrão em vez de não sair. Config de
    posição não é motivo para uma capa falhar.
    """
    try:
        return json.loads(AppSettingsService.get().capa_tiktok_layout or "{}")
    except (ValueError, TypeError):
        logger.warning("[CapaTikTok] layout salvo nao e um JSON valido; usando o padrao")
        return {}


def estilo_do_palco(projeto_id: str, corte_id: str) -> dict[str, str]:
    """O estilo da capa é o do palco horizontal deste corte (D-932).

    A capa é a vitrine do perfil: num canal que trocou para o palco limpo, a
    capa no chrome antigo fazia a grade parecer de outro canal. Segue o palco
    EFETIVO do corte — canal, com a escolha do projeto e do corte por cima
    (D-923) —, o mesmo que o vídeo usa no render.
    """
    palco = palco_por_escopo.resolver(projeto_id, corte_id, "horizontal")["efetivo"]
    return {"estilo": palco.estilo, "fundoLimpo": palco.fundo}
