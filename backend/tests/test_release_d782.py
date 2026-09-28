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

    release.criar_tag("0.5.0", "resumo", "### Added\n- Coisa.\n\n### Fixed\n- Outra.")

    mensagem = release.subprocess.run(
        ["git", "tag", "-l", "v0.5.0", "--format=%(contents)"], text=True, **comum
    ).stdout
    assert "### Added" in mensagem and "### Fixed" in mensagem
    real = Path(release.__file__).resolve().parents[1]
    tags_reais = release.subprocess.run(
        ["git", "tag", "-l", "v0.5.0"], cwd=real, capture_output=True, text=True, check=True
    ).stdout
    assert tags_reais == "", "o teste criou a tag no repositório de verdade"


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
