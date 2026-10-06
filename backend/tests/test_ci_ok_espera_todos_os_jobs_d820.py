"""O job "CI ok" espera todos os outros jobs do CI (D-820).

A proteção da main exigia cada check pelo nome. Quando o Node 20 saiu da
matriz (D-781), dois nomes exigidos deixaram de existir e nenhum PR fecharia
mais: esperaria para sempre um check que nunca roda. Agora a main exige só o
"CI ok", que depende de todos os jobs. Renomear ou mudar a matriz não mexe na
proteção; o que falta lembrar é pôr um job novo na espera, e é isso que este
teste cobra.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
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


# D-881: na run 37366735893 (PR #131, tentativa 1) o GitHub cancelou quatro
# jobs sem rodar um passo ("not acquired by Runner") e o "CI ok" ficou verde.
# O passo que reprovava tinha `if` sem função de status: ganhou um `success()`
# implícito, que deu falso, e foi pulado. Cancelar a run à mão não repete isso
# (o passo rodou e reprovou); o `always()` tira o success() da conta em
# qualquer caso. Agora o passo roda sempre e só aprova quando todos os jobs do
# `needs` terminaram em success.
NEEDS_DA_RUN_37366735893 = {
    "secret-scan": "cancelled",
    "backend": "success",
    "frontend": "success",
    "video-renderer": "cancelled",
    "windows": "cancelled",
}


def _passo_que_julga() -> dict:
    (passo,) = _jobs()[AGREGADOR]["steps"]
    return passo


def _julgar(resultados: dict[str, str]) -> int:
    passo = _passo_que_julga()
    needs = {job: {"result": resultado, "outputs": {}} for job, resultado in resultados.items()}
    env = {**os.environ, "NEEDS": json.dumps(needs)}
    feito = subprocess.run(
        [sys.executable, "-c", passo["run"]], env=env, capture_output=True, timeout=30
    )
    return feito.returncode


def test_passo_que_julga_nao_depende_do_success_implicito():
    passo = _passo_que_julga()
    assert passo["if"] == "always()", "sem função de status o passo herda success() e é pulado"
    assert passo["shell"] == "python"
    assert passo["env"]["NEEDS"] == "${{ toJSON(needs) }}"


def test_aprova_com_todos_os_jobs_em_success():
    assert _julgar(dict.fromkeys(NEEDS_DA_RUN_37366735893, "success")) == 0


@pytest.mark.parametrize("resultado", ["cancelled", "skipped", "failure"])
def test_reprova_com_um_job_que_nao_terminou_em_success(resultado):
    resultados = dict.fromkeys(NEEDS_DA_RUN_37366735893, "success")
    resultados["windows"] = resultado
    assert _julgar(resultados) == 1


def test_reprova_a_run_que_ficou_verde_sem_ci():
    assert _julgar(NEEDS_DA_RUN_37366735893) == 1


def test_reprova_sem_job_nenhum_para_julgar():
    assert _julgar({}) == 1
