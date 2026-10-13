"""Mensagens do chat da live, com autor e texto (D-910).

Irmão de `chat_heat.parse_live_chat`, que só guarda os INSTANTES para medir a
reação da plateia. Aqui o que importa é o conteúdo: a abertura do corte mostra
a pergunta que o apresentador está respondendo, com o texto como foi digitado e
o nome de quem perguntou.

O arquivo é o `*.live_chat.json` do yt-dlp (JSONL, uma ação de replay por
linha). O texto vem em `message.runs[]`, que mistura `{text}` e `{emoji}`:

- emoji unicode chega com o próprio caractere em `emojiId` e entra no texto;
- emoji customizado do canal (`isCustomEmoji`) é uma imagem sem caractere — não
  há como desenhá-lo no card, então sai.

Este módulo é puro: não lê arquivo, não conhece o yt-dlp nem o banco.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

_RENDERERS_DE_MENSAGEM = ("liveChatTextMessageRenderer", "liveChatPaidMessageRenderer")


@dataclass(frozen=True)
class MensagemChat:
    """Uma mensagem do chat: quando (segundos do vídeo), quem e o quê."""

    instante_seg: float
    autor: str
    texto: str
    foto_url: str = ""


def parse_mensagens_do_chat(conteudo: str) -> list[MensagemChat]:
    """Mensagens do chat replay em ordem de instante, sem as vazias.

    Linha quebrada ou item sem o formato esperado é ignorado em silêncio, como
    no `chat_heat`: o arquivo vem de fonte externa e não pode derrubar nada.
    """
    mensagens: list[MensagemChat] = []
    for linha in conteudo.splitlines():
        mensagens.extend(_mensagens_da_linha(linha.strip()))
    mensagens.sort(key=lambda m: m.instante_seg)
    return mensagens


def _mensagens_da_linha(linha: str) -> list[MensagemChat]:
    if not linha:
        return []
    try:
        evento = json.loads(linha)
        acao = evento.get("replayChatItemAction") or {}
        instante = int(acao["videoOffsetTimeMsec"]) / 1000.0
    except (ValueError, TypeError, KeyError, AttributeError):
        return []
    mensagens = []
    for item in acao.get("actions") or []:
        renderer = _renderer_de_mensagem(item)
        if renderer is None:
            continue
        texto = texto_da_mensagem((renderer.get("message") or {}).get("runs") or [])
        if texto:
            mensagens.append(
                MensagemChat(
                    instante_seg=instante,
                    autor=str((renderer.get("authorName") or {}).get("simpleText") or "").strip(),
                    texto=texto,
                    foto_url=_maior_foto(renderer.get("authorPhoto") or {}),
                )
            )
    return mensagens


def _renderer_de_mensagem(item: object) -> dict | None:
    if not isinstance(item, dict):
        return None
    conteudo = (item.get("addChatItemAction") or {}).get("item") or {}
    for chave in _RENDERERS_DE_MENSAGEM:
        if isinstance(conteudo.get(chave), dict):
            return conteudo[chave]
    return None


def texto_da_mensagem(runs: list) -> str:
    """O texto literal da mensagem, com emoji unicode e sem emoji customizado."""
    partes = []
    for run in runs:
        if not isinstance(run, dict):
            continue
        if "text" in run:
            partes.append(str(run["text"]))
        elif isinstance(run.get("emoji"), dict):
            partes.append(_emoji_unicode(run["emoji"]))
    return " ".join("".join(partes).split())


def _emoji_unicode(emoji: dict) -> str:
    if emoji.get("isCustomEmoji"):
        return ""
    caractere = str(emoji.get("emojiId") or "")
    # Defesa: um id de emoji de canal ("UCxxx/yyy") nunca é texto desenhável,
    # mesmo que a flag venha ausente.
    return "" if "/" in caractere else caractere


def _maior_foto(foto: dict) -> str:
    miniaturas = [m for m in foto.get("thumbnails") or [] if isinstance(m, dict) and m.get("url")]
    if not miniaturas:
        return ""
    return str(max(miniaturas, key=lambda m: int(m.get("width") or 0))["url"])
