"""release.py — a release em dois atos, com o PR no meio (D-782, D-823).

A main só recebe PR (D-822), então a versão não pode subir nela direto:

1. **Preparar**, numa branch `release-vX.Y.Z` criada da origin/main: confere a
   árvore e a versão pedida contra a sugerida pelas categorias do CHANGELOG,
   roda o portão do AGENTS.md, atualiza as cópias da versão (VERSION,
   package.json e lockfiles do frontend e do renderer, openapi.json), fecha o
   [Unreleased] e commita. Sem tag: o squash do PR muda o SHA.
2. **Taguear**, depois do merge: acha na origin/main o commit da release pelo
   assunto, exige o CI verde NAQUELE SHA e cria a tag anotada com as notas.

Nenhum ato faz push. Cada um termina imprimindo os comandos seguintes.

Uso (pelo bin\\release.ps1, que usa o Python do backend\\.venv):
    python bin/release.py 0.6.0 --resumo "o que esta versão entrega"
    python bin/release.py 0.6.0 --resumo "..." --verificar   # só confere
    python bin/release.py 0.6.0 --taguear                    # depois do merge
    python bin/release.py 0.6.0 --taguear --resumo "..."     # corpo sem o resumo
"""

import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
NIVEIS = ("patch", "minor", "major")
# Keep a Changelog: o que cada categoria significa para o número da versão.
CATEGORIAS_DE_PATCH = {"Fixed", "Security"}
COPIAS_DA_VERSAO = [
    "VERSION",
    "backend/openapi.json",
    "frontend/package.json",
    "frontend/package-lock.json",
    "video-renderer/package.json",
    "video-renderer/package-lock.json",
]
MOTIVO_DO_UNLOCK = "só o campo version sobe para {versao} (release, bin/release.py)"


class ErroDeRelease(Exception):
    """Condição que impede a release; a mensagem diz o que fazer."""


# ---- regras puras (testadas em backend/tests/test_release_d782.py) ----------


def ler_semver(texto: str) -> tuple[int, int, int]:
    achado = SEMVER.match(texto.strip())
    if not achado:
        raise ErroDeRelease(f"versão fora do formato X.Y.Z: {texto!r}")
    return tuple(int(parte) for parte in achado.groups())  # type: ignore[return-value]


def proxima_versao(atual: str, nivel: str) -> str:
    major, minor, patch = ler_semver(atual)
    if nivel == "major":
        return f"{major + 1}.0.0"
    if nivel == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def secoes_do_unreleased(changelog: str) -> dict[str, str]:
    """Categoria (`Added`, `Fixed`...) → texto, só das que têm conteúdo."""
    bloco = re.search(r"^## \[Unreleased\]\s*$(.*?)(?=^## \[|\Z)", changelog, re.M | re.S)
    if not bloco:
        raise ErroDeRelease("CHANGELOG.md sem a seção ## [Unreleased]")
    partes = re.split(r"^### (\w+)\s*$", bloco.group(1), flags=re.M)
    secoes = {}
    for categoria, corpo in zip(partes[1::2], partes[2::2], strict=True):
        if corpo.strip():
            secoes[categoria] = corpo.strip()
    return secoes


def nivel_sugerido(secoes: dict[str, str], atual: str) -> str:
    """Correção só → patch; qualquer outra categoria → minor. Quebra marcada
    ("BREAKING") → major a partir da 1.0; antes dela, a minor faz esse papel
    (SemVer, item 4: na 0.y.z tudo pode mudar)."""
    if not secoes:
        raise ErroDeRelease("o [Unreleased] do CHANGELOG está vazio: não há o que lançar")
    quebra = any("BREAKING" in corpo.upper() for corpo in secoes.values())
    if quebra and ler_semver(atual)[0] >= 1:
        return "major"
    if quebra or set(secoes) - CATEGORIAS_DE_PATCH:
        return "minor"
    return "patch"


def conferir_versao_pedida(atual: str, pedida: str, sugerido: str) -> None:
    for nivel in NIVEIS:
        if pedida == proxima_versao(atual, nivel):
            if NIVEIS.index(nivel) < NIVEIS.index(sugerido):
                raise ErroDeRelease(
                    f"{pedida} é um {nivel}, mas o CHANGELOG pede {sugerido}: "
                    f"use {proxima_versao(atual, sugerido)}"
                )
            return
    candidatas = ", ".join(proxima_versao(atual, nivel) for nivel in NIVEIS)
    raise ErroDeRelease(f"{pedida} não sucede {atual} (candidatas: {candidatas})")


def fechar_unreleased(changelog: str, versao: str, data: str, anterior: str) -> str:
    """Abre `## [versao] - data` sob um [Unreleased] vazio e acerta os links."""
    cabecalho = "## [Unreleased]\n"
    if cabecalho not in changelog:
        raise ErroDeRelease("CHANGELOG.md sem a linha '## [Unreleased]'")
    texto = changelog.replace(cabecalho, f"{cabecalho}\n## [{versao}] - {data}\n", 1)
    link = re.search(r"^\[Unreleased\]: (?P<base>\S+)/compare/v\S+\.\.\.HEAD$", texto, re.M)
    if not link:
        raise ErroDeRelease("CHANGELOG.md sem o link '[Unreleased]: .../compare/vX...HEAD'")
    base = link.group("base")
    novos = (
        f"[Unreleased]: {base}/compare/v{versao}...HEAD\n"
        f"[{versao}]: {base}/compare/v{anterior}...v{versao}"
    )
    return texto[: link.start()] + novos + texto[link.end() :]


def notas_da_versao(changelog: str, versao: str) -> str:
    bloco = re.search(
        rf"^## \[{re.escape(versao)}\][^\n]*\n(.*?)(?=^## \[|^\[[^\]]+\]: |\Z)",
        changelog,
        re.M | re.S,
    )
    if not bloco or not bloco.group(1).strip():
        raise ErroDeRelease(f"CHANGELOG.md sem notas para {versao}")
    return bloco.group(1).strip()


def assunto_do_commit(versao: str) -> str:
    return f"🧹 chore(release): subir a versão para {versao}"


def ramo_da_release(versao: str) -> str:
    return f"release-v{versao}"


def conferir_ramo(ramo: str, versao: str) -> None:
    if ramo != ramo_da_release(versao):
        raise ErroDeRelease(
            f"a versão sobe na branch {ramo_da_release(versao)} e entra pelo PR "
            f"(você está em {ramo!r}): "
            f"git worktree add ..\\gerador-cortes-v{versao} -b {ramo_da_release(versao)} origin/main"
        )


def sha_do_commit_da_release(log: str, versao: str) -> str:
    """No `git log --format=%H%x00%s` da origin/main, o commit da versão.

    O squash troca o SHA e o GitHub acrescenta " (#N)" ao assunto (D-891):
    aceita esse sufixo e nada além dele."""
    assunto = assunto_do_commit(versao)
    exato = re.compile(rf"{re.escape(assunto)}(\s\(#\d+\))?")
    for linha in log.splitlines():
        sha, _, texto = linha.partition("\x00")
        if exato.fullmatch(texto):
            return sha
    raise ErroDeRelease(f"a origin/main não tem '{assunto}': o PR da release já foi mergeado?")


def resumo_do_commit(corpo: str, versao: str) -> str:
    """O primeiro parágrafo do corpo, que o `preparar` gravou como resumo.

    Com mais de um commit no PR, o corpo padrão do squash abre com a bala
    "* <assunto>" de cada commit (D-891): a do commit da release é pulada.
    Trailer ou bala de outro commit no lugar do resumo recusa a tag, em vez
    de publicá-la com o resumo errado."""
    bala = f"* {assunto_do_commit(versao)}"
    paragrafos = [p.strip() for p in corpo.split("\n\n") if p.strip() and p.strip() != bala]
    primeiro = paragrafos[0] if paragrafos else ""
    if not primeiro or re.match(r"\* |\[unlock:|[\w-]+-by: ", primeiro, re.I):
        raise ErroDeRelease(
            "o corpo do commit da release não começa pelo resumo: "
            f'.\\bin\\release.ps1 {versao} -Taguear -Resumo "o que esta versão entrega"'
        )
    return primeiro


def conferir_ci_verde(runs_json: str, sha: str) -> None:
    """`gh run list --commit <sha> --workflow CI --json status,conclusion`."""
    runs = json.loads(runs_json)
    if not runs:
        raise ErroDeRelease(f"o CI ainda não rodou em {sha[:10]}")
    ultimo = runs[0]
    if ultimo["status"] != "completed":
        raise ErroDeRelease(f"o CI ainda roda em {sha[:10]}: espere e taguei de novo")
    if ultimo["conclusion"] != "success":
        raise ErroDeRelease(f"o CI em {sha[:10]} terminou em {ultimo['conclusion']}")


def marcas_de_unlock(saida_do_check_lock: str, versao: str) -> list[str]:
    ids = sorted(set(re.findall(r"\[unlock:([^\]]+)\]", saida_do_check_lock)))
    motivo = MOTIVO_DO_UNLOCK.format(versao=versao)
    return [f"[unlock:{trava}] motivo: {motivo}" for trava in ids]


# ---- efeitos: git, npm, arquivos -------------------------------------------


def rodar(
    comando: list[str], pasta: Path | None = None, env: dict | None = None, timeout=1800
) -> str:
    # `pasta=RAIZ` como padrão ficaria fixo na definição da função: um teste que
    # troca a RAIZ criou uma tag no repositório de verdade (D-782). Resolve aqui.
    ambiente = {**os.environ, "PYTHONUTF8": "1", **(env or {})}
    print(f"  $ {' '.join(comando)}", flush=True)
    feito = subprocess.run(
        comando, cwd=pasta or RAIZ, env=ambiente, capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=timeout,
    )  # fmt: skip
    if feito.returncode != 0:
        raise ErroDeRelease(f"falhou: {' '.join(comando)}\n{(feito.stdout + feito.stderr)[-3000:]}")
    return feito.stdout


def executavel(nome: str) -> str:
    caminho = shutil.which(nome)
    if not caminho:
        raise ErroDeRelease(f"{nome} não está no PATH")
    return caminho


def conferir_tag_nova(versao: str) -> None:
    if rodar(["git", "tag", "--list", f"v{versao}"]).strip():
        raise ErroDeRelease(f"a tag v{versao} já existe localmente")
    if rodar(["git", "ls-remote", "--tags", "origin", f"v{versao}"]).strip():
        raise ErroDeRelease(f"a tag v{versao} já existe no GitHub")


def conferir_arvore(versao: str) -> None:
    conferir_ramo(rodar(["git", "branch", "--show-current"]).strip(), versao)
    sujos = rodar(["git", "status", "--porcelain"]).strip()
    if sujos:
        raise ErroDeRelease(f"árvore com mudanças não commitadas:\n{sujos}")
    rodar(["git", "fetch", "origin", "main"])
    em_dia = subprocess.run(
        ["git", "merge-base", "--is-ancestor", "origin/main", "HEAD"], cwd=RAIZ, timeout=60
    )
    if em_dia.returncode != 0:
        raise ErroDeRelease("a branch não contém a origin/main atual: git rebase origin/main")
    conferir_tag_nova(versao)


def rodar_portao() -> None:
    """O mesmo portão do AGENTS.md e do CI, na árvore que vai ser lançada."""
    backend, py = RAIZ / "backend", sys.executable
    lint_imports = "from importlinter.cli import lint_imports_command; lint_imports_command()"
    for comando in (
        [py, "-m", "ruff", "check", "."],
        [py, "-m", "ruff", "format", "--check", "."],
        [py, "-c", lint_imports],
        [py, "-m", "pytest", "-q", "-p", "no:randomly"],
    ):
        rodar(comando, backend, timeout=3600)
    npm, npx = executavel("npm"), executavel("npx")
    frontend, renderer = RAIZ / "frontend", RAIZ / "video-renderer"
    for comando in (
        [npm, "run", "lint"],
        [npx, "tsc", "--noEmit"],
        [npx, "vitest", "run"],
        [npm, "run", "build"],
    ):
        rodar(comando, frontend)
    for comando in ([npm, "run", "lint"], [npm, "run", "test:cards"], [npm, "run", "build"]):
        rodar(comando, renderer)


def atualizar_copias(versao: str) -> None:
    (RAIZ / "VERSION").write_text(f"{versao}\n", encoding="utf-8", newline="\n")
    npm = executavel("npm")
    for pacote in ("frontend", "video-renderer"):
        rodar(
            [npm, "version", versao, "--no-git-tag-version", "--allow-same-version"], RAIZ / pacote
        )
    backend = RAIZ / "backend"
    contrato = "tests/test_contrato_openapi_d664.py"
    rodar([sys.executable, "-m", "pytest", "-q", contrato], backend, env={"ATUALIZAR_OPENAPI": "1"})
    rodar(
        [sys.executable, "-m", "pytest", "-q", contrato, "tests/test_versao_unica_d686.py"], backend
    )


def gravar_changelog(versao: str, anterior: str) -> str:
    arquivo = RAIZ / "CHANGELOG.md"
    bruto = arquivo.read_bytes().decode("utf-8")
    quebra = "\r\n" if "\r\n" in bruto else "\n"
    hoje = datetime.date.today().isoformat()
    novo = fechar_unreleased(bruto.replace("\r\n", "\n"), versao, hoje, anterior)
    arquivo.write_bytes(novo.replace("\n", quebra).encode("utf-8"))
    return notas_da_versao(novo, versao)


def consultar_travas(arquivos: list[str]) -> str:
    """Saída do check-lock para os arquivos. Ele sai com 1 quando ACHA trava —
    a resposta que interessa aqui —, então só um código acima de 1 é falha."""
    feito = subprocess.run(
        [sys.executable, "bin/check-lock.py", "check", *arquivos],
        cwd=RAIZ, capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=120,
    )  # fmt: skip
    if feito.returncode > 1:
        raise ErroDeRelease(f"check-lock falhou:\n{feito.stdout}{feito.stderr}")
    return feito.stdout + feito.stderr


def commitar(versao: str, resumo: str) -> str:
    marcas = marcas_de_unlock(consultar_travas(COPIAS_DA_VERSAO), versao)
    if marcas:
        print("  travas liberadas no commit:\n    " + "\n    ".join(marcas))
    mensagem = f"{assunto_do_commit(versao)}\n\n{resumo}\n"
    if marcas:
        mensagem += "\n" + "\n".join(marcas) + "\n"
    rodar(["git", "commit", "-m", mensagem, "--", *COPIAS_DA_VERSAO, "CHANGELOG.md"])
    return rodar(["git", "rev-parse", "HEAD"]).strip()


def criar_tag(versao: str, resumo: str, notas: str, sha: str = "HEAD") -> None:
    # verbatim: sem ele o git apaga as linhas "### Added" etc., que começam
    # com "#" e contam como comentário na mensagem (achado no ensaio 3).
    mensagem = f"CutCut {versao} — {resumo}\n\n{notas}"
    rodar(["git", "tag", "-a", "--cleanup=verbatim", f"v{versao}", sha, "-m", mensagem])


def imprimir_como_abrir_o_pr(versao: str, sha: str) -> None:
    ramo = ramo_da_release(versao)
    print(
        f"""
Pronto: commit {sha[:10]} na branch {ramo}, só nesta máquina. Sem tag ainda.

Próximos passos (nesta ordem):
  1. git push -u origin {ramo}
  2. gh pr create --base main --title "{assunto_do_commit(versao)}" --body "<o resumo>"
  3. pr-audit e merge por squash: --subject "<título> (#N)" --body-file com a
     mensagem do commit (o resumo é o primeiro parágrafo)
  4. .\\bin\\release.ps1 {versao} -Taguear      # tag no commit da main, com o CI verde

Desistir antes do push: apague a branch e o worktree.
"""
    )


def taguear(versao: str, resumo_informado: str | None = None) -> None:
    conferir_tag_nova(versao)
    rodar(["git", "fetch", "origin", "main"])
    log = rodar(["git", "log", "origin/main", "-200", "--format=%H%x00%s"])
    sha = sha_do_commit_da_release(log, versao)
    no_commit = rodar(["git", "show", f"{sha}:VERSION"]).strip()
    if no_commit != versao:
        raise ErroDeRelease(f"o VERSION em {sha[:10]} diz {no_commit}, não {versao}")
    runs = rodar(
        [executavel("gh"), "run", "list", "--commit", sha, "--workflow", "CI",
         "--limit", "1", "--json", "status,conclusion"]
    )  # fmt: skip
    conferir_ci_verde(runs, sha)
    resumo = resumo_informado or resumo_do_commit(
        rodar(["git", "log", "-1", "--format=%b", sha]), versao
    )
    notas = notas_da_versao(rodar(["git", "show", f"{sha}:CHANGELOG.md"]), versao)
    criar_tag(versao, resumo, notas, sha)
    print(
        f"""
Pronto: tag anotada v{versao} em {sha[:10]} (origin/main, CI verde), só nesta máquina.

Para publicar:
  1. git push origin v{versao}                  # a tag dispara o release.yml (rascunho)
  2. gh release view v{versao}                   # confira as notas e publique o rascunho

Desistir antes do push: git tag -d v{versao}
"""
    )


def preparar(versao: str, resumo: str, verificar: bool) -> None:
    conferir_arvore(versao)
    anterior = (RAIZ / "VERSION").read_text(encoding="utf-8").strip()
    changelog = (RAIZ / "CHANGELOG.md").read_text(encoding="utf-8")
    secoes = secoes_do_unreleased(changelog)
    sugerido = nivel_sugerido(secoes, anterior)
    conferir_versao_pedida(anterior, versao, sugerido)
    print(f"{anterior} → {versao} ({sugerido}; categorias: {', '.join(secoes)})")
    if verificar:
        print("--verificar: árvore e versão conferidas; nada foi alterado.")
        return
    print("Portão completo (AGENTS.md) — leva alguns minutos:")
    rodar_portao()
    print("Cópias da versão:")
    atualizar_copias(versao)
    gravar_changelog(versao, anterior)
    print("Commit:")
    imprimir_como_abrir_o_pr(versao, commitar(versao, resumo))


def main(argv: list[str] | None = None) -> int:
    # Saída redirecionada (log, CI) no Windows sai em cp1252 e o primeiro
    # acento ou seta derrubava o script; o ensaio de ponta a ponta pegou.
    for fluxo in (sys.stdout, sys.stderr):
        fluxo.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("versao", help="a nova versão, X.Y.Z")
    parser.add_argument(
        "--resumo", help="uma linha: o que a versão entrega (ao taguear, troca o do commit)"
    )
    parser.add_argument("--verificar", action="store_true", help="só confere; não altera nada")
    parser.add_argument(
        "--taguear", action="store_true", help="depois do merge: tag no commit da origin/main"
    )
    args = parser.parse_args(argv)
    if not args.taguear and not (args.resumo or "").strip():
        parser.error("--resumo é obrigatório ao preparar")
    try:
        if args.taguear:
            taguear(args.versao, (args.resumo or "").strip() or None)
        else:
            preparar(args.versao, args.resumo.strip(), args.verificar)
    except ErroDeRelease as erro:
        print(f"release recusada: {erro}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
