#!/usr/bin/env python3
"""
check_update_safety.py - Guard-rail de atualizacao (D-159).

Verifica se atualizar a aplicacao (publicar na DEV, `git pull` na PROD) e
SEGURO, ou seja: nao versiona nem apaga dado de producao. A aplicacao e
local/desktop e multi-canal -- os dados de producao vivem em
`instance/channels/<canal>/` (projetos/ com midias, projetos.db, editorial/,
mascot/, canal_config.py), tudo gitignored. O pull NUNCA pode tocar nesses
arquivos.

Rode ANTES de publicar na DEV e ANTES de `git pull` na PROD:

    python bin/check_update_safety.py                 # checa tudo + preview do pull (origin/main)
    python bin/check_update_safety.py --no-fetch      # pula o preview do pull (sem rede)
    python bin/check_update_safety.py --remote upstream --branch dev

Itens verificados:
  1. Nenhum dado de producao versionado (instance/, *.db/*.sqlite3,
     canal_config.py, midias sob pastas de dados projetos/). CRITICO.
  2. .gitignore cobre producao (instance/, *.db, canal_config.py, .env). CRITICO.
  3. Preview do pull: o delta HEAD..FETCH_HEAD nao pode tocar instance/ nem *.db. CRITICO.
  4. PROD-local que pode conflitar (.guia/, .claude/settings.json,
     frontend/.env.production versionados). AVISO -- lembra do overlay
     .git/info/exclude (D-142).
  5. Lembrete de backup do projetos.db antes do pull. INFO.

Exit code != 0 se qualquer item CRITICO falhar. Stdlib apenas; chama `git`
via subprocess a partir da raiz do repo.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Saida do git contem gitmoji (emoji) nas mensagens de commit; o terminal do
# Windows usa cp1252 por padrao e nao os codifica. Forca UTF-8 na saida para
# nao estourar UnicodeEncodeError ao imprimir os commits do preview do pull.
for _stream in (sys.stdout, sys.stderr):
    reconfigure = getattr(_stream, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8", errors="replace")

# --- cores/simbolos (ASCII para terminais Windows sem UTF-8) ---------------
OK = "[ OK ]"
FAIL = "[FALHA]"
WARN = "[AVISO]"
INFO = "[INFO]"

# Extensoes de midia/banco que sao SEMPRE dado, nunca codigo.
DATA_EXTS = (".mkv", ".mp4", ".mov", ".avi", ".webm", ".db", ".sqlite", ".sqlite3")

# Midia/banco sob uma pasta de DADOS `projetos/` (nao a pasta de codigo
# frontend/src/features/projetos/, que so tem .tsx/.ts).
PROJ_DATA_RE = re.compile(
    r"(?:^|/)(?:backend/)?(?:app/)?projetos/.*\.(?:mkv|mp4|mov|avi|webm|db|sqlite3?)$"
)


def run_git(args: list[str]) -> tuple[int, str, str]:
    """Roda git a partir da raiz do repo. Retorna (code, stdout, stderr)."""
    proc = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return proc.returncode, proc.stdout, proc.stderr


def tracked_files() -> list[str]:
    code, out, _ = run_git(["ls-files"])
    if code != 0:
        return []
    return [line for line in out.splitlines() if line]


# --- Check 1: nenhum dado de producao versionado --------------------------
def check_no_prod_data_tracked(files: list[str]) -> bool:
    print("1) Nenhum dado de producao versionado")
    offenders: list[tuple[str, str]] = []
    for path in files:
        base = path.rsplit("/", 1)[-1]
        if path.startswith("instance/"):
            offenders.append((path, "sob instance/ (dado do canal)"))
        elif path.lower().endswith((".db", ".sqlite", ".sqlite3")):
            offenders.append((path, "banco de dados"))
        elif base == "canal_config.py":  # o .example e permitido
            offenders.append((path, "config editorial do canal"))
        elif PROJ_DATA_RE.search(path):
            offenders.append((path, "midia sob pasta de dados projetos/"))

    if offenders:
        print(f"   {FAIL} {len(offenders)} arquivo(s) de producao versionado(s):")
        for path, reason in offenders:
            print(f"          - {path}  ({reason})")
        print("          Remova do indice: git rm --cached <arquivo> e confirme o .gitignore.")
        return False
    print(f"   {OK} nenhum dado de producao no indice do git")
    return True


# --- Check 2: .gitignore cobre producao -----------------------------------
def check_gitignore_covers(_files: list[str]) -> bool:
    print("2) .gitignore cobre producao")
    gitignore = REPO_ROOT / ".gitignore"
    if not gitignore.exists():
        print(f"   {FAIL} .gitignore nao encontrado")
        return False
    text = gitignore.read_text(encoding="utf-8", errors="replace")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    concepts = {
        "instance/": lambda ln: "instance/" in ln,
        "*.db / *.sqlite3": lambda ln: ".db" in ln or ".sqlite" in ln,
        "canal_config.py": lambda ln: "canal_config" in ln,
        ".env": lambda ln: re.search(r"(^|/)\.env($|[^.a-zA-Z])", ln) is not None,
    }
    missing = [name for name, pred in concepts.items() if not any(pred(ln) for ln in lines)]
    if missing:
        print(f"   {FAIL} regras ausentes no .gitignore: {', '.join(missing)}")
        return False
    print(f"   {OK} instance/, *.db, canal_config.py e .env cobertos")
    return True


# --- Check 3: preview do pull ---------------------------------------------
def check_pull_preview(remote: str, branch: str, no_fetch: bool) -> bool:
    print(f"3) Preview do pull ({remote}/{branch})")
    if no_fetch:
        print(f"   {INFO} pulado (--no-fetch)")
        return True

    code, _, err = run_git(["fetch", remote, branch])
    if code != 0:
        print(f"   {WARN} git fetch falhou ({err.strip() or 'sem detalhe'}); nao foi possivel prever o pull")
        return True  # sem rede/remote != falha critica

    code, out, _ = run_git(["diff", "--name-only", "HEAD..FETCH_HEAD"])
    if code != 0:
        print(f"   {WARN} nao foi possivel calcular o delta HEAD..FETCH_HEAD")
        return True
    delta = [ln for ln in out.splitlines() if ln]

    if not delta:
        print(f"   {OK} nenhum arquivo novo virá no pull (ja atualizado)")
        return True

    dangerous = [p for p in delta if p.startswith("instance/") or p.lower().endswith((".db", ".sqlite", ".sqlite3"))]

    # Listar commits que virao.
    _, log_out, _ = run_git(["log", "--oneline", "HEAD..FETCH_HEAD"])
    commits = [ln for ln in log_out.splitlines() if ln]
    print(f"   {INFO} {len(delta)} arquivo(s) e {len(commits)} commit(s) chegarao no pull:")
    for c in commits[:15]:
        print(f"          {c}")
    if len(commits) > 15:
        print(f"          ... (+{len(commits) - 15})")

    if dangerous:
        print(f"   {FAIL} o pull tentaria alterar {len(dangerous)} arquivo(s) de producao:")
        for p in dangerous:
            print(f"          - {p}")
        return False
    print(f"   {OK} o delta do pull nao toca instance/ nem *.db")
    return True


# --- Check 4: PROD-local que pode conflitar (aviso) -----------------------
def check_prod_local_overlay(files: list[str]) -> bool:
    print("4) PROD-local que pode conflitar (aviso)")
    tracked = set(files)
    flagged: list[str] = []
    if any(p.startswith(".guia/") for p in tracked):
        flagged.append(".guia/")
    if ".claude/settings.json" in tracked:
        flagged.append(".claude/settings.json")
    if "frontend/.env.production" in tracked:
        flagged.append("frontend/.env.production")
    if flagged:
        print(f"   {WARN} versionado(s): {', '.join(flagged)}")
        print("          Na PROD, sobreponha localmente via .git/info/exclude (D-142)")
        print("          para o pull nao sobrescrever ajustes locais.")
    else:
        print(f"   {OK} nada de PROD-local sensivel versionado")
    return True  # nunca critico


# --- Check 5: lembrete de backup ------------------------------------------
def check_backup_reminder() -> bool:
    print("5) Backup antes do pull")
    print(f"   {INFO} antes de atualizar a PROD, faca backup de instance/channels/<canal>/projetos.db")
    print("          ex: copy instance\\channels\\<canal>\\projetos.db projetos.db.bak")
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Guard-rail de atualizacao: verifica que atualizar nao perde dado de producao.",
    )
    parser.add_argument("--remote", default="origin", help="remote para o preview do pull (default: origin)")
    parser.add_argument("--branch", default="main", help="branch para o preview do pull (default: main)")
    parser.add_argument("--no-fetch", action="store_true", help="pula o preview do pull (passo 3, sem rede)")
    args = parser.parse_args(argv)

    print("=" * 64)
    print("Guard-rail de atualizacao (D-159)")
    print("=" * 64)

    files = tracked_files()

    critical_results = [
        check_no_prod_data_tracked(files),
        check_gitignore_covers(files),
        check_pull_preview(args.remote, args.branch, args.no_fetch),
    ]
    # Nao-criticos (sempre True, apenas informam).
    check_prod_local_overlay(files)
    check_backup_reminder()

    print("=" * 64)
    if all(critical_results):
        print(f"{OK} Seguro para atualizar (itens criticos OK).")
        return 0
    falhas = critical_results.count(False)
    print(f"{FAIL} {falhas} item(ns) critico(s) falharam -- NAO atualize antes de corrigir.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
