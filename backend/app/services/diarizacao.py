"""Serviço de Diarização — orquestra pyannote + alinhamento + persistência (D-286).

Fluxo (disparado sob demanda na tela de análise):
  1. Resolve o vídeo do projeto e roda a diarização (pyannote via infra).
  2. Alinha os turnos de falante aos segmentos da transcrição já existente.
  3. Deriva o mapa de falantes (heurística de tempo de fala → "canal").
  4. Persiste `speaker` por segmento em `transcricao_raw` e o mapa em
     `Projeto.falantes_map` (nomes editáveis depois pelo operador).

Tolerante a falha: se a diarização não roda (sem token, sem lib, erro), a
transcrição fica inalterada e o projeto segue sem rótulo — sem exceção.
"""

import json
import logging

from app.channel_paths import resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.diarizacao_align import alinhar_falantes, montar_mapa_falantes
from app.infrastructure import diarizacao_client
from app.models import Projeto

logger = logging.getLogger(__name__)


class DiarizacaoService:
    @staticmethod
    async def diarizar_projeto(projeto_id: str) -> dict:
        """Diariza o projeto e anota os falantes na transcrição.

        Retorna um resumo `{ok, falantes, canal, motivo}`. `ok=False` cobre os
        casos de degradação graciosa (o caller mostra o motivo, sem tratar erro).
        """
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto:
                raise ValueError("Projeto não encontrado")
            if not projeto.transcricao_raw:
                raise ValueError("Projeto ainda sem transcrição")
            video_rel = projeto.arquivo_video_path
            transcricao_raw = projeto.transcricao_raw

        if not video_rel:
            return {"ok": False, "motivo": "Projeto sem vídeo baixado para diarizar."}

        video_path = resolver_do_projeto(video_rel, projeto_id)
        turns = await diarizacao_client.diarizar(video_path)
        if not turns:
            return {
                "ok": False,
                "motivo": (
                    "Diarização indisponível (verifique HUGGINGFACE_TOKEN e a "
                    "instalação do pyannote.audio). Transcrição mantida sem rótulo."
                ),
            }

        try:
            segmentos = json.loads(transcricao_raw)
        except json.JSONDecodeError:
            return {"ok": False, "motivo": "Transcrição do projeto está corrompida."}

        segmentos_rotulados = alinhar_falantes(segmentos, turns)
        mapa = montar_mapa_falantes(turns)

        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if projeto:
                projeto.transcricao_raw = json.dumps(segmentos_rotulados, ensure_ascii=False)
                projeto.falantes_map = json.dumps(mapa, ensure_ascii=False)
                await db.commit()

        canal = next((sid for sid, info in mapa.items() if info.get("is_canal")), None)
        logger.info(
            "[Diarizacao] Projeto %s: %d falantes, canal=%s",
            projeto_id[:8],
            len(mapa),
            canal,
        )
        return {"ok": True, "falantes": mapa, "canal": canal}

    @staticmethod
    async def obter_falantes(projeto_id: str) -> dict:
        """Devolve o mapa de falantes persistido (vazio se ainda não diarizado)."""
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto:
                raise ValueError("Projeto não encontrado")
            return _carregar_mapa(projeto.falantes_map)

    @staticmethod
    async def atualizar_falantes(projeto_id: str, mapa: dict) -> dict:
        """Sobrescreve o mapa de falantes com os nomes/rótulos editados pelo operador.

        Não reprocessa a transcrição: o rótulo textual é resolvido a partir do
        mapa no momento da análise, então basta persistir os novos nomes/is_canal.
        """
        normalizado = _normalizar_mapa(mapa)
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto:
                raise ValueError("Projeto não encontrado")
            projeto.falantes_map = json.dumps(normalizado, ensure_ascii=False)
            await db.commit()
        return normalizado


def _carregar_mapa(raw: str) -> dict:
    """Parse tolerante do `falantes_map` (JSON no banco)."""
    if not raw:
        return {}
    try:
        dados = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return dados if isinstance(dados, dict) else {}


def _normalizar_mapa(mapa: dict) -> dict:
    """Higieniza o mapa recebido do front: só `nome` (str) e `is_canal` (bool)."""
    normalizado: dict[str, dict] = {}
    for speaker, info in (mapa or {}).items():
        info = info or {}
        normalizado[str(speaker)] = {
            "nome": str(info.get("nome") or "").strip(),
            "is_canal": bool(info.get("is_canal")),
        }
    return normalizado
