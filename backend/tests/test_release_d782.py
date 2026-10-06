"""As regras do bin/release.py que decidem o número e o texto da release (D-782).

Os efeitos (git, npm, portão) não entram aqui: o que se testa é o que, se
errar, publica uma versão com o número ou as notas erradas.
"""

import importlib.util
import io
import sys
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[2] / "bin" / "release.py"
_spec = importlib.util.spec_from_file_location("release", _SCRIPT)
release = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(release)

CHANGELOG = """# Changelog

## [Unreleased]

### Added
- **Portão novo.** Algo (D-1).

### Fixed
- **Conserto.** Algo (D-2).

## [0.4.0] - 2026-09-27

### Added
- Coisa antiga.

[Unreleased]: https://github.com/dono/repo/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/dono/repo/compare/v0.3.0...v0.4.0
"""


def test_secoes_do_unreleased_so_as_que_tem_conteudo():
    texto = CHANGELOG.replace("### Fixed\n- **Conserto.** Algo (D-2).\n", "### Fixed\n\n")

    assert list(release.secoes_do_unreleased(texto)) == ["Added"]


@pytest.mark.parametrize(
    ("categorias", "atual", "esperado"),
    [
        ({"Fixed": "x"}, "0.4.0", "patch"),
        ({"Fixed": "x", "Security": "y"}, "0.4.0", "patch"),
        ({"Added": "x", "Fixed": "y"}, "0.4.0", "minor"),
        ({"Removed": "x"}, "0.4.0", "minor"),
        ({"Changed": "**BREAKING** x"}, "0.4.0", "minor"),  # antes da 1.0
        ({"Changed": "**BREAKING** x"}, "1.2.0", "major"),
    ],
)
def test_nivel_sugerido_pelas_categorias(categorias, atual, esperado):
    assert release.nivel_sugerido(categorias, atual) == esperado


def test_unreleased_vazio_recusa_a_release():
    with pytest.raises(release.ErroDeRelease, match="vazio"):
        release.nivel_sugerido({}, "0.4.0")


def test_versao_menor_que_a_sugerida_e_recusada():
    with pytest.raises(release.ErroDeRelease, match="use 0.5.0"):
        release.conferir_versao_pedida("0.4.0", "0.4.1", "minor")


def test_versao_que_pula_numero_e_recusada():
    with pytest.raises(release.ErroDeRelease, match="não sucede"):
        release.conferir_versao_pedida("0.4.0", "0.6.0", "minor")


def test_versao_maior_que_a_sugerida_e_aceita():
    release.conferir_versao_pedida("0.4.0", "1.0.0", "minor")


def test_formato_invalido_e_recusado():
    with pytest.raises(release.ErroDeRelease, match="X.Y.Z"):
        release.ler_semver("v0.5")


def test_fechar_unreleased_abre_a_versao_e_acerta_os_links():
    novo = release.fechar_unreleased(CHANGELOG, "0.5.0", "2026-09-28", "0.4.0")

    assert "## [Unreleased]\n\n## [0.5.0] - 2026-09-28\n\n### Added\n- **Portão novo." in novo
    assert "[Unreleased]: https://github.com/dono/repo/compare/v0.5.0...HEAD\n" in novo
    assert "[0.5.0]: https://github.com/dono/repo/compare/v0.4.0...v0.5.0\n" in novo
    assert "[0.4.0]: https://github.com/dono/repo/compare/v0.3.0...v0.4.0" in novo
    assert release.secoes_do_unreleased(novo) == {}


def test_notas_da_versao_param_na_proxima_versao():
    novo = release.fechar_unreleased(CHANGELOG, "0.5.0", "2026-09-28", "0.4.0")

    notas = release.notas_da_versao(novo, "0.5.0")

    assert notas.startswith("### Added") and "Conserto" in notas
    assert "Coisa antiga" not in notas and "compare" not in notas


def test_saida_redirecionada_em_cp1252_nao_derruba_o_script(monkeypatch):
    # Achado no ensaio de ponta a ponta: com a saída num arquivo, o Python do
    # Windows escreve em cp1252 e a seta de "0.4.0 → 0.5.0" derrubava a release.
    bruto = io.BytesIO()
    monkeypatch.setattr(sys, "stdout", io.TextIOWrapper(bruto, encoding="cp1252"))
    monkeypatch.setattr(release, "preparar", lambda *_: print("0.4.0 → 0.5.0"))

    assert release.main(["0.5.0", "--resumo", "x"]) == 0
    sys.stdout.flush()
    assert "→".encode() in bruto.getvalue()


def test_consultar_travas_aceita_o_codigo_1_do_check_lock(monkeypatch):
    # Achado no ensaio 2: o check-lock sai com 1 justamente quando acha trava,
    # e a release caía no último passo em vez de gerar a marca de unlock.
    saida = "  [unlock:remotion-v2-card-contracts] motivo: <razao>\n"

    def check_lock_com_trava(*_args, **_kwargs):
        return release.subprocess.CompletedProcess([], 1, stdout=saida, stderr="")

    monkeypatch.setattr(release.subprocess, "run", check_lock_com_trava)

    assert release.consultar_travas(["video-renderer/package.json"]) == saida


def test_tag_anotada_guarda_os_titulos_das_categorias(tmp_path, monkeypatch):
    # Achado no ensaio 3: o git apaga linha que começa com "#" da mensagem
    # (trata como comentário), e a tag perdia "### Added", "### Fixed"...
    # Versão que nunca vai existir: a v0.5.0 do teste original foi publicada.
    comum = {"cwd": tmp_path, "check": True, "capture_output": True}
    release.subprocess.run(["git", "init", "-q"], **comum)
    release.subprocess.run(
        [
            "git",
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "commit",
            "-q",
            "--allow-empty",
            "-m",
            "x",
        ],
        **comum,
    )
    monkeypatch.setattr(release, "RAIZ", tmp_path)
    monkeypatch.setenv("GIT_COMMITTER_NAME", "t")
    monkeypatch.setenv("GIT_COMMITTER_EMAIL", "t@t")

    release.criar_tag("9.9.9", "resumo", "### Added\n- Coisa.\n\n### Fixed\n- Outra.")

    mensagem = release.subprocess.run(
        ["git", "tag", "-l", "v9.9.9", "--format=%(contents)"], text=True, **comum
    ).stdout
    assert "### Added" in mensagem and "### Fixed" in mensagem
    real = Path(release.__file__).resolve().parents[1]
    tags_reais = release.subprocess.run(
        ["git", "tag", "-l", "v9.9.9"], cwd=real, capture_output=True, text=True, check=True
    ).stdout
    assert tags_reais == "", "o teste criou a tag no repositório de verdade"


def test_preparar_so_na_branch_da_release():
    # D-823: a main só recebe PR; a versão sobe numa branch e entra pelo PR.
    release.conferir_ramo("release-v0.6.0", "0.6.0")
    for ramo in ("main", "release-v0.5.0", "d-900-outra"):
        with pytest.raises(release.ErroDeRelease, match="release-v0.6.0"):
            release.conferir_ramo(ramo, "0.6.0")


def test_commit_da_release_e_achado_pelo_assunto_na_main():
    # Depois do squash o SHA é outro; o que identifica o commit é o assunto,
    # que o merge preserva. Outros PRs podem ter entrado depois dele.
    log = (
        "c3\x00✨ feat(D-900): algo que entrou depois\n"
        f"b2\x00{release.assunto_do_commit('0.6.0')}\n"
        f"a1\x00{release.assunto_do_commit('0.5.0')}\n"
    )

    assert release.sha_do_commit_da_release(log, "0.6.0") == "b2"
    with pytest.raises(release.ErroDeRelease, match="PR da release"):
        release.sha_do_commit_da_release(log, "0.7.0")


def test_commit_da_release_e_achado_com_o_numero_do_pr_do_squash():
    # D-891: o squash do GitHub põe " (#N)" no fim do assunto (57 de 57 merges
    # desde a v0.5.0); sem aceitar o sufixo, o -Taguear recusava a release.
    log = (
        "c3\x00✨ feat(D-900): algo que entrou depois (#151)\n"
        f"b2\x00{release.assunto_do_commit('0.6.0')} (#150)\n"
    )

    assert release.sha_do_commit_da_release(log, "0.6.0") == "b2"


@pytest.mark.parametrize(
    "sufixo",
    ["(#150)", " (#150) extra", " (#)", " (#15a)", " #150", ".1 (#150)", "0 (#150)"],
)
def test_assunto_parecido_com_o_da_release_nao_e_aceito(sufixo):
    log = f"b2\x00{release.assunto_do_commit('0.6.0')}{sufixo}\n"

    with pytest.raises(release.ErroDeRelease, match="PR da release"):
        release.sha_do_commit_da_release(log, "0.6.0")


def test_resumo_da_tag_sai_do_corpo_do_commit():
    corpo = "o que a versão entrega\n\n[unlock:x] motivo: y\n\nCo-Authored-By: z\n"

    assert release.resumo_do_commit(corpo, "0.6.0") == "o que a versão entrega"


def test_resumo_pula_a_bala_do_corpo_padrao_do_squash():
    # D-891: com mais de um commit no PR, o corpo padrão do squash lista cada
    # commit como "* <assunto>\n\n<corpo>"; o resumo é o corpo do da release.
    corpo = (
        f"* {release.assunto_do_commit('0.6.0')}\n\n"
        "o que a versão entrega\n\n[unlock:x] motivo: y\n\n"
        "* 🐛 fix(D-900): acertar o CHANGELOG\n\nCo-authored-by: z\n"
    )

    assert release.resumo_do_commit(corpo, "0.6.0") == "o que a versão entrega"


@pytest.mark.parametrize(
    "corpo",
    [
        "",
        "[unlock:x] motivo: y\n\nCo-Authored-By: z\n",
        "Co-authored-by: z\n",
        "* 🐛 fix(D-900): outro commit\n\no corpo dele\n",
    ],
)
def test_corpo_sem_resumo_recusa_a_tag_e_ensina_o_resumo(corpo):
    with pytest.raises(release.ErroDeRelease, match="-Resumo"):
        release.resumo_do_commit(corpo, "0.6.0")


def test_resumo_informado_ao_taguear_vence_o_do_commit(monkeypatch):
    chamadas = []
    monkeypatch.setattr(release, "taguear", lambda *args: chamadas.append(args))

    assert release.main(["0.6.0", "--taguear", "--resumo", " o que entrega "]) == 0
    assert release.main(["0.6.0", "--taguear"]) == 0
    assert chamadas == [("0.6.0", "o que entrega"), ("0.6.0", None)]


@pytest.mark.parametrize(
    ("runs", "erro"),
    [
        ('[{"status": "completed", "conclusion": "success"}]', None),
        ("[]", "ainda não rodou"),
        ('[{"status": "in_progress", "conclusion": ""}]', "ainda roda"),
        ('[{"status": "completed", "conclusion": "failure"}]', "failure"),
    ],
)
def test_tag_so_com_o_ci_verde_no_sha(runs, erro):
    if erro is None:
        release.conferir_ci_verde(runs, "b2")
        return
    with pytest.raises(release.ErroDeRelease, match=erro):
        release.conferir_ci_verde(runs, "b2")


def test_marcas_de_unlock_uma_por_trava_com_motivo():
    saida = (
        "  [unlock:remotion-v2-card-contracts] motivo: <razao>\n"
        "  [unlock:remotion-v2-card-contracts] motivo: <razao>\n"
    )

    marcas = release.marcas_de_unlock(saida, "0.5.0")

    assert marcas == [
        "[unlock:remotion-v2-card-contracts] motivo: "
        "só o campo version sobe para 0.5.0 (release, bin/release.py)"
    ]
    assert release.marcas_de_unlock("OK: nenhum travado.", "0.5.0") == []
