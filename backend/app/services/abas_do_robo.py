"""As abas que o robô deixa no Chrome dele, e quando elas saem (D-1003).

## A aba que sobrava

O Chrome do robô nasce com uma URL — a conferência da conta do TikTok, o
Studio do YouTube —, e essa é a aba de LANÇAMENTO. O roteiro não trabalha nela:
abre outra, e é a outra que fecha quando publica. A de lançamento ficava, lote
após lote: o "sempre sobra uma aba" do operador.

## Por que no fim do LOTE, e não a cada vídeo

Num lote do TikTok a raia sobe o próximo vídeo enquanto o operador revisa os
anteriores (D-799). Fechar uma aba que espera o Publicar jogaria fora um upload
pronto; e fechar a última aba fecha o Chrome, que o item seguinte teria de
abrir de novo. Então a faxina espera o lote inteiro: a raia e cada vigília.
"""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Awaitable, Callable, Coroutine
from pathlib import Path
from typing import Any

from app.domain.publicacao.tiktok_studio import mesma_pasta, portas_do_perfil
from app.services import janela_do_robo, navegador_assistido

logger = logging.getLogger(__name__)

# Quem ainda trabalha com o Chrome de cada robô: a raia e as vigílias do lote.
_EM_CURSO: Counter[Callable[[], Awaitable[int]]] = Counter()


def no_lote(
    fechar: Callable[[], Awaitable[int]] | None, trabalho: Coroutine[Any, Any, Any]
) -> Coroutine[Any, Any, Any]:
    """Conta `trabalho` como parte do lote; quando o último termina, `fechar` roda.

    Conta JÁ, e não quando o trabalho começa: a vigília nasce dentro da raia, e
    contá-la só ao começar deixaria a raia terminar antes e fechar a aba dela.
    `fechar` é a faxina do robô (`DestinoAssistido.fechar_abas`); `None`, nada a fazer.
    """
    if fechar is None:
        return trabalho
    _EM_CURSO[fechar] += 1
    return _e_no_fim_fechar(fechar, trabalho)


async def _e_no_fim_fechar(
    fechar: Callable[[], Awaitable[int]], trabalho: Coroutine[Any, Any, Any]
) -> Any:
    try:
        return await trabalho
    finally:
        _EM_CURSO[fechar] -= 1
        if _EM_CURSO[fechar] <= 0:
            del _EM_CURSO[fechar]
            try:
                fechadas = await fechar()
            except Exception as exc:  # noqa: BLE001 — faxina nunca derruba o lote
                logger.info("[Abas] nao consegui fechar as abas do robo: %s", exc)
            else:
                if fechadas:
                    logger.info("[Abas] fim do lote: %s aba(s) do robo fechada(s)", fechadas)


def fechar_abas_que_sobraram(
    perfil: Path, fica: Callable[[Any], bool] = lambda _pagina: False
) -> int:
    """Fecha as abas do Chrome DESTE perfil que não ficam, e diz quantas fechou.

    Nunca abre um Chrome para isso, nunca toca no de outro perfil (o de PROD,
    D-564) nem num com que o robô não falou, e não mexe enquanto um roteiro ou
    uma vigília usa este. `fica` diz qual aba ainda serve a alguém; na dúvida —
    ela não responde —, fica.
    """
    if not janela_do_robo.livre_depois_de_usado(perfil) or not _chrome_no_ar(perfil):
        return 0
    fechadas = 0
    try:
        with navegador_assistido.sessao_no_chrome(perfil) as (navegador, _):
            for contexto in navegador.contexts:
                for pagina in list(contexto.pages):
                    if not _fica(fica, pagina):
                        janela_do_robo.fechar_aba(pagina)
                        fechadas += 1
    except Exception as exc:  # noqa: BLE001 — faxina nunca derruba o lote
        logger.info("[Abas] nao consegui fechar as abas do robo: %s", exc)
    return fechadas


def _fica(fica: Callable[[Any], bool], pagina) -> bool:
    try:
        return fica(pagina)
    except Exception:  # noqa: BLE001 — aba que não responde não é fechada no escuro
        return True


def _chrome_no_ar(perfil: Path) -> bool:
    """O Chrome deste perfil está no ar? Pelo dono da porta, antes de bater nela."""
    return any(
        mesma_pasta(navegador_assistido.perfil_na_porta(porta), str(perfil))
        and navegador_assistido._porta_responde(porta)
        for porta in portas_do_perfil(str(perfil), navegador_assistido.PORTAS_A_TENTAR)
    )
