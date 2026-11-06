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


def _temporarios(tmp_path: Path) -> Path:
    pasta = tmp_path / "temporarios"
    pasta.mkdir(exist_ok=True)
    return pasta


@pytest.fixture
def repo_temporario(tmp_path, monkeypatch):
    """Um repositório de um commit só, que vira a RAIZ do script: a tag nunca
    nasce no repositório de verdade. E o arquivo da mensagem nasce no
    `tmp_path`: se um dia ele não for apagado, não sobra no %TEMP% real."""
    monkeypatch.setattr(release.tempfile, "tempdir", str(_temporarios(tmp_path)))
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


def test_tag_guarda_a_mensagem_sem_mudar_um_byte(repo_temporario):
    # O que o `-m` gravava: título, linha em branco, notas. Com `-F` e
    # verbatim, nem o "#" dos títulos nem os espaços somem, e o arquivo no
    # Windows não troca o "\n" por "\r\n". Lido em bytes, do objeto da tag.
    notas = "### Added\n- **Negrito.** Texto com acento: ação.\n\n### Fixed\n  - recuada.  "
    release.criar_tag("9.9.8", "o resumo", notas)

    objeto = subprocess.run(
        ["git", "cat-file", "tag", "v9.9.8"], cwd=repo_temporario, check=True, capture_output=True
    ).stdout
    _cabecalho, mensagem = objeto.split(b"\n\n", 1)
    assert mensagem == f"CutCut 9.9.8 — o resumo\n\n{notas}".encode()


def test_arquivo_da_mensagem_e_apagado_ao_final(repo_temporario, tmp_path):
    release.criar_tag("9.9.7", "resumo", "### Added\n- Coisa.")

    assert list(_temporarios(tmp_path).iterdir()) == []


def test_arquivo_da_mensagem_e_apagado_quando_o_git_falha(repo_temporario, tmp_path):
    with pytest.raises(release.ErroDeRelease, match="falhou: git tag"):
        release.criar_tag("9.9.6", "resumo", "### Added\n- Coisa.", sha="nao-existe")

    assert list(_temporarios(tmp_path).iterdir()) == []


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
        "- Breaking change: no meio da frase.",
        "- **breaking** em minúsculas.",
        "- A palavra BREAKING: no meio, sem abrir a entrada.",
    ],
)
def test_so_a_marca_abrindo_a_entrada_conta_como_quebra(texto):
    assert release.nivel_sugerido({"Fixed": texto}, "1.2.0") == "patch"


@pytest.mark.parametrize("atual", ["0.7.0", "1.2.0"])
def test_a_entrada_que_cita_a_marca_continua_patch(atual):
    # A entrada da própria D-1067 cita a marca para ensiná-la: não é quebra
    # (achado da auditoria do #336, que sugeria minor e recusava a 0.7.1).
    fragmento = (
        "- **Tagging a release no longer breaks on long release notes.** A\n"
        "  breaking change is now declared only by opening the entry with the\n"
        "  `**BREAKING**` (or `BREAKING:`) marker: the word elsewhere in an entry,\n"
        "  as in the Pillow 13 fix (D-982), no longer counts (D-1067)."
    )
    assert release.nivel_sugerido({"Fixed": fragmento}, atual) == "patch"


@pytest.mark.parametrize("categoria", ["Fixed", "Changed", "Removed"])
@pytest.mark.parametrize(
    "entrada",
    [
        "- **BREAKING** A rota antiga sai (D-1).",
        "- BREAKING: a rota antiga sai (D-1).",
        "- Conserto.\n- **BREAKING** A rota antiga sai (D-1).",
        "* **BREAKING** A rota antiga sai (D-1).",
    ],
)
def test_marca_breaking_sugere_major_a_partir_da_1_0(categoria, entrada):
    assert release.nivel_sugerido({categoria: entrada}, "1.2.0") == "major"


def test_marca_breaking_antes_da_1_0_sugere_minor():
    secoes = {"Fixed": "- **BREAKING** A rota antiga sai (D-1)."}
    assert release.nivel_sugerido(secoes, "0.7.0") == "minor"
