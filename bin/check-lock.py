#!/usr/bin/env python3
"""
check-lock.py - Valida e gerencia travas de edicao em .guia/locks/registry.yaml.

Travas: arquivos listados nao podem sofrer operacoes bloqueadas sem
[unlock:<feature-id>] no commit message. Funciona em qualquer agente de IA
(filesystem + git + Python).

Uso:
    python bin/check-lock.py list
    python bin/check-lock.py check [--operation add|modify|delete|rename] <arquivo>...
    python bin/check-lock.py lock <feature-id> --description "..." [--operations ...] <arquivo>...
    python bin/check-lock.py unlock <feature-id>
    python bin/check-lock.py audit
    python bin/check-lock.py hook <commit-msg-file>             # git hook
    python bin/check-lock.py ci --files F --messages M          # CI

Veja .guia/locks/README.md para o protocolo completo.

Requer Python 3.8+ e PyYAML (`pip install pyyaml`).
"""
from __future__ import annotations

import argparse
from fnmatch import fnmatchcase
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.stderr.write("Erro: PyYAML nao instalado. Rode: pip install pyyaml\n")
    sys.exit(2)


REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY = REPO_ROOT / ".guia" / "locks" / "registry.yaml"
LOCK_IGNORE = REPO_ROOT / ".guia" / "locks" / "lock-ignore.txt"
UNLOCK_RE = re.compile(r"\[unlock:([a-z0-9_\-]+)\]", re.IGNORECASE)
ALL_OPERATIONS = ("add", "modify", "delete", "rename")

REGISTRY_HEADER = (
    "# Veja .guia/locks/README.md para o protocolo e formato.\n"
    "# Edicao via CLI (recomendado): python bin/check-lock.py lock|unlock\n"
    "# Ou edite manualmente preservando o schema abaixo.\n"
    "\n"
)


# ----- registry I/O --------------------------------------------------------

def _norm(path: str) -> str:
    return path.replace("\\", "/").lstrip("./").strip()


def _matches_pattern(pattern: str, path: str) -> bool:
    normalized_pattern = _norm(pattern)
    normalized_path = _norm(path)
    return normalized_pattern == normalized_path or fnmatchcase(normalized_path, normalized_pattern)


def _load_lock_ignore() -> list[str]:
    if not LOCK_IGNORE.exists():
        return []
    return [
        line.strip()
        for line in LOCK_IGNORE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def _is_ignored_path(path: str) -> bool:
    return any(_matches_pattern(pattern, path) for pattern in _load_lock_ignore())


def _load_data() -> dict:
    if not REGISTRY.exists():
        return {"version": 1, "locks": []}
    data = yaml.safe_load(REGISTRY.read_text(encoding="utf-8")) or {}
    data.setdefault("version", 1)
    if not data.get("locks"):
        data["locks"] = []
    return data


def _load_locks() -> list[dict]:
    return _load_data().get("locks", []) or []


def _save_locks(locks: list[dict]) -> None:
    data = {"version": 1, "locks": locks}
    body = yaml.safe_dump(
        data,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    )
    REGISTRY.write_text(REGISTRY_HEADER + body, encoding="utf-8")


def _lock_operations(lock: dict) -> set[str]:
    operations = lock.get("operations")
    if not operations:
        return set(ALL_OPERATIONS)
    return {_norm(str(operation)).lower() for operation in operations}


def _lock_matches(lock: dict, path: str, operation: str) -> bool:
    if _is_ignored_path(path):
        return False
    if operation not in _lock_operations(lock):
        return False
    return any(_matches_pattern(pattern, path) for pattern in lock.get("files", []) or [])


def _blocked(events: list[tuple[str, str]]) -> list[tuple[str, str, dict]]:
    locks = _load_locks()
    out: list[tuple[str, str, dict]] = []
    for path, operation in events:
        for lock in locks:
            if _lock_matches(lock, path, operation):
                out.append((path, operation, lock))
    return out


def _filter_unlocked(blocked: list[tuple[str, str, dict]], msg: str) -> list[tuple[str, str, dict]]:
    unlocked = {m.group(1).lower() for m in UNLOCK_RE.finditer(msg)}
    return [(path, operation, lock) for path, operation, lock in blocked if lock["id"].lower() not in unlocked]


def _print_block(blocked: list[tuple[str, str, dict]], stream) -> None:
    print("Arquivos travados em .guia/locks/registry.yaml:\n", file=stream)
    for path, operation, lock in blocked:
        desc = lock.get("description") or "sem descricao"
        print(f"  - {path}", file=stream)
        print(f"    operacao: {operation}", file=stream)
        print(f"    feature: {lock['id']}", file=stream)
        print(f"    protege: {desc}", file=stream)
    ids = sorted({lk["id"] for _, _, lk in blocked})
    print(
        "\nAntes de pedir unlock, explique impacto esperado, risco de regressao e alternativas.",
        file=stream,
    )
    print(
        "Para desbloquear, peca autorizacao ao dono e inclua na mensagem do commit:",
        file=stream,
    )
    for fid in ids:
        print(f"  [unlock:{fid}] motivo: <razao>", file=stream)


def _infer_operation(path: str) -> str:
    return "modify" if (REPO_ROOT / path).exists() else "add"


def _events_from_paths(paths: list[str], operation: str | None = None) -> list[tuple[str, str]]:
    return [(path, operation or _infer_operation(path)) for path in paths]


def _events_from_name_status(lines: list[str]) -> list[tuple[str, str]]:
    events: list[tuple[str, str]] = []
    for line in lines:
        if not line.strip():
            continue
        parts = line.split("\t")
        status = parts[0]
        code = status[0]
        if code == "A" and len(parts) >= 2:
            events.append((parts[1], "add"))
        elif code == "M" and len(parts) >= 2:
            events.append((parts[1], "modify"))
        elif code == "D" and len(parts) >= 2:
            events.append((parts[1], "delete"))
        elif code == "R" and len(parts) >= 3:
            old_path, new_path = parts[1], parts[2]
            events.extend([(old_path, "rename"), (old_path, "delete"), (new_path, "rename"), (new_path, "add")])
        elif code == "C" and len(parts) >= 3:
            events.append((parts[2], "add"))
        elif len(parts) == 1:
            events.extend(_events_from_paths([parts[0]]))
    return events


# ----- subcommands ---------------------------------------------------------

def cmd_list(_args: argparse.Namespace) -> int:
    locks = _load_locks()
    if not locks:
        print("Nenhuma trava ativa.")
        return 0
    print(f"{len(locks)} feature(s) travada(s):\n")
    for lock in locks:
        desc = lock.get("description", "")
        operations = ", ".join(sorted(_lock_operations(lock)))
        suffix = f" - {desc}" if desc else ""
        print(f"* {lock['id']} [{operations}]{suffix}")
        for f in lock.get("files", []) or []:
            print(f"    {f}")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    blocked = _blocked(_events_from_paths(args.files, args.operation))
    if not blocked:
        print(f"OK: {len(args.files)} arquivo(s), nenhum travado.")
        return 0
    _print_block(blocked, sys.stderr)
    return 1


def cmd_lock(args: argparse.Namespace) -> int:
    locks = _load_locks()
    if any(lk.get("id") == args.id for lk in locks):
        print(f"Erro: feature '{args.id}' ja existe no registry.", file=sys.stderr)
        return 1
    for f in args.files:
        if f != "*" and _is_ignored_path(f):
            print(f"Erro: arquivo nao pode ser travado por .guia/locks/lock-ignore.txt: {f}", file=sys.stderr)
            return 1
        if not (REPO_ROOT / f).exists():
            print(f"Aviso: arquivo nao encontrado no repo: {f}", file=sys.stderr)
    new_lock: dict = {
        "id": args.id,
        "description": args.description or "",
        "locked_at": date.today().isoformat(),
        "operations": args.operations,
        "files": [_norm(f) for f in args.files],
    }
    locks.append(new_lock)
    _save_locks(locks)
    print(f"Trava criada: {args.id}  ({len(args.files)} arquivo(s))")
    return 0


def cmd_unlock(args: argparse.Namespace) -> int:
    locks = _load_locks()
    remaining = [lk for lk in locks if lk.get("id") != args.id]
    if len(remaining) == len(locks):
        print(f"Erro: feature '{args.id}' nao encontrada no registry.", file=sys.stderr)
        return 1
    _save_locks(remaining)
    print(f"Trava removida: {args.id}")
    return 0


def cmd_audit(_args: argparse.Namespace) -> int:
    try:
        log = subprocess.check_output(
            [
                "git", "log",
                "--fixed-strings", "--grep", "[unlock:",
                "--pretty=format:%h|%ad|%s",
                "--date=short",
            ],
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Erro ao consultar git log.", file=sys.stderr)
        return 1
    if not log.strip():
        print("Nenhum desbloqueio registrado no historico.")
        return 0
    print("Desbloqueios registrados:\n")
    for line in log.strip().splitlines():
        parts = line.split("|", 2)
        if len(parts) == 3:
            sha, dt, subj = parts
            print(f"  {dt}  {sha}  {subj}")
    return 0


def cmd_hook(args: argparse.Namespace) -> int:
    msg = Path(args.msg_file).read_text(encoding="utf-8")
    try:
        staged = subprocess.check_output(
            ["git", "diff", "--cached", "--name-status", "--diff-filter=ACMRD"],
            text=True,
        ).splitlines()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return 0

    staged_events = _events_from_name_status(staged)
    blocked = _blocked(staged_events)
    if not blocked:
        return 0

    still = _filter_unlocked(blocked, msg)
    if not still:
        return 0

    print("\nCOMMIT BLOQUEADO - features travadas:\n", file=sys.stderr)
    _print_block(still, sys.stderr)
    print(
        "\nEdite a mensagem (git commit --amend) ou refaca o commit com as marcas acima.",
        file=sys.stderr,
    )
    return 1


def cmd_ci(args: argparse.Namespace) -> int:
    lines = [
        line.strip()
        for line in Path(args.files).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    msg_path = Path(args.messages)
    msg = msg_path.read_text(encoding="utf-8") if msg_path.exists() else ""

    events = _events_from_name_status(lines)
    blocked = _blocked(events)
    if not blocked:
        print(f"OK: {len(events)} operacao(oes), nenhum travado.")
        return 0

    still = _filter_unlocked(blocked, msg)
    if not still:
        print("OK: arquivos travados foram desbloqueados via [unlock:...] nos commits.")
        return 0

    print(
        "\nFALHA - PR modifica arquivos travados sem [unlock:<feature-id>]:\n",
        file=sys.stderr,
    )
    _print_block(still, sys.stderr)
    return 1


# ----- entry point ---------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validador e gerenciador de travas de edicao.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="Lista travas ativas").set_defaults(func=cmd_list)

    p_check = sub.add_parser("check", help="Checa arquivos pontuais")
    p_check.add_argument("--operation", choices=ALL_OPERATIONS, help="Operacao a checar; default: modify se existe, add se nao existe")
    p_check.add_argument("files", nargs="+")
    p_check.set_defaults(func=cmd_check)

    p_lock = sub.add_parser("lock", help="Adiciona trava a uma feature")
    p_lock.add_argument("id", help="Identificador da feature (kebab-case)")
    p_lock.add_argument("--description", "-d", default="", help="Descricao curta")
    p_lock.add_argument("--operations", nargs="+", choices=ALL_OPERATIONS, default=list(ALL_OPERATIONS), help="Operacoes bloqueadas")
    p_lock.add_argument("files", nargs="+", help="Arquivos a travar (paths relativos ao repo)")
    p_lock.set_defaults(func=cmd_lock)

    p_unlock = sub.add_parser("unlock", help="Remove trava de uma feature (permanente)")
    p_unlock.add_argument("id", help="Identificador da feature")
    p_unlock.set_defaults(func=cmd_unlock)

    sub.add_parser("audit", help="Lista desbloqueios temporarios no git log").set_defaults(func=cmd_audit)

    p_hook = sub.add_parser("hook", help="Modo git commit-msg")
    p_hook.add_argument("msg_file")
    p_hook.set_defaults(func=cmd_hook)

    p_ci = sub.add_parser("ci", help="Modo CI (le arquivos+mensagens de arquivos)")
    p_ci.add_argument("--files", required=True)
    p_ci.add_argument("--messages", required=True)
    p_ci.set_defaults(func=cmd_ci)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
