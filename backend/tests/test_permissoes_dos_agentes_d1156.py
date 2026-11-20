"""A deny list dos agentes protege a PROD e a árvore principal, não os worktrees (D-1156).

A D-770 negava `Read/Edit(**/*.db)`. Padrão sem prefixo é relativo ao diretório
da sessão: numa sessão de worktree ele só cobria o próprio worktree. Lá ele
impedia apagar as cópias do banco da PROD deixadas para as capturas, e a PROD
nunca esteve coberta. Medido em 20/11/2026 com `claude -p --settings` numa
árvore espelho.

Decisão do Paulo, 20/11: "Eu autorizo apenas para worktrees. Jamais para meus
projetos em produção se eu não autorizar." Então a PROD e a árvore principal são
negadas por caminho absoluto, que vale de qualquer sessão. Na árvore principal,
o banco fica negado onde o `**/*.db` antigo o negava numa sessão aberta nela: na
raiz, em cada pasta de primeiro nível e em `.claude`. Ficam livres só os `.db` de
`.claude/worktrees`. O `*.db*` pega também o `-wal` e o `-shm` do SQLite: o
`-wal` guarda as escritas ainda não consolidadas no banco.

Uma regra só para a árvore inteira, menos os worktrees, não existe no motor. A
negação `!` não abre exceção no deny, e a classe `[!.]` do gitignore não casa
como no git: na medição, ela deixou `capturas` e `backend` livres e barrou os
worktrees. Por isso cada pasta tem a sua trava, e um teste exige trava para toda
pasta rastreada e para as ignoradas conhecidas.

Os segredos ganharam a forma absoluta `//**/`, que vale em qualquer disco, e
mantêm a relativa. Sem ela, o `backend/.env` da árvore principal ficava legível
numa sessão de worktree.

Sintaxe do Claude Code: `//` é a raiz do disco, e o Windows normaliza
`C:\\PRD` para `/c/PRD`. A forma `//C:/PRD` não casa com nada: na medição, ela
deixou passar a leitura.
"""

import json
import re
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
ARVORE_PRINCIPAL = "//c/DEV/gerador-cortes/"

TRAVAS_ABSOLUTAS = (
    "//c/PRD/**",
    "//c/DEV/gerador-cortes/*.db*",
    "//c/DEV/gerador-cortes/instance/**",
    "//c/DEV/gerador-cortes/.claude/*.db*",
)
# Pastas que o git ignora e que existem na árvore principal. Nenhuma está no
# `git ls-files`; `.tmp`, `.guia/tmp` e `scratch` recebem cópias dos agentes.
PASTAS_IGNORADAS = (
    ".git",
    ".pytest_cache",
    ".ruff_cache",
    ".tmp",
    "capturas",
    "logs",
    "n8n-workflows",
    "node_modules",
    "scratch",
)
SEGREDOS_EM_QUALQUER_DISCO = (
    "//**/.env",
    "//**/token.json",
    "//**/client_secrets.json",
)
TRAVAS_DE_SEGREDO = (
    "Read(**/.env)",
    "Edit(**/.env)",
    "Read(**/token.json)",
    "Edit(**/token.json)",
    "Read(**/client_secrets.json)",
    "Edit(**/client_secrets.json)",
    "Read(~/.ssh/**)",
    "Read(~/.aws/**)",
)


def _negadas() -> list[str]:
    texto = (RAIZ / ".claude" / "settings.json").read_text(encoding="utf-8")
    return json.loads(texto)["permissions"]["deny"]


def _alvo(regra: str) -> str:
    return regra[regra.index("(") + 1 : -1]


def _pastas_rastreadas() -> set[str]:
    saida = subprocess.run(
        ["git", "ls-files"], cwd=RAIZ, capture_output=True, text=True, check=True, timeout=60
    ).stdout
    caminhos = [linha.split("/") for linha in saida.splitlines() if "/" in linha]
    primeiro_nivel = {partes[0] for partes in caminhos} - {".claude", "instance"}
    dentro_do_claude = {
        f".claude/{partes[1]}"
        for partes in caminhos
        if partes[0] == ".claude" and len(partes) > 2 and partes[1] != "worktrees"
    }
    return primeiro_nivel | dentro_do_claude


def test_toda_pasta_da_arvore_principal_tem_trava_de_banco():
    negadas = _negadas()
    pastas = _pastas_rastreadas() | set(PASTAS_IGNORADAS)

    sem_trava = sorted(
        pasta
        for pasta in pastas
        if not all(
            f"{ferramenta}({ARVORE_PRINCIPAL}{pasta}/**/*.db*)" in negadas
            for ferramenta in ("Read", "Edit")
        )
    )

    assert not sem_trava, f"pasta da árvore principal sem trava de banco: {sem_trava}"


def test_a_prod_e_a_arvore_principal_seguem_negadas_por_caminho_absoluto():
    negadas = _negadas()

    faltando = [
        f"{ferramenta}({caminho})"
        for caminho in TRAVAS_ABSOLUTAS
        for ferramenta in ("Read", "Edit")
        if f"{ferramenta}({caminho})" not in negadas
    ]

    assert not faltando, f"travas absolutas ausentes: {faltando}"


def test_o_padrao_geral_de_banco_saiu():
    relativas_de_banco = [
        r for r in _negadas() if ".db" in _alvo(r) and not _alvo(r).startswith("//")
    ]

    assert not relativas_de_banco, f"padrão relativo de banco ainda negado: {relativas_de_banco}"


def _alcanca_os_worktrees(resto: str) -> bool:
    return resto.split("/")[0] in ("**", "*") or resto.startswith(
        (".claude/**", ".claude/*/", ".claude/worktrees")
    )


def test_os_worktrees_nao_sao_negados_por_uma_trava_da_arvore_inteira():
    # Uma trava como //c/DEV/gerador-cortes/** casaria também com
    # .claude/worktrees/**, e deny não aceita exceção vinda de allow.
    largas = [
        regra
        for regra in _negadas()
        if _alvo(regra).startswith(ARVORE_PRINCIPAL)
        and _alcanca_os_worktrees(_alvo(regra)[len(ARVORE_PRINCIPAL) :])
    ]

    assert not largas, f"trava cobre os worktrees: {largas}"


def _casa(padrao_absoluto: str, caminho: str) -> bool:
    # Modelo mínimo do match do harness para padrões `//`: gitignore, sem
    # diferença de caixa, o caminho na forma /c/... Confirmado pela sonda.
    regex = re.escape(padrao_absoluto[1:])
    regex = regex.replace(r"\*\*/", "(?:.*/)?").replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
    return re.fullmatch(regex, caminho, re.IGNORECASE) is not None


def _negado(caminho: str) -> bool:
    absolutas = [_alvo(r) for r in _negadas() if r.startswith("Read(//")]
    return any(_casa(padrao, caminho) for padrao in absolutas)


@pytest.mark.parametrize(
    "caminho",
    [
        "/c/PRD/gerador-cortes/instance/settings.db",
        "/c/PRD/gerador-cortes/backend/app/main.py",
        "/c/DEV/gerador-cortes/instance/channels/seucanal/projetos/projetos.db",
        "/c/DEV/gerador-cortes/backend/projetos/projetos.db",
        "/c/DEV/gerador-cortes/backend/projetos/projetos.db-wal",
        "/c/DEV/gerador-cortes/.guia/tmp/D-1065/main/instance/settings.db",
        "/c/DEV/gerador-cortes/scratch/backup-d386-instance/settings.db",
        "/c/DEV/gerador-cortes/projetos.db",
        "/c/DEV/gerador-cortes/.tmp/cenas-d916/settings.db",
        "/c/DEV/gerador-cortes/capturas/v3/settings.db",
        "/c/DEV/gerador-cortes/logs/x.db-wal",
        "/c/DEV/gerador-cortes/frontend/x.db",
        "/c/DEV/gerador-cortes/.claude/copia.db",
        "/c/DEV/gerador-cortes/.claude/rules/x.db",
        "/c/DEV/gerador-cortes/backend/.env",
        "/c/DEV/gerador-cortes/backend/client_secrets.json",
        "/d/outro/token.json",
    ],
)
def test_a_prod_a_arvore_principal_e_os_segredos_ficam_barrados(caminho):
    assert _negado(caminho)


@pytest.mark.parametrize(
    "caminho",
    [
        "/c/DEV/gerador-cortes/.claude/worktrees/wt/instance/settings.db",
        "/c/DEV/gerador-cortes/.claude/worktrees/wt/backend/projetos/projetos.db-wal",
        "/c/DEV/gerador-cortes/.claude/worktrees/wt/.guia/tmp/D-1148/instance/settings.db",
        "/c/DEV/gerador-cortes/.claude/worktrees/wt/projetos.db",
        "/c/DEV/gerador-cortes/backend/app/main.py",
        "/c/DEV/gerador-cortes/backend/.env.example",
    ],
)
def test_as_copias_nos_worktrees_e_o_codigo_ficam_livres(caminho):
    assert not _negado(caminho)


def test_caminho_absoluto_usa_a_forma_posix_do_disco():
    com_dois_pontos = [r for r in _negadas() if _alvo(r).startswith("//") and ":" in _alvo(r)]

    assert not com_dois_pontos, f"forma //C:/ não casa com nada: {com_dois_pontos}"


def test_os_segredos_sao_negados_em_qualquer_disco():
    negadas = _negadas()

    faltando = [
        f"{ferramenta}({caminho})"
        for caminho in SEGREDOS_EM_QUALQUER_DISCO
        for ferramenta in ("Read", "Edit")
        if f"{ferramenta}({caminho})" not in negadas
    ]

    assert not faltando, f"segredos sem a forma absoluta: {faltando}"


def test_as_travas_de_segredo_continuam():
    negadas = _negadas()

    faltando = [regra for regra in TRAVAS_DE_SEGREDO if regra not in negadas]

    assert not faltando, f"travas de segredo ausentes: {faltando}"
