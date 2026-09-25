"""Serviço de transcrição fiel — escolhe a fonte das palavras do short (D-461).

Duas fontes, uma preferência clara:

  1. **ASR local** sobre o áudio do bruto — grafia correta, timing por palavra.
  2. **Auto-legenda do YouTube** (`transcricao_final`, que já traz `palavras`
     com `inicio_seg` desde a D-337) — retaguarda quando o ASR não está
     instalado ou falhou.

Quem consome recebe `Palavra` nos dois casos e não sabe de onde veio. A fonte
usada volta no resultado só para o operador entender a qualidade que está vendo.

O áudio analisado é o do BRUTO, então os tempos já nascem na timeline certa —
mesma invariante que sustenta a sugestão de shorts (D-454).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from app.core.channel_paths import resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.short.transcricao_fiel import Palavra, normalizar_palavras, palavras_de_segmentos
from app.infrastructure import asr_local
from app.models import Corte

logger = logging.getLogger(__name__)

FONTE_ASR = "asr_local"
FONTE_AUTO_LEGENDA = "auto_legenda"


@dataclass(frozen=True)
class TranscricaoFiel:
    """As palavras do bruto e de onde elas vieram."""

    palavras: list[Palavra]
    fonte: str

    @property
    def total(self) -> int:
        return len(self.palavras)


async def obter_do_corte(corte_id: str, *, permitir_asr: bool = True) -> TranscricaoFiel:
    """Palavras com tempo do bruto do corte, pela melhor fonte disponível.

    Levanta `LookupError` quando o corte não existe. NUNCA levanta por causa do
    ASR: sem ele, a auto-legenda assume.

    `permitir_asr=False` corta a fonte 1 e vai direto à auto-legenda. Existe
    para quem precisa de resposta AGORA: o ASR roda o modelo inteiro sobre o
    áudio do bruto e leva minutos, o que serve a um render mas congelaria uma
    tela que só quer mostrar a prévia (D-479). A `fonte` no resultado diz ao
    operador qual qualidade ele está vendo.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")
        clip_path = corte.arquivo_clip_path
        projeto_id = corte.projeto_id
        transcricao_final = corte.transcricao_final

    bruto = _bruto_em_disco(clip_path, projeto_id) if permitir_asr else None
    if bruto is not None:
        palavras_asr = await asr_local.transcrever_palavras(bruto)
        if palavras_asr:
            return TranscricaoFiel(normalizar_palavras(palavras_asr), FONTE_ASR)

    palavras = palavras_de_segmentos(_json_lista(transcricao_final))
    logger.info(
        "[TranscricaoFiel] corte=%s fonte=%s palavras=%d",
        corte_id[:8],
        FONTE_AUTO_LEGENDA,
        len(palavras),
    )
    return TranscricaoFiel(palavras, FONTE_AUTO_LEGENDA)


def _bruto_em_disco(clip_path: str | None, projeto_id: str) -> Path | None:
    if not clip_path:
        return None
    caminho = resolver_do_projeto(clip_path, projeto_id)
    return caminho if caminho.is_file() else None


def _json_lista(bruto: str | None) -> list[dict]:
    try:
        dados = json.loads(bruto or "[]")
    except json.JSONDecodeError:
        return []
    return dados if isinstance(dados, list) else []
