"""Os picos de áudio do BRUTO, para a régua da curadoria de shorts (D-541).

## Por que não dá para reusar os picos do editor

O editor já tem waveform, e a tentação é apontar a régua dos shorts para o mesmo
endpoint. Os dois eixos de tempo não são o mesmo.

Os picos do editor vêm do PROXY do corte — uma janela da live, com respiro antes
e depois (`contexto_seg`), e por isso carregam um `offset_sec`. O bruto é outro
arquivo: é o corte já montado, com os trechos removidos tirados fora. Ele começa
no zero e é MAIS CURTO que a janela do proxy, e nem os instantes internos batem —
tudo o que foi cortado desloca o que vem depois.

Servir a onda errada seria pior que não servir nenhuma: ela desenha um envelope
plausível, e o operador cortaria no silêncio que na verdade está noutro lugar.

## O que se reaproveita

A conta. `_decode_proxy_to_f32` e `_calcular_picos` funcionam sobre qualquer
arquivo que o ffmpeg leia, e é a mesma normalização por percentil que dá ao
editor a onda que o operador já sabe ler. Duas normalizações diferentes fariam a
mesma voz parecer mais alta numa tela que na outra.

## Por que o cache olha para o mtime

O bruto é regerado (D-528: apagar e re-extrair da live). Um cache indexado só
pelo id do corte devolveria a onda do arquivo antigo para o arquivo novo — e o
sintoma seria a régua "quase certa", que é o pior tipo de errado numa ferramenta
de precisão.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from pathlib import Path

from app.database import AsyncSessionLocal
from app.models import Corte
from app.services.media_proxy import MediaProxyService, _KeyedLocks
from app.services.shorts import _bruto_em_disco

logger = logging.getLogger(__name__)

# Doze pontos por segundo é o que o editor usa, e a régua dos shorts é lida do
# mesmo jeito. Os limites existem porque um bruto de 40 minutos pediria 29 mil
# pontos — mais do que a tela desenha — e um de 8 segundos pediria 96, que vira
# um serrote sem informação.
PONTOS_POR_SEGUNDO = 12
PONTOS_MINIMO = 1200
PONTOS_MAXIMO = 60000

_locks = _KeyedLocks()


class OndaIlegivel(RuntimeError):
    """O bruto existe, mas o ffmpeg não conseguiu tirar áudio dele.

    É condição do ARQUIVO, e não defeito nosso: container truncado, bruto ainda
    sendo escrito, mídia sem faixa de áudio. Separá-la de `ValueError` é o que
    permite a tela dizer "o bruto está quebrado" em vez de "não existe" — dois
    problemas com soluções diferentes.
    """


def quantidade_de_pontos(duracao_seg: float, pedido: int | None = None) -> int:
    """Quantos pontos a onda leva, entre o piso e o teto.

    >>> quantidade_de_pontos(600)
    7200
    >>> quantidade_de_pontos(8)
    1200
    >>> quantidade_de_pontos(1_000_000)
    60000
    >>> quantidade_de_pontos(600, pedido=3000)
    3000
    """
    alvo = pedido or int(max(0.0, duracao_seg) * PONTOS_POR_SEGUNDO)
    return max(PONTOS_MINIMO, min(PONTOS_MAXIMO, alvo))


def caminho_do_cache(bruto: Path, pontos: int) -> Path:
    """Onde o JSON dos picos mora — ao lado do bruto, e casado com ELE.

    O hash inclui tamanho e mtime justamente para que um bruto regerado não
    herde a onda do anterior.
    """
    st = bruto.stat()
    assinatura = f"{st.st_size}_{int(st.st_mtime)}_{pontos}_v1"
    curto = hashlib.md5(assinatura.encode()).hexdigest()[:10]
    return bruto.parent / f"waveform_bruto_{curto}.json"


def _ler_cache(caminho: Path) -> dict | None:
    if not caminho.is_file():
        return None
    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        # Cache corrompido é motivo para regerar, não para derrubar a tela.
        logger.warning("[WaveformBruto] cache ilegível em %s; regerando", caminho.name)
        return None
    dados["cached"] = True
    return dados


async def picos_do_bruto(corte_id: str, *, force: bool = False, pontos: int | None = None) -> dict:
    """Os picos do bruto deste corte, do cache ou recém-calculados.

    Levanta `ValueError` quando não há corte ou não há bruto em disco — as duas
    são condições que a tela resolve (gerar o bruto), e não erros nossos.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError("Corte nao encontrado")
        bruto = _bruto_em_disco(corte)

    if bruto is None:
        raise ValueError("O bruto deste corte nao esta em disco")

    duracao = float(corte.duracao_clip_seg or 0.0)
    alvo = quantidade_de_pontos(duracao, pontos)
    cache = caminho_do_cache(bruto, alvo)

    if not force:
        pronto = _ler_cache(cache)
        if pronto is not None:
            return pronto

    # Single-flight: o StrictMode do dev dispara dois fetches, e dois ffmpeg
    # sobre o mesmo arquivo era a origem do 500 intermitente no editor.
    async with _locks.get(corte_id):
        if not force:
            pronto = _ler_cache(cache)
            if pronto is not None:
                return pronto

        # Em thread: `_decode_proxy_to_f32` roda `subprocess.run`, que bloqueia
        # o event loop — e no Windows sob uvicorn o caminho async falha (D-369).
        try:
            amostras = await asyncio.to_thread(MediaProxyService._decode_proxy_to_f32, str(bruto))
        except RuntimeError as exc:
            # Arquivo truncado, container quebrado, bruto ainda sendo escrito.
            # Sem isto o operador leva um 500 e a tela diz "erro interno" — o que
            # aponta para nós quando o problema é o arquivo, e some com a única
            # informação útil, que é QUAL arquivo.
            raise OndaIlegivel(f"Nao consegui ler o audio de {bruto.name}: {exc}") from exc
        duracao_real = max(1.0, len(amostras) / MediaProxyService.WAVEFORM_SAMPLE_RATE)
        picos = await asyncio.to_thread(MediaProxyService._calcular_picos, amostras, alvo)

        payload = {
            "corte_id": corte_id,
            # O bruto começa no zero: não há `offset_sec` como no proxy. Dizer
            # isso explicitamente evita que o consumidor invente um.
            "offset_sec": 0.0,
            "duration_sec": round(duracao_real, 3),
            "sample_rate": MediaProxyService.WAVEFORM_SAMPLE_RATE,
            "points": len(picos),
            "peaks": picos,
            "cached": False,
        }

        temporario = cache.with_suffix(f".{time.time_ns()}.tmp")
        try:
            temporario.write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            temporario.replace(cache)
        except OSError as exc:
            # Sem cache o próximo pedido recalcula; sem onda o operador corta no
            # escuro. Falhar aqui trocaria o custo pelo prejuízo.
            logger.warning("[WaveformBruto] nao consegui gravar o cache: %s", exc)
            temporario.unlink(missing_ok=True)

        logger.info("[WaveformBruto] %s pontos para o corte %s", len(picos), corte_id[:8])
        return payload
