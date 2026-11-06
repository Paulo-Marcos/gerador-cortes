"""A tag da release e o detector de quebra do bin/release.py (D-1067).

Na 0.7.0 a mensagem da tag deu 76.202 caracteres: por `-m`, o Windows recusou
a linha de comando (WinError 206). E o detector contava a palavra "breaking"
solta no texto (a entrada Fixed do Pillow 13, D-982) como quebra.
"""

import importlib.util
import subprocess
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[2] / "bin" / "release.py"
_spec = importlib.util.spec_from_file_location("release", _SCRIPT)
release = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(release)

# Acima do teto do Windows (~32 mil) e do teto de UM argumento no Linux
# (MAX_ARG_STRLEN, 131.072): por `-m`, falha nos dois sistemas.
NOTAS_GRANDES = "### Added\n" + "- Coisa nova.\n" * 11_000 + "\n### Fixed\n- Outra.\n"

PILLOW = (
    "- **Pillow 13.0.0.** 13.0.0 is the only Pillow release that fixes them; its\n"
    "  breaking changes (Python 3.10 dropped, I-mode PNG) touch no code here (D-982)."
)


@pytest.fixture
def repo_temporario(tmp_path, monkeypatch):
    """Um repositório de um commit só, que vira a RAIZ do script: a tag nunca
    nasce no repositório de verdade."""
    repo = tmp_path / "repo"
    repo.mkdir()
    comum = {"cwd": repo, "check": True, "capture_output": True}
    subprocess.run(["git", "init", "-q"], **comum)
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty",
         "-m", "x"],
        **comum,
    )  # fmt: skip
    monkeypatch.setattr(release, "RAIZ", repo)
    monkeypatch.setenv("GIT_COMMITTER_NAME", "t")
    monkeypatch.setenv("GIT_COMMITTER_EMAIL", "t@t")
    return repo


def _mensagem_da_tag(repo: Path, tag: str) -> str:
    return subprocess.run(
        ["git", "tag", "-l", tag, "--format=%(contents)"],
        cwd=repo, check=True, capture_output=True, text=True, encoding="utf-8",
    ).stdout  # fmt: skip


def test_tag_com_mensagem_acima_do_teto_da_linha_de_comando(repo_temporario):
    assert len(NOTAS_GRANDES) > 131_072

    release.criar_tag("9.9.9", "resumo", NOTAS_GRANDES)

    mensagem = _mensagem_da_tag(repo_temporario, "v9.9.9")
    assert mensagem.startswith("CutCut 9.9.9 — resumo\n\n### Added\n")
    assert "\n### Fixed\n- Outra.\n" in mensagem
    assert mensagem.count("- Coisa nova.") == 11_000


def test_tag_guarda_a_mensagem_sem_mudar_um_caractere(repo_temporario):
    # O que o `-m` gravava: título, linha em branco, notas. Com `-F` e
    # verbatim, nem o "#" dos títulos nem os espaços somem.
    notas = "### Added\n- **Negrito.** Texto com acento: ação.\n\n### Fixed\n  - recuada.  "
    release.criar_tag("9.9.8", "o resumo", notas)

    esperado = f"CutCut 9.9.8 — o resumo\n\n{notas}"
    assert _mensagem_da_tag(repo_temporario, "v9.9.8").rstrip("\n") == esperado.rstrip("\n")


def test_arquivo_da_mensagem_e_apagado_ao_final(repo_temporario, tmp_path, monkeypatch):
    temporarios = tmp_path / "temporarios"
    temporarios.mkdir()
    monkeypatch.setattr(release.tempfile, "tempdir", str(temporarios))

    release.criar_tag("9.9.7", "resumo", "### Added\n- Coisa.")

    assert list(temporarios.iterdir()) == []


def test_arquivo_da_mensagem_e_apagado_quando_o_git_falha(repo_temporario, tmp_path, monkeypatch):
    temporarios = tmp_path / "temporarios"
    temporarios.mkdir()
    monkeypatch.setattr(release.tempfile, "tempdir", str(temporarios))

    with pytest.raises(release.ErroDeRelease):
        release.criar_tag("9.9.6", "resumo", "### Added\n- Coisa.", sha="nao-existe")

    assert list(temporarios.iterdir()) == []


def test_log_da_tag_nao_despeja_a_mensagem(repo_temporario, capsys):
    release.criar_tag("9.9.5", "resumo", NOTAS_GRANDES)

    saida = capsys.readouterr().out
    assert "Coisa nova" not in saida
    assert len(saida) < 500


def test_rodar_encurta_argumento_longo_no_log(repo_temporario, capsys):
    longo = "x" * 5_000
    release.rodar(["git", "-c", f"cutcut.teste={longo}", "status", "--short"])

    saida = capsys.readouterr().out
    assert "git -c" in saida and "status --short" in saida
    assert longo not in saida
    assert len(saida) < 500


@pytest.mark.parametrize("atual", ["1.2.0", "2.0.3"])
def test_breaking_solto_num_fixed_sugere_patch(atual):
    assert release.nivel_sugerido({"Fixed": PILLOW}, atual) == "patch"


@pytest.mark.parametrize(
    "texto",
    [
        "- BREAKING: a palavra em maiúsculas, sem a marca.",
        "- Breaking change: no meio da frase.",
        "- **breaking** em minúsculas.",
    ],
)
def test_so_a_marca_exata_conta_como_quebra(texto):
    assert release.nivel_sugerido({"Fixed": texto}, "1.2.0") == "patch"


@pytest.mark.parametrize("categoria", ["Fixed", "Changed", "Removed"])
def test_marca_breaking_sugere_major_a_partir_da_1_0(categoria):
    secoes = {categoria: "- **BREAKING** A rota antiga sai (D-1)."}
    assert release.nivel_sugerido(secoes, "1.2.0") == "major"


def test_marca_breaking_antes_da_1_0_sugere_minor():
    secoes = {"Fixed": "- **BREAKING** A rota antiga sai (D-1)."}
    assert release.nivel_sugerido(secoes, "0.7.0") == "minor"
