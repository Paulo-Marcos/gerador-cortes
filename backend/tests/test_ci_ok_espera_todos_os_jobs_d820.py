"""O job "CI ok" espera todos os outros jobs do CI (D-820).

A proteção da main exigia cada check pelo nome. Quando o Node 20 saiu da
matriz (D-781), dois nomes exigidos deixaram de existir e nenhum PR fecharia
mais: esperaria para sempre um check que nunca roda. Agora a main exige só o
"CI ok", que depende de todos os jobs. Renomear ou mudar a matriz não mexe na
proteção; o que falta lembrar é pôr um job novo na espera, e é isso que este
teste cobra.
"""

from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parents[2]
CI = RAIZ / ".github" / "workflows" / "ci.yml"
AGREGADOR = "ci-ok"


def _jobs() -> dict:
    return yaml.safe_load(CI.read_text(encoding="utf-8"))["jobs"]


def test_ci_ok_espera_todos_os_outros_jobs():
    jobs = _jobs()
    esperados = set(jobs) - {AGREGADOR}

    assert AGREGADOR in jobs, "o job agregador sumiu: a proteção da main exige o 'CI ok'"
    assert set(jobs[AGREGADOR]["needs"]) == esperados, (
        "ponha o job novo no `needs` do ci-ok, senão a main aceita PR sem ele"
    )


def test_ci_ok_roda_mesmo_quando_um_job_falha():
    # Sem `always()` o agregador é pulado quando um job falha, e check pulado
    # conta como aprovado na proteção da branch.
    assert "always()" in _jobs()[AGREGADOR]["if"]


def test_nome_do_check_exigido_nao_muda():
    assert _jobs()[AGREGADOR]["name"] == "CI ok"
