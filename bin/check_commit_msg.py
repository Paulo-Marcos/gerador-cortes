#!/usr/bin/env python3
"""check_commit_msg.py — confere o padrão de commit do AGENTS.md (D-091, D-684).

    <emoji> <tipo>(<escopo>): <descrição imperativa, minúscula, sem ponto final>

Bloqueia (sai 1) o que foge da forma: sem emoji antes do tipo, tipo fora da lista
canônica (`feature:` em vez de `feat:`), ou cabeçalho sem `tipo: descrição`.
Só avisa o que é estilo: cabeçalho acima de 72 caracteres, emoji diferente do da
tabela, ponto final. A maiúscula inicial não é conferida: a descrição pode começar
por nome próprio ("Chrome", "Fire"), e o script não distingue um do outro. Merge, revert e
fixup!/squash!/amend! gerados pelo git passam direto.

Uso:
    python bin/check_commit_msg.py hook <arquivo-da-mensagem>   # hook commit-msg
    python bin/check_commit_msg.py range <base> <head>          # CI
"""

import re
import subprocess
import sys

# A mesma tabela do AGENTS.md ("Padrão de commit").
EMOJI_DO_TIPO = {
    "feat": "✨",
    "fix": "🐛",
    "refactor": "♻",
    "chore": "🧹",
    "docs": "📝",
    "style": "🎨",
    "test": "✅",
    "perf": "⚡",
    "ci": "👷",
    "merge": "🔀",
}
LIMITE_DO_CABECALHO = 72
_SELETOR_DE_VARIACAO = chr(0xFE0F)
_GERADAS_PELO_GIT = re.compile(r"^(Merge |Revert \"|fixup! |squash! |amend! )")
_CABECALHO = re.compile(
    r"^(?P<emoji>\S+) (?P<tipo>[a-z]+)(?:\((?P<escopo>[^)]+)\))?!?: (?P<descricao>\S.*)$"
)


def cabecalho_da_mensagem(mensagem: str) -> str:
    """Primeira linha útil: pula as vazias e os comentários que o git põe no editor."""
    for linha in mensagem.splitlines():
        if linha.strip() and not linha.startswith("#"):
            return linha.rstrip()
    return ""


def _sem_seletor(texto: str) -> str:
    # ♻️ e ⚡️ chegam com ou sem o seletor de variação U+FE0F; os dois valem.
    return texto.replace(_SELETOR_DE_VARIACAO, "")


def conferir(cabecalho: str) -> tuple[list[str], list[str]]:
    """(erros, avisos) do cabeçalho. Erro bloqueia o commit; aviso não."""
    if not cabecalho:
        return ["mensagem vazia"], []
    if _GERADAS_PELO_GIT.match(cabecalho):
        return [], []

    achado = _CABECALHO.match(cabecalho)
    if not achado:
        return ["o cabeçalho deve ser `<emoji> <tipo>(<escopo>): <descrição>`"], []

    emoji, tipo, descricao = achado["emoji"], achado["tipo"], achado["descricao"]
    erros, avisos = [], []
    if emoji.isascii():
        erros.append(f"falta o emoji antes do tipo (`{emoji}` não é emoji)")
    if tipo not in EMOJI_DO_TIPO:
        canonicos = ", ".join(EMOJI_DO_TIPO)
        erros.append(f"tipo `{tipo}` fora da lista canônica ({canonicos})")
    elif not emoji.isascii() and _sem_seletor(emoji) != EMOJI_DO_TIPO[tipo]:
        avisos.append(f"o emoji da tabela para `{tipo}` é {EMOJI_DO_TIPO[tipo]}")

    if len(cabecalho) > LIMITE_DO_CABECALHO:
        avisos.append(
            f"cabeçalho com {len(cabecalho)} caracteres (limite {LIMITE_DO_CABECALHO});"
            " o porquê vai no corpo"
        )
    if descricao.endswith("."):
        avisos.append("a descrição não deve terminar com ponto")
    return erros, avisos


def _relatar(rotulo: str, cabecalho: str) -> bool:
    erros, avisos = conferir(cabecalho)
    for aviso in avisos:
        print(f"aviso ({rotulo}): {aviso}")
    for erro in erros:
        print(f"ERRO ({rotulo}): {erro}", file=sys.stderr)
    if erros:
        print(f"  cabeçalho: {cabecalho}", file=sys.stderr)
    return not erros


def _cabecalhos_do_range(base: str, head: str) -> list[tuple[str, str]]:
    saida = subprocess.run(
        ["git", "log", "--no-merges", "--format=%h%x00%s", f"{base}..{head}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=60,
    ).stdout
    return [tuple(linha.split("\0", 1)) for linha in saida.splitlines() if linha]


def main(argv: list[str]) -> int:
    for fluxo in (sys.stdout, sys.stderr):
        fluxo.reconfigure(encoding="utf-8", errors="replace")

    if len(argv) == 2 and argv[0] == "hook":
        with open(argv[1], encoding="utf-8") as arquivo:
            ok = _relatar("commit", cabecalho_da_mensagem(arquivo.read()))
        if not ok:
            print("Padrão em AGENTS.md, seção 'Padrão de commit'.", file=sys.stderr)
        return 0 if ok else 1

    if len(argv) == 3 and argv[0] == "range":
        resultados = [_relatar(sha, assunto) for sha, assunto in _cabecalhos_do_range(*argv[1:])]
        return 0 if all(resultados) else 1

    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
