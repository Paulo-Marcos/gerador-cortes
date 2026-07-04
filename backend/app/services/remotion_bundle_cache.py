"""Cache de bundles Remotion endereçado por fingerprint.

Cada entrada vive em `<root>/<fingerprint>/`. Existem dois marcadores:

- `index.html`: gerado pelo `remotion bundle`. Sua presença sinaliza
  que o bundle está pronto para ser servido (cache hit).
- `committed.txt`: criado por este service após a conclusão bem-sucedida.
  Carrega o timestamp para LRU. Existe separado de `index.html` para
  evitar reusar bundles parcialmente gerados (build interrompido).

`get_or_create()` recebe um `builder` que materializa o bundle em um path
reservado. Se falhar, o diretório parcial é apagado para não envenenar o
cache. Isso isola este service de QUALQUER conhecimento sobre o Remotion
em si — só sabe lidar com pastas e timestamps.
"""

from __future__ import annotations

import logging
import shutil
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


_INDEX_FILE = "index.html"
_COMMIT_FILE = "committed.txt"


@dataclass(frozen=True)
class BundleCacheStats:
    total_entries: int
    committed_entries: int


class RemotionBundleCache:
    """Pasta-cache LRU para bundles Remotion.

    Não conhece o Remotion: aceita um builder callable que materializa o
    bundle em uma pasta que recebe como argumento.
    """

    def __init__(self, root: Path, *, max_entries: int = 3) -> None:
        if max_entries < 1:
            raise ValueError(f"max_entries deve ser >= 1, recebido {max_entries}")
        self._root = root
        self._max_entries = max_entries

    @property
    def root(self) -> Path:
        return self._root

    def lookup(self, fingerprint: str) -> Path | None:
        """Retorna o path do bundle se já estiver pronto, senão None."""
        entry_dir = self._entry_dir(fingerprint)
        if not self._is_ready(entry_dir):
            return None
        self._touch(entry_dir)
        return entry_dir

    async def get_or_create(
        self,
        fingerprint: str,
        builder: Callable[[Path], Awaitable[None]],
    ) -> Path:
        """Retorna o bundle do cache, ou constrói via `builder` e armazena.

        O `builder` recebe a pasta de saída e deve materializar o bundle
        ali dentro (mínimo: produzir `<pasta>/index.html`). Em caso de
        falha, a pasta é removida e a exceção propaga.
        """
        hit = self.lookup(fingerprint)
        if hit is not None:
            return hit

        entry_dir = self._reservar(fingerprint)
        try:
            await builder(entry_dir)
        except BaseException:
            shutil.rmtree(str(entry_dir), ignore_errors=True)
            raise

        if not self._has_index(entry_dir):
            shutil.rmtree(str(entry_dir), ignore_errors=True)
            raise RuntimeError(
                f"Builder não produziu '{_INDEX_FILE}' em {entry_dir}; bundle inválido."
            )

        self._commit(entry_dir)
        self._prune()
        return entry_dir

    def stats(self) -> BundleCacheStats:
        if not self._root.exists():
            return BundleCacheStats(total_entries=0, committed_entries=0)
        diretorios = [p for p in self._root.iterdir() if p.is_dir()]
        return BundleCacheStats(
            total_entries=len(diretorios),
            committed_entries=sum(1 for d in diretorios if self._is_ready(d)),
        )

    def prune_orphans(self) -> int:
        """Remove diretórios sem `index.html` (builds interrompidos). Retorna a contagem."""
        if not self._root.exists():
            return 0
        removidos = 0
        for entry in self._root.iterdir():
            if entry.is_dir() and not self._has_index(entry):
                shutil.rmtree(str(entry), ignore_errors=True)
                removidos += 1
        return removidos

    def _entry_dir(self, fingerprint: str) -> Path:
        _validar_fingerprint(fingerprint)
        return self._root / fingerprint

    def _reservar(self, fingerprint: str) -> Path:
        entry_dir = self._entry_dir(fingerprint)
        if entry_dir.exists():
            shutil.rmtree(str(entry_dir), ignore_errors=True)
        entry_dir.mkdir(parents=True, exist_ok=False)
        return entry_dir

    @staticmethod
    def _is_ready(entry_dir: Path) -> bool:
        return (
            entry_dir.exists()
            and (entry_dir / _INDEX_FILE).exists()
            and (entry_dir / _COMMIT_FILE).exists()
        )

    @staticmethod
    def _has_index(entry_dir: Path) -> bool:
        return (entry_dir / _INDEX_FILE).exists()

    @staticmethod
    def _commit(entry_dir: Path) -> None:
        (entry_dir / _COMMIT_FILE).write_text(str(time.time()), encoding="utf-8")

    @staticmethod
    def _touch(entry_dir: Path) -> None:
        commit_file = entry_dir / _COMMIT_FILE
        if commit_file.exists():
            commit_file.write_text(str(time.time()), encoding="utf-8")

    def _prune(self) -> None:
        if not self._root.exists():
            return
        prontos = [d for d in self._root.iterdir() if d.is_dir() and self._is_ready(d)]
        if len(prontos) <= self._max_entries:
            return

        prontos.sort(key=lambda d: _read_commit_time(d), reverse=True)
        for stale in prontos[self._max_entries :]:
            logger.info("[BundleCache] LRU: removendo %s", stale.name)
            shutil.rmtree(str(stale), ignore_errors=True)


def _validar_fingerprint(fingerprint: str) -> None:
    if not fingerprint or "/" in fingerprint or "\\" in fingerprint or ".." in fingerprint:
        raise ValueError(f"fingerprint inválido: {fingerprint!r}")


def _read_commit_time(entry_dir: Path) -> float:
    try:
        return float((entry_dir / _COMMIT_FILE).read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return 0.0
