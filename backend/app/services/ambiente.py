"""Pré-requisitos da máquina: o que o app precisa e o que está faltando (D-627).

Quem instala o app numa máquina nova descobre o que falta pelo pior caminho: o
download morre porque não há `yt-dlp`, o render morre porque ninguém rodou
`npm install` no renderer, e a mensagem de erro fala da etapa, não da causa.

Esta checagem responde antes, num lugar só. Cada item diz se é obrigatório,
se está ok e, quando não está, o que fazer. Nada aqui conserta coisa alguma, e
nada aqui lê o valor de uma credencial: só se ela existe.
"""

from __future__ import annotations

import shutil
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.channel_paths import youtube_client_secrets_path
from app.config import settings
from app.domain.video_encoder import VideoEncoder
from app.infrastructure import antigravity_cli_client, claude_cli_client
from app.infrastructure.encoder_detector import encoder_da_maquina
from app.services import navegador_assistido

_RAIZ = Path(__file__).resolve().parents[3]

Estado = Literal["ok", "aviso", "erro"]


@dataclass(frozen=True)
class Checagem:
    id: str
    nome: str
    obrigatorio: bool
    ok: bool
    detalhe: str
    como_resolver: str = ""

    @property
    def estado(self) -> Estado:
        # Faltar o opcional desliga UMA função; faltar o obrigatório desliga o app.
        if self.ok:
            return "ok"
        return "erro" if self.obrigatorio else "aviso"


@dataclass(frozen=True)
class Sondas:
    """O que a checagem consulta na máquina. Os testes trocam por dublês."""

    achar_binario: Callable[[str], str | None]
    existe: Callable[[Path], bool]
    encoder: Callable[[], VideoEncoder]
    claude_cli: Callable[[], str | None]
    agy_cli: Callable[[], str | None]
    chrome: Callable[[], Path | None]
    client_secrets: Callable[[], Path]
    tem_chave_gemini: Callable[[], bool]


def _resolver_ou_none(
    resolver: Callable[[], str], erro: type[Exception]
) -> Callable[[], str | None]:
    def sonda() -> str | None:
        try:
            return resolver()
        except erro:
            return None

    return sonda


def sondas_da_maquina() -> Sondas:
    return Sondas(
        achar_binario=shutil.which,
        existe=Path.exists,
        encoder=encoder_da_maquina,
        claude_cli=_resolver_ou_none(
            claude_cli_client._resolver_binario, claude_cli_client.ClaudeCliError
        ),
        agy_cli=_resolver_ou_none(
            antigravity_cli_client._resolver_binario, antigravity_cli_client.AntigravityCliError
        ),
        chrome=navegador_assistido._chrome_no_disco,
        client_secrets=youtube_client_secrets_path,
        tem_chave_gemini=lambda: bool(settings.gemini_api_key),
    )


def _binario(sondas: Sondas, id_: str, nome: str, binario: str, como_resolver: str) -> Checagem:
    caminho = sondas.achar_binario(binario)
    return Checagem(
        id=id_,
        nome=nome,
        obrigatorio=True,
        ok=caminho is not None,
        detalhe=caminho or f"`{binario}` não está no PATH",
        como_resolver=como_resolver,
    )


def _deps_do_renderer(sondas: Sondas) -> Checagem:
    ok = sondas.existe(_RAIZ / "video-renderer" / "node_modules" / "remotion")
    return Checagem(
        id="renderer_deps",
        nome="Dependências do renderer",
        obrigatorio=True,
        ok=ok,
        detalhe="video-renderer/node_modules instalado"
        if ok
        else "falta o `npm install` do renderer",
        como_resolver="Na pasta video-renderer, rode `npm ci`.",
    )


def _encoder(sondas: Sondas) -> Checagem:
    encoder = sondas.encoder()
    qsv = encoder is VideoEncoder.QSV
    return Checagem(
        id="encoder",
        nome="Aceleração de vídeo",
        obrigatorio=False,
        ok=qsv,
        detalhe="Intel Quick Sync (QSV)" if qsv else "render em CPU (libx264), mais lento",
        como_resolver="Funciona sem isso. Só máquinas com vídeo Intel usam o Quick Sync.",
    )


def _opcional(
    id_: str, nome: str, achado: object | None, detalhe_ok: str, como_resolver: str
) -> Checagem:
    return Checagem(
        id=id_,
        nome=nome,
        obrigatorio=False,
        ok=achado is not None,
        detalhe=detalhe_ok if achado is not None else "não encontrado",
        como_resolver=como_resolver,
    )


def checar(sondas: Sondas) -> list[Checagem]:
    """Todos os itens, obrigatórios primeiro. Síncrono: chame fora do event loop."""
    client_secrets = sondas.client_secrets()
    return [
        _binario(
            sondas,
            "ffmpeg",
            "ffmpeg",
            "ffmpeg",
            "Instale o ffmpeg (ex.: `winget install Gyan.FFmpeg`) e reabra o app.",
        ),
        _binario(
            sondas,
            "ffprobe",
            "ffprobe",
            "ffprobe",
            "Vem junto com o ffmpeg. Instale o ffmpeg e reabra o app.",
        ),
        _binario(
            sondas,
            "yt_dlp",
            "yt-dlp",
            "yt-dlp",
            "Instale o yt-dlp (ex.: `winget install yt-dlp.yt-dlp`) e reabra o app.",
        ),
        _binario(
            sondas,
            "node",
            "Node.js",
            "node",
            "Instale o Node.js LTS (nodejs.org) e reabra o app.",
        ),
        _deps_do_renderer(sondas),
        _encoder(sondas),
        _opcional(
            "claude_cli",
            "Claude CLI",
            sondas.claude_cli(),
            "análise automática disponível",
            "Sem ele, a análise funciona no modo manual: copie o prompt e cole a "
            "resposta. Para automatizar, instale o Claude Code ou defina CLAUDE_CLI_PATH.",
        ),
        _opcional(
            "agy_cli",
            "Antigravity CLI (Gemini)",
            sondas.agy_cli(),
            "botões do Gemini disponíveis",
            "Sem ele, os botões do Gemini ficam indisponíveis. Instale o Antigravity "
            "CLI ou defina AGY_CLI_PATH.",
        ),
        _opcional(
            "youtube_client",
            "Credencial do YouTube",
            client_secrets if sondas.existe(client_secrets) else None,
            "client_secrets.json encontrado",
            f"Sem ela, não dá para publicar no YouTube. Coloque o client_secrets.json em "
            f"{client_secrets.parent}.",
        ),
        _opcional(
            "gemini_key",
            "Chave do Gemini",
            True if sondas.tem_chave_gemini() else None,
            "GEMINI_API_KEY definida",
            "Sem ela, a imagem da thumbnail não é gerada. Defina GEMINI_API_KEY no backend/.env.",
        ),
        _opcional(
            "chrome",
            "Google Chrome",
            sondas.chrome(),
            "upload assistido disponível",
            "Sem ele, o upload assistido no TikTok e no Instagram fica indisponível. "
            "Instale o Chrome ou defina CHROME_PATH.",
        ),
    ]
