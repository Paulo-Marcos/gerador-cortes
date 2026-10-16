"""Qual legenda baixada vira a transcrição da live (D-940).

O yt-dlp baixa todos os idiomas pedidos que o vídeo tiver, e cada um vira um
arquivo `sub.<idioma>.<formato>`. Pegar o primeiro do glob deixava a ordem
alfabética decidir — e `en` vem antes de `pt`. O canal fala português: o
inglês só serve quando é a única legenda que existe.
"""

from pathlib import Path

# Mesma ordem do `--sub-lang` em `infrastructure/ytdlp.py`.
PRIORIDADE_DE_IDIOMA = ("pt", "pt-BR", "pt-PT", "en")


def _idioma(arquivo: Path) -> str:
    """`sub.pt-BR.json3` → `pt-BR`."""
    return Path(arquivo.stem).suffix.lstrip(".")


def ordenar_por_idioma(arquivos: list[Path]) -> list[Path]:
    """As legendas do idioma de maior prioridade primeiro; idioma fora da lista por último."""

    def _posicao(arquivo: Path) -> int:
        idioma = _idioma(arquivo)
        if idioma in PRIORIDADE_DE_IDIOMA:
            return PRIORIDADE_DE_IDIOMA.index(idioma)
        return len(PRIORIDADE_DE_IDIOMA)

    return sorted(arquivos, key=_posicao)
