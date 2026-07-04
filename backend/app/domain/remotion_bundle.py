"""Identidade determinística do bundle Remotion.

Dado o conteúdo de `video-renderer/src/` (mais arquivos auxiliares como
`package.json`), produz um fingerprint estável que serve como chave de
cache. Se o fingerprint muda, o bundle precisa ser regenerado;
se permanece igual, podemos reusar o bundle anterior.

Esta camada é pura: lê arquivos do disco mas não escreve em lugar nenhum
e não depende de configurações da aplicação. Pode ser testada
isoladamente com `tmp_path`.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable
from pathlib import Path

_SOURCE_EXTENSIONS = frozenset({".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".html"})
_IGNORED_DIRS = frozenset({"node_modules", ".bundle-cache", ".cache", "dist", "build"})


def compute_src_fingerprint(
    src_dir: Path,
    extra_files: Iterable[Path] = (),
) -> str:
    """Calcula SHA256 estável do conteúdo de `src_dir` + `extra_files`.

    Estabilidade: arquivos são processados em ordem alfabética por path
    relativo, com normalização de separadores (`\\` → `/`). Isso garante
    o mesmo fingerprint em Windows e Linux para o mesmo conteúdo.

    Arquivos cobertos: aqueles com extensão em `_SOURCE_EXTENSIONS` dentro
    de `src_dir` (recursivo), ignorando pastas em `_IGNORED_DIRS`.

    Exemplo:
        >>> fp1 = compute_src_fingerprint(Path("video-renderer/src"))
        >>> fp2 = compute_src_fingerprint(Path("video-renderer/src"))
        >>> fp1 == fp2
        True
    """
    if not src_dir.exists():
        raise FileNotFoundError(f"src_dir não existe: {src_dir}")
    if not src_dir.is_dir():
        raise NotADirectoryError(f"src_dir não é diretório: {src_dir}")

    hasher = hashlib.sha256()

    for relative_path, absolute_path in _walk_source_files(src_dir):
        _absorb_file(hasher, label=f"src:{relative_path}", file_path=absolute_path)

    for extra in sorted(_unique_existing(extra_files)):
        _absorb_file(hasher, label=f"extra:{extra.name}", file_path=extra)

    return hasher.hexdigest()


def _walk_source_files(src_dir: Path) -> list[tuple[str, Path]]:
    """Retorna `[(rel_path_posix, abs_path), ...]` ordenado alfabeticamente."""
    encontrados: list[tuple[str, Path]] = []
    for path in src_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in _SOURCE_EXTENSIONS:
            continue
        if _esta_em_pasta_ignorada(path, src_dir):
            continue
        relative = path.relative_to(src_dir).as_posix()
        encontrados.append((relative, path))
    encontrados.sort(key=lambda item: item[0])
    return encontrados


def _esta_em_pasta_ignorada(path: Path, root: Path) -> bool:
    for part in path.relative_to(root).parts[:-1]:
        if part in _IGNORED_DIRS:
            return True
    return False


def _unique_existing(paths: Iterable[Path]) -> list[Path]:
    seen: set[Path] = set()
    result: list[Path] = []
    for p in paths:
        resolved = p.resolve() if p.exists() else p
        if resolved in seen or not p.exists():
            continue
        seen.add(resolved)
        result.append(p)
    return result


def _absorb_file(hasher: hashlib._Hash, *, label: str, file_path: Path) -> None:
    """Mistura no hash: rótulo + tamanho + conteúdo do arquivo.

    O rótulo (path relativo ou nome) é incluído para que mover um
    arquivo invalide o fingerprint, mesmo que o conteúdo seja idêntico.
    """
    hasher.update(label.encode("utf-8"))
    hasher.update(b"\0")
    hasher.update(str(file_path.stat().st_size).encode("utf-8"))
    hasher.update(b"\0")
    with file_path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    hasher.update(b"\0")
