"""Reels pela API oficial do Instagram, sem navegador (D-802).

## Por que agora dá

A D-564 descartou a API achando que ela exigia conta Business ligada a uma
Página e App Review. Em 28/09/2026 a documentação da Meta mostrou outra coisa:
a API com login do Instagram atende conta de CRIADOR, sem Página, e um app em
modo de desenvolvimento publica na conta de quem é "Instagram Tester" dele — sem
revisão. O operador criou o app e gerou o token nesse dia.

## O que ela não faz

- **Não agenda.** Não há data de publicação na API; e um destino que não agenda
  publicaria NA HORA um Reel marcado para amanhã. Com data, este destino recusa
  e diz por quê — em vez de adiantar um post.
- **Não recebe a capa como arquivo.** O `cover_url` só aceita endereço público;
  a capa sobe para um link que se apaga em 1 h (decisão do operador).

## O token

Vem do `INSTAGRAM_ACCESS_TOKEN` do `.env` e vale 60 dias. Na primeira vez ele é
copiado para `instagram_token.json`, na pasta do canal (como o `token.json` do
YouTube), e dali em diante é renovado sozinho quando passa de 30 dias — a Meta
só renova token com mais de 24 h e ainda válido, então esperar o fim seria
perder a janela.
"""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path

from app.config import settings
from app.core.channel_paths import active_channel_root
from app.domain.publicacao.agendamento import Agendamento
from app.domain.publicacao.publicacao import ModoPublicacao, Plataforma, legenda_unica
from app.infrastructure import instagram_graph
from app.services.publicacao_destinos import Destino, PacotePublicacao

logger = logging.getLogger(__name__)

ARQUIVO_DO_TOKEN = "instagram_token.json"
RENOVAR_DEPOIS_DE = timedelta(days=30)
# A Meta processa o vídeo depois do upload; um Reel de 90 s leva segundos,
# mas a fila deles varia. Dez minutos cobrem o dia ruim sem esperar para sempre.
SEGUNDOS_PARA_PROCESSAR = 600.0
INTERVALO_DO_STATUS = 3.0

SEM_AGENDAMENTO = (
    "O Instagram nao agenda pela API: publicar agora adiantaria um Reel marcado para "
    "{quando}. Tire a data para publicar na hora, ou ligue o robo do Instagram."
)
SEM_TOKEN = (
    "Falta o token do Instagram: ponha INSTAGRAM_ACCESS_TOKEN no .env do backend "
    "(gerado no painel da Meta) e reinicie o app."
)


def _caminho_do_token() -> Path:
    return active_channel_root() / ARQUIVO_DO_TOKEN


def _ler_token_guardado() -> tuple[str, datetime | None]:
    try:
        dados = json.loads(_caminho_do_token().read_text(encoding="utf-8"))
        return str(dados.get("token") or ""), datetime.fromisoformat(dados["renovado_em"])
    except (OSError, ValueError, KeyError, TypeError):
        return "", None


def _guardar_token(token: str) -> None:
    caminho = _caminho_do_token()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    dados = {"token": token, "renovado_em": datetime.utcnow().isoformat()}
    caminho.write_text(json.dumps(dados), encoding="utf-8")


def configurado() -> bool:
    """Há token para a API — no `.env` ou guardado no canal?

    Roda no import (registro dos destinos): sem canal ativo ainda, o que vale
    é o `.env`, e nenhuma falha aqui pode derrubar o boot.
    """
    if settings.instagram_access_token:
        return True
    try:
        return bool(_ler_token_guardado()[0])
    except Exception:  # noqa: BLE001 — sem canal resolvido, sem token guardado
        return False


def token_atual() -> str:
    """O token em uso, renovado quando passou da idade. Vazio quando não há."""
    guardado, renovado_em = _ler_token_guardado()
    if not guardado:
        if not settings.instagram_access_token:
            return ""
        _guardar_token(settings.instagram_access_token)
        return settings.instagram_access_token
    if renovado_em and datetime.utcnow() - renovado_em > RENOVAR_DEPOIS_DE:
        try:
            novo, _validade = instagram_graph.renovar_token(guardado)
            if novo:
                _guardar_token(novo)
                logger.info("[Instagram] token renovado por mais 60 dias")
                return novo
        except Exception as exc:  # noqa: BLE001 — o token velho ainda vale até expirar
            logger.warning("[Instagram] nao consegui renovar o token: %s", exc)
    return guardado


def _capa_em_jpeg(capa: Path, pasta: Path) -> Path:
    """A capa como JPEG sRGB: é o único formato que o `cover_url` do Reel aceita."""
    from PIL import Image

    destino = pasta / "capa.jpg"
    with Image.open(capa) as imagem:
        imagem.convert("RGB").save(destino, "JPEG", quality=92, subsampling=0)
    return destino


def _esperar_processar(token: str, container_id: str) -> None:
    limite = time.monotonic() + SEGUNDOS_PARA_PROCESSAR
    while time.monotonic() < limite:
        estado, detalhe = instagram_graph.status_do_container(token, container_id)
        if estado == "FINISHED":
            return
        if estado in ("ERROR", "EXPIRED"):
            raise instagram_graph.ErroDoInstagram(
                f"o Instagram nao conseguiu processar o video ({estado}): {detalhe}"
            )
        time.sleep(INTERVALO_DO_STATUS)
    raise instagram_graph.ErroDoInstagram(
        f"o Instagram nao terminou de processar em {int(SEGUNDOS_PARA_PROCESSAR)}s"
    )


def publicar_reel(video: Path, legenda: str, capa: Path | None) -> dict:
    """O Reel inteiro, síncrono (para rodar em thread): do disco ao post no ar."""
    token = token_atual()
    if not token:
        raise instagram_graph.ErroDoInstagram(SEM_TOKEN)
    conta, usuario = instagram_graph.quem_sou(token)

    capa_url = ""
    if capa is not None:
        # RN-26: sem a capa confirmada, nada vai ao ar sozinho. Se ela não sobe,
        # a falha interrompe aqui — antes de existir um post com um quadro qualquer.
        with tempfile.TemporaryDirectory() as pasta:
            capa_url = instagram_graph.hospedar_por_uma_hora(_capa_em_jpeg(capa, Path(pasta)))

    container = instagram_graph.criar_container(token, conta, legenda=legenda, capa_url=capa_url)
    logger.info("[Instagram] enviando %s para @%s", video.name, usuario)
    instagram_graph.enviar_video(token, container, video)
    _esperar_processar(token, container.id)
    midia = instagram_graph.publicar(token, conta, container.id)
    url = instagram_graph.permalink(token, midia)
    logger.info("[Instagram] reel publicado: %s", url or midia)
    return {"video_id": midia, "url": url, "capa_aplicada": bool(capa_url)}


class DestinoInstagramReelsApi(Destino):
    """O Reels pela API: sobe, espera a Meta processar e publica — sem Chrome."""

    plataforma = Plataforma.INSTAGRAM_REELS
    modo = ModoPublicacao.API
    # `True` para RECEBER a data do lote (ver `com_agendamento`) e recusá-la em
    # voz alta; com `False` a data nem chegaria, e o Reel sairia na hora.
    agenda_sozinho = True

    def __init__(self, *, agendamento: Agendamento | None = None) -> None:
        self.agendamento = agendamento

    async def publicar(self, pacote: PacotePublicacao) -> dict:
        if self.agendamento:
            raise instagram_graph.ErroDoInstagram(
                SEM_AGENDAMENTO.format(quando=self.agendamento.legivel())
            )
        legenda = legenda_unica(pacote.metadados.titulo, pacote.metadados.descricao)
        resultado = await asyncio.to_thread(publicar_reel, pacote.arquivo, legenda, pacote.capa)
        return {"plataforma": self.plataforma.value, **resultado, "avisos": []}


def destino_do_reels(reserva: Destino) -> Destino:
    """O destino do Reels: a API quando há token, senão a `reserva` (o pacote)."""
    return DestinoInstagramReelsApi() if configurado() else reserva
