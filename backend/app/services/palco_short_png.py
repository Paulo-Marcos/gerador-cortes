"""Geração e cache do PNG do palco do SHORT (E-038, D-508).

O palco vertical — fundo com textura, chrome, molduras — é rasterizado pelo
Remotion still (`scripts/gen-short-palco.mjs`) com as janelas de vídeo
TRANSPARENTES, e o FFmpeg empilha o PNG por cima do vídeo composto. É a mesma
Variante A que o horizontal usa desde a F-020; aqui muda o quadro e o número de
janelas.

## Por que o backend é dono da chave de cache

Mesma divisão do `youtube_palco`: o Python calcula o hash e o caminho, o gerador
Node só recebe onde escrever. Hash calculado dos dois lados divergiria no
primeiro arredondamento de float, e o sintoma seria um cache que nunca acerta —
um render de Remotion por short, toda vez.

## Por que a falha NÃO derruba o render

Sem PNG, o short sai sem a moldura do canal. É pior que com, e é muito melhor
que não sair. Quem chama recebe `None` e segue pelo caminho antigo; o aviso fica
no log, com a saída do gerador, porque um palco que some calado já custou três
semanas a este projeto (D-384).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path

from app import channel_paths
from app.core import process_runner

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_GEN_SCRIPT = _REPO_ROOT / "scripts" / "gen-short-palco.mjs"

# Quantos bytes do fim da saída do gerador entram no log quando ele falha.
_SAIDA_TAIL = 1200

# Um render de Remotion por vez para o mesmo palco. Sem isto, dois shorts com o
# mesmo arranjo disparam dois `remotion still` sobre o MESMO arquivo — e o
# segundo lê um PNG pela metade.
_em_voo: set[str] = set()


def _cache_dir() -> Path:
    return channel_paths.palco_cache_dir()


def chave_de(fundo: str, janelas: list[dict]) -> str:
    """O identificador do palco: mesmo fundo e mesmas janelas, mesmo arquivo.

    Só a GEOMETRIA entra — dois shorts de cortes diferentes, com o mesmo arranjo
    e o mesmo fundo, compartilham o PNG. É o que faz o cache valer a pena: o
    palco não depende do conteúdo do vídeo, só do buraco onde ele passa.

    Exemplos:
        >>> a = chave_de("hud-forte", [{"x": 0, "y": 0, "w": 1080, "h": 1920}])
        >>> b = chave_de("hud-forte", [{"x": 0, "y": 0, "w": 1080, "h": 1920}])
        >>> a == b
        True
        >>> a == chave_de("topographic", [{"x": 0, "y": 0, "w": 1080, "h": 1920}])
        False
    """
    material = json.dumps(
        {
            "fundo": fundo,
            "janelas": [
                {lado: int(janela[lado]) for lado in ("x", "y", "w", "h")} for janela in janelas
            ],
        },
        sort_keys=True,
    )
    return hashlib.sha1(material.encode("utf-8")).hexdigest()[:16]


async def obter(fundo: str, janelas: list[dict]) -> Path | None:
    """O PNG deste palco, gerando-o se ainda não existe.

    `None` quando não deu para gerar — quem chama segue sem moldura em vez de
    abortar. Também `None` sem janela nenhuma: um palco sem buraco é uma imagem
    opaca cobrindo o vídeo inteiro, e ninguém quer isso por acidente.
    """
    if not janelas:
        return None

    chave = chave_de(fundo, janelas)
    destino = _cache_dir() / f"short-{chave}.png"
    if destino.is_file() and destino.stat().st_size > 0:
        return destino

    if chave in _em_voo:
        # Outro render está gerando este mesmo palco. Esperar seria melhor, mas
        # exigiria um lock de verdade; seguir sem moldura desta vez é o preço, e
        # na próxima o arquivo já está no cache.
        logger.info("[PalcoShort] %s ja esta sendo gerado; este render segue sem moldura", chave)
        return None

    _em_voo.add(chave)
    try:
        return await _gerar(chave, destino, {"fundo": fundo, "janelas": janelas})
    finally:
        _em_voo.discard(chave)


async def _gerar(chave: str, destino: Path, props: dict) -> Path | None:
    cache = _cache_dir()
    cache.mkdir(parents=True, exist_ok=True)
    fd, props_path = tempfile.mkstemp(suffix=".short-palco.json", dir=str(cache))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(props, handle)

        returncode, saida = await _rodar_node(destino, props_path)
        if returncode != 0 or not destino.is_file():
            logger.warning(
                "[PalcoShort] gen-short-palco falhou (rc=%s) para %s: %s",
                returncode,
                chave,
                saida[-_SAIDA_TAIL:],
            )
            return None
        logger.info("[PalcoShort] %s gerado", destino.name)
        return destino
    finally:
        Path(props_path).unlink(missing_ok=True)


async def _rodar_node(destino: Path, props_path: str) -> tuple[int, str]:
    """Roda o gerador pelo runner único de processo externo (D-750).

    O runner guarda o fallback síncrono do event loop Selector do Windows (D-369):
    sem ele, a geração falharia calada.
    """
    resultado = await process_runner.rodar(
        ["node", str(_GEN_SCRIPT), str(destino), props_path], cwd=_REPO_ROOT, timeout=None
    )
    return resultado.returncode, resultado.saida
