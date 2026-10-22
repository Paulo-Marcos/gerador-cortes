"""Conferir a conta logada antes de cada envio, no canal ativo (RN-31, D-980).

A regra mora em `domain/publicacao/conta_do_destino.py`; aqui fica o que a
cerca: ler a conta de cada destino, a gravação por canal e o aprendizado.

Onde cada destino lê a conta (MEDIDO em 21/10/2026, no perfil de robô do DEV):

  - **YouTube:** `channels.list(mine=True)` com as credenciais do canal — o id
    `UC…` do canal dono do token.
  - **TikTok:** `/passport/web/account/info/`, pedido com os cookies da própria
    sessão do robô (`contexto.request`). Devolve o `user_id_str` e o `username`.
  - **Instagram (API):** o `quem_sou` da Graph API, que o envio já fazia.
  - **Instagram (navegador):** o cookie `ds_user_id` da sessão. A API interna do
    instagram.com respondeu HTML e, insistindo, 429; o cookie é local, sem rede,
    e é o número da conta logada.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import TypeVar

from app.core import channel_paths
from app.domain.compartilhado.erros import ErroDeDominio
from app.domain.publicacao.conta_do_destino import (
    DESTINOS,
    ROTULOS,
    Conta,
    ContaIlegivel,
    conferir,
    destino_conhecido,
)
from app.infrastructure import conta_do_destino_store, youtube_api

logger = logging.getLogger(__name__)

C = TypeVar("C")

URL_DA_CONTA_NO_TIKTOK = "https://www.tiktok.com/passport/web/account/info/"
ORIGEM_DO_INSTAGRAM = "https://www.instagram.com"
_SEGUNDOS_PARA_LER = 20


def _banco_e_canal() -> tuple[Path, str]:
    return channel_paths.settings_db_path(), channel_paths.active_channel_root().name


def conferir_conta(destino: str, logada: Conta) -> None:
    """Barra o envio se a `logada` não for a do canal; sem conta gravada, aprende-a."""
    banco, canal = _banco_e_canal()
    gravada = conta_do_destino_store.ler_todas(banco, canal).get(destino)
    esperada = Conta(id=gravada[0], nome=gravada[1]) if gravada else None
    if conferir(destino, esperada, logada):
        agora = datetime.now(UTC).isoformat(timespec="seconds")
        conta_do_destino_store.gravar(banco, canal, destino, logada.id, logada.nome, agora)
        logger.info("[Conta] %s do canal %s aprendida: %s", destino, canal, logada.legivel())


def contas_do_canal() -> list[dict]:
    """As contas gravadas do canal ativo, uma linha por destino, na ordem da tela."""
    gravadas = conta_do_destino_store.ler_todas(*_banco_e_canal())
    linhas = []
    for destino in DESTINOS:
        conta_id, nome, gravada_em = gravadas.get(destino, ("", "", ""))
        linhas.append(
            {
                "destino": destino,
                "rotulo": ROTULOS[destino],
                "conta_id": conta_id,
                "nome": nome,
                "gravada_em": gravada_em,
            }
        )
    return linhas


def esquecer_conta(destino: str) -> None:
    """Esquece a conta do destino no canal ativo; o próximo envio aprende outra."""
    conta_do_destino_store.esquecer(*_banco_e_canal(), destino_conhecido(destino))


# --------------------------------------------------------------------------
# YouTube
# --------------------------------------------------------------------------


def credenciais_conferidas(creds: C) -> tuple[C | None, str | None]:
    """As credenciais, se forem da conta do canal; senão `(None, motivo)`.

    Devolve no contrato do `_get_credentials` — `(creds, erro)` — para quem já
    o chama tratar a recusa como trata um token expirado.
    """
    try:
        canal_id, titulo = youtube_api.canal_da_conta(creds)
    except Exception as exc:  # noqa: BLE001 — sem saber a conta, o envio não sai
        logger.warning("[Conta] não li o canal do YouTube: %s", exc)
        canal_id, titulo = "", ""
    try:
        conferir_conta("youtube", Conta(id=canal_id, nome=titulo))
    except ErroDeDominio as exc:
        return None, str(exc)
    return creds, None


# --------------------------------------------------------------------------
# Robôs de navegador
# --------------------------------------------------------------------------


def conta_no_tiktok(contexto) -> Conta:
    """A conta da sessão do robô do TikTok; `Conta("")` quando não dá para ler."""
    try:
        resposta = contexto.request.get(URL_DA_CONTA_NO_TIKTOK, timeout=_SEGUNDOS_PARA_LER * 1000)
        dados = (resposta.json() or {}).get("data") or {}
    except Exception as exc:  # noqa: BLE001 — ilegível vira recusa, não erro cru
        logger.info("[Conta] não li a conta do TikTok: %s", exc)
        return Conta("")
    username = str(dados.get("username") or "")
    return Conta(id=str(dados.get("user_id_str") or ""), nome=f"@{username}" if username else "")


def conta_no_instagram_web(contexto) -> Conta:
    """A conta da sessão do robô do Instagram, pelo cookie `ds_user_id`."""
    try:
        cookies = contexto.cookies(ORIGEM_DO_INSTAGRAM)
    except Exception as exc:  # noqa: BLE001 — ilegível vira recusa, não erro cru
        logger.info("[Conta] não li a conta do Instagram: %s", exc)
        return Conta("")
    return Conta(id=next((c["value"] for c in cookies if c.get("name") == "ds_user_id"), ""))


_LEITORES = {"tiktok": conta_no_tiktok, "instagram_web": conta_no_instagram_web}


def _conferir_no_navegador(destino: str, perfil: Path, url: str) -> None:
    from app.services.navegador_assistido import (
        NavegadorIndisponivel,
        PlaywrightAusente,
        sessao_no_chrome,
    )
    from app.services.navegador_do_robo import executavel_escolhido

    sessao = sessao_no_chrome(perfil, abrir_em=url, executavel=executavel_escolhido())
    try:
        with sessao as (nav, _):
            contexto = nav.contexts[0] if nav.contexts else None
            logada = _LEITORES[destino](contexto) if contexto is not None else Conta("")
    except (PlaywrightAusente, NavegadorIndisponivel) as exc:
        # Sem navegador não há conta para conferir — nem envio: o robô pararia
        # logo em seguida. Dito aqui, com o motivo, em vez de seguir no escuro.
        raise ContaIlegivel(
            f"Não abri o navegador do robô para confirmar a conta do {ROTULOS[destino]}: {exc}"
        ) from exc
    conferir_conta(destino, logada)


async def conferir_no_navegador(destino: str, perfil: Path, url: str) -> None:
    """Abre (ou reusa) o navegador do robô e confere a conta logada antes do envio."""
    await asyncio.to_thread(_conferir_no_navegador, destino, perfil, url)
