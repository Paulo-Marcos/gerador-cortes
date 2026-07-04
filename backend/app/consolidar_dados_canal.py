"""Consolida os DADOS operacionais do canal ativo (D-155) — comando OFFLINE.

Move, para `instance/channels/<ativo>/`:
  - `backend/projetos/`          -> banco `projetos.db` + mídias (~70GB)
  - `backend/app/canal_config.py` -> config editorial do canal

O move é um RENAME same-volume (atômico, sem copiar): instantâneo e lossless.
Aborta — sem mover nada — se origem e destino estiverem em volumes diferentes,
ou se o destino já contiver dados reais.

[ATENCAO] RODE COM TODOS OS SERVIÇOS PARADOS (backend, native_worker, Remotion). Os
render workers observam uma fila DENTRO de `backend/projetos`, travando a pasta;
com eles no ar o rename falha com "Acesso negado" (WinError 5).
[ATENCAO] FAÇA BACKUP de `instance/` e `backend/projetos/` antes (responsabilidade do dev).

Uso (a partir de `backend/`):
    python -m app.consolidar_dados_canal --dry-run   # só inspeciona e mostra o plano
    python -m app.consolidar_dados_canal             # executa (pede confirmação)
    python -m app.consolidar_dados_canal --sim        # executa sem perguntar

Depois do move, os boots normais são no-op e `database_url()` segue o canal
automaticamente (vira quando o banco passa a existir lá).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.channel_layout_migration import (
    LayoutMigrationError,
    consolidar_dados_do_canal,
    garantir_layout_de_canais,
)

_APP_DIR = Path(__file__).resolve().parent
_BACKEND_ROOT = _APP_DIR.parent

_ORIGENS = (
    _BACKEND_ROOT / "projetos",
    _APP_DIR / "canal_config.py",
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
        description="Consolida os dados operacionais no canal ativo (D-155)."
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Só inspeciona e mostra o plano; não move nada."
    )
    parser.add_argument(
        "--sim", action="store_true", help="Executa sem pedir confirmação interativa."
    )
    args = parser.parse_args(argv)

    # Garante o layout (idempotente) só para resolver a raiz do canal ativo.
    try:
        layout = garantir_layout_de_canais()
    except LayoutMigrationError as e:
        print(f"ERRO ao resolver o layout do canal: {e}", file=sys.stderr)
        return 2

    canal_root = layout.canal_root
    plano = _imprimir_plano(canal_root)
    total_arquivos = sum(n for _, n, _ in plano)

    if total_arquivos == 0:
        print("\nNada a consolidar — dados já estão no canal (ou ausentes). No-op.")
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

    antes = {origem: _inventario(origem) for origem, _, _ in plano}
    try:
        consolidar_dados_do_canal()
    except LayoutMigrationError as e:
        print(f"\nABORTADO (nada perdido): {e}", file=sys.stderr)
        return 3
    except OSError as e:
        win = getattr(e, "winerror", None)
        dica = ""
        if win == 5:
            dica = (
                "\n  -> 'Acesso negado': algum serviço ainda segura backend/projetos. "
                "Pare backend/native_worker/Remotion e rode de novo."
            )
        print(f"\nFALHA no move: {e}{dica}", file=sys.stderr)
        return 4

    # Verificação lossless: o que saiu da origem entrou no destino.
    print("\nVerificação (origem -> destino):")
    ok = True
    for origem, (n_antes, bytes_antes) in antes.items():
        if n_antes == 0:
            continue
        destino = canal_root / origem.name
        n_dep, bytes_dep = _inventario(destino)
        marca = "OK" if (n_dep, bytes_dep) == (n_antes, bytes_antes) else "DIVERGÊNCIA"
        ok = ok and marca == "OK"
        print(f"  {marca}: {destino}  ({n_dep} arq, {_humano(bytes_dep)})")
        if origem.exists():
            ok = False
            print(f"  ATENÇÃO: origem ainda existe: {origem}")

    if not ok:
        print("\nConsolidação terminou com DIVERGÊNCIA — confira manualmente.", file=sys.stderr)
        return 5

    print("\nConsolidação concluída sem perda. Pode reiniciar os serviços.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
