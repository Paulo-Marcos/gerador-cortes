"""Consolida os ASSETS VISUAIS do canal ativo (D-156) — comando OFFLINE.

Move, para `instance/channels/<ativo>/assets/`:
  - `video-renderer/public/mascote/`  -> `assets/mascote`  (superset de 51 poses)
  - `frontend/public/mascote/`        -> reconciliado em `assets/mascote` (subset de 34)
  - `backend/assets/youtube_bg/`   -> `assets/youtube_bg`
  - `backend/assets/retratos/`     -> `assets/retratos`
  - `video-renderer/theme.config.json` -> `assets/theme.config.json`

E o CATALOGO de poses do mascote (D-179), para a raiz do canal:
  - `backend/app/data/mascote_poses.json` -> `mascot/poses.json`
    (override lido pelo backend em `mascot_catalog._resolver_caminho`).

Os nomes legados (`public/sapo/`, `sapo_poses.json`) seguem aceitos como origem
(E-011) para não regredir instalações anteriores à genericização.

O move é um RENAME same-volume (atômico, sem copiar): instantâneo e lossless.
Aborta — sem mover nada — se origem e destino estiverem em volumes diferentes, ou
se o destino já contiver dados reais. NÃO move o cache do palco
(`projetos/_palco_cache`): esse já segue o canal pela consolidação de dados (D-155).

[ATENCAO] RODE COM TODOS OS SERVIÇOS PARADOS (backend, native_worker, Remotion).
[ATENCAO] FAÇA BACKUP de `instance/`, `backend/assets/`, `frontend/public/mascote/`,
`video-renderer/public/mascote/` e `video-renderer/theme.config.json` antes.

Uso (a partir de `backend/`):
    python -m app.consolidar_assets_canal --dry-run   # só inspeciona e mostra o plano
    python -m app.consolidar_assets_canal             # executa (pede confirmação)
    python -m app.consolidar_assets_canal --sim        # executa sem perguntar

Depois do move, os assets do canal ativo são re-materializados nos diretórios
servidos (Vite/Remotion), e cada boot normal repete isso de forma idempotente.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.channel_assets_sync import sincronizar_assets_servidos
from app.channel_layout_migration import (
    LayoutMigrationError,
    consolidar_assets_do_canal,
    garantir_layout_de_canais,
)

_APP_DIR = Path(__file__).resolve().parent
_BACKEND_ROOT = _APP_DIR.parent
_REPO_ROOT = _BACKEND_ROOT.parent


def _primeiro_existente(*candidatos: Path) -> Path:
    """Primeiro caminho existente (para exibir o nome real da origem); 1º se nenhum."""
    for candidato in candidatos:
        if candidato.exists():
            return candidato
    return candidatos[0]


# Nomes canônicos (`mascote/`, `mascote_poses.json`), com fallback ao legado
# (`sapo/`, `sapo_poses.json`) para o plano refletir a origem realmente presente.
_ORIGENS = (
    _primeiro_existente(
        _REPO_ROOT / "video-renderer" / "public" / "mascote",
        _REPO_ROOT / "video-renderer" / "public" / "sapo",
    ),
    _primeiro_existente(
        _REPO_ROOT / "frontend" / "public" / "mascote",
        _REPO_ROOT / "frontend" / "public" / "sapo",
    ),
    _BACKEND_ROOT / "assets" / "youtube_bg",
    _BACKEND_ROOT / "assets" / "retratos",
    _REPO_ROOT / "video-renderer" / "theme.config.json",
    # Catalogo de poses do mascote (D-179) -> `<canal>/mascot/poses.json`.
    _primeiro_existente(
        _BACKEND_ROOT / "app" / "data" / "mascote_poses.json",
        _BACKEND_ROOT / "app" / "data" / "sapo_poses.json",
    ),
)


def _inventario(caminho: Path) -> tuple[int, int]:
    """(nº de arquivos, total de bytes) sob `caminho` — 0,0 se ausente."""
    if not caminho.exists():
        return (0, 0)
    if caminho.is_file():
        return (1, caminho.stat().st_size)
    arquivos = [p for p in caminho.rglob("*") if p.is_file()]
    return (len(arquivos), sum(p.stat().st_size for p in arquivos))


def _humano(num_bytes: int) -> str:
    valor = float(num_bytes)
    for unidade in ("B", "KB", "MB", "GB", "TB"):
        if valor < 1024 or unidade == "TB":
            return f"{valor:.1f} {unidade}"
        valor /= 1024
    return f"{num_bytes} B"


def _imprimir_plano(canal_root: Path) -> list[tuple[Path, int, int]]:
    print(f"Canal ativo: {canal_root}")
    print("Origens a mover:")
    plano: list[tuple[Path, int, int]] = []
    for origem in _ORIGENS:
        n, tamanho = _inventario(origem)
        plano.append((origem, n, tamanho))
        estado = "(ausente — nada a mover)" if n == 0 else f"{n} arquivo(s), {_humano(tamanho)}"
        print(f"  - {origem}  ->  {estado}")
    return plano


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Consolida os assets visuais no canal ativo (D-156)."
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Só inspeciona e mostra o plano; não move nada."
    )
    parser.add_argument(
        "--sim", action="store_true", help="Executa sem pedir confirmação interativa."
    )
    args = parser.parse_args(argv)

    try:
        layout = garantir_layout_de_canais()
    except LayoutMigrationError as e:
        print(f"ERRO ao resolver o layout do canal: {e}", file=sys.stderr)
        return 2

    canal_root = layout.canal_root
    plano = _imprimir_plano(canal_root)
    total_arquivos = sum(n for _, n, _ in plano)

    if total_arquivos == 0:
        print("\nNada a consolidar — assets já estão no canal (ou ausentes). No-op.")
        return 0

    if args.dry_run:
        print("\n--dry-run: nenhuma alteração feita.")
        return 0

    if not args.sim:
        print(
            "\n[ATENCAO] Confirme que TODOS os serviços estão parados (backend, native_worker, "
            "Remotion) e que há BACKUP."
        )
        resposta = input("Digite 'mover' para executar o rename: ").strip().lower()
        if resposta != "mover":
            print("Cancelado — nada foi movido.")
            return 1

    try:
        consolidar_assets_do_canal()
    except LayoutMigrationError as e:
        print(f"\nABORTADO (nada perdido): {e}", file=sys.stderr)
        return 3
    except OSError as e:
        print(f"\nFALHA no move: {e}", file=sys.stderr)
        return 4

    # Re-materializa os assets do canal nos diretórios servidos (Vite/Remotion).
    materializados = sincronizar_assets_servidos()
    print(
        f"\nAssets consolidados no canal. {len(materializados)} arquivo(s) servido(s) materializado(s)."
    )

    # Verificação: as origens não-vazias devem ter saído do lugar legado.
    pendentes = [origem for origem, n, _ in plano if n > 0 and origem.exists()]
    if pendentes:
        print("\nATENÇÃO: origens ainda presentes (confira manualmente):", file=sys.stderr)
        for origem in pendentes:
            print(f"  - {origem}", file=sys.stderr)
        return 5

    print("Consolidação concluída sem perda. Pode reiniciar os serviços.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
