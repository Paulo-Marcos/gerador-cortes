"""A deny list dos agentes protege a PROD e a árvore principal, não os worktrees (D-1156).

A D-770 negava `Read/Edit(**/*.db)`. Padrão sem prefixo é relativo ao diretório
da sessão: numa sessão de worktree ele só cobria o próprio worktree. Lá ele
impedia apagar as cópias do banco da PROD deixadas para as capturas, e a PROD
nunca esteve coberta. Medido em 20/11/2026 com `claude -p --settings` numa
árvore espelho.

Decisão do Paulo, 20/11: "Eu autorizo apenas para worktrees. Jamais para meus
projetos em produção se eu não autorizar." Então a PROD e a árvore principal são
negadas por caminho absoluto, que vale de qualquer sessão. A árvore principal
inclui as pastas com banco que o `**/*.db` antigo negava numa sessão aberta nela:
`backend`, `.guia` e `scratch`. Os `.db` de `.claude/worktrees` ficam livres.
O `*.db*` pega também o `-wal` e o `-shm` do SQLite: o `-wal` guarda as escritas
ainda não consolidadas no banco.

Os segredos ganharam a forma absoluta `//**/`, que vale em qualquer disco, e
mantêm a relativa. Sem ela, o `backend/.env` da árvore principal ficava legível
numa sessão de worktree.

Sintaxe do Claude Code: `//` é a raiz do disco, e o Windows normaliza
`C:\\PRD` para `/c/PRD`. A forma `//C:/PRD` não casa com nada: na medição, ela
deixou passar a leitura. A negação `!` não abre exceção dentro do deny, por isso
as pastas da árvore principal são listadas uma a uma.
"""

import json
import re
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
ARVORE_PRINCIPAL = "//c/DEV/gerador-cortes/"

TRAVAS_ABSOLUTAS = (
    "//c/PRD/**",
    "//c/DEV/gerador-cortes/instance/**",
    "//c/DEV/gerador-cortes/backend/**/*.db*",
    "//c/DEV/gerador-cortes/.guia/**/*.db*",
    "//c/DEV/gerador-cortes/scratch/**/*.db*",
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


def test_os_worktrees_nao_sao_negados_por_uma_trava_da_arvore_inteira():
    # Uma trava como //c/DEV/gerador-cortes/** casaria também com
    # .claude/worktrees/**, e deny não aceita exceção vinda de allow.
    largas = [
        regra
        for regra in _negadas()
        if _alvo(regra).startswith(ARVORE_PRINCIPAL)
        and _alvo(regra)[len(ARVORE_PRINCIPAL) :].split("/")[0] in ("**", "*", ".claude")
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
