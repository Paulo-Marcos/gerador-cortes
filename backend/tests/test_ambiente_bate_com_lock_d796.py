"""O ambiente que roda os testes tem as versões do lock (D-796).

`requirements.in` é a intenção (as dependências diretas); `requirements.txt` é
o lock gerado dele — a árvore inteira, com versão exata e hash. Sem este
teste, um `.venv` que não foi reinstalado depois de uma mudança no lock segue
passando os testes com outras versões, e o que se mede nele não vale para o
CI: foi assim que a lista do pyright nasceu errada (D-795).

Confere, para cada pacote do lock que vale nesta plataforma e neste Python, a
versão instalada. A diarização (opcional, D-819) tem lock próprio, que só vale
quando ela está instalada. Para sincronizar: `bin\\bootstrap.ps1 -Dev`
(e `-Diarizacao`, se for o caso).
"""

import re
from importlib import metadata
from pathlib import Path

from packaging.markers import Marker

BACKEND = Path(__file__).resolve().parents[1]
LOCKS = ("requirements.txt", "requirements-dev.txt")
LOCK_DA_DIARIZACAO = "requirements-diarizacao.txt"
LINHA = re.compile(
    r"^(?P<nome>[A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?==(?P<versao>[^\s;\\]+)\s*(?:;\s*(?P<marcador>[^\\]+?))?\s*\\?$"
)


def _normalizar(nome: str) -> str:
    return re.sub(r"[-_.]+", "-", nome).lower()


def _fixados(texto: str) -> dict[str, str]:
    """Nome normalizado → versão, só dos pacotes que valem aqui."""
    fixados = {}
    for linha in texto.splitlines():
        achado = LINHA.match(linha)
        if not achado:
            continue
        marcador = achado["marcador"]
        if marcador and not Marker(marcador).evaluate():
            continue
        fixados[_normalizar(achado["nome"])] = achado["versao"]
    return fixados


def _instalados() -> dict[str, str]:
    return {_normalizar(d.metadata["Name"]): d.version for d in metadata.distributions()}


def _locks_do_ambiente(instalados: dict[str, str]) -> tuple[str, ...]:
    if "pyannote-audio" in instalados:
        return (*LOCKS, LOCK_DA_DIARIZACAO)
    return LOCKS


def test_o_ambiente_tem_as_versoes_do_lock():
    instalados = _instalados()
    divergentes = {}
    for lock in _locks_do_ambiente(instalados):
        for nome, versao in _fixados((BACKEND / lock).read_text(encoding="utf-8")).items():
            if instalados.get(nome) != versao:
                divergentes[nome] = f"lock {versao}, instalado {instalados.get(nome, 'nada')}"

    assert not divergentes, (
        f"O ambiente não bate com o lock — rode bin\\bootstrap.ps1 -Dev: {divergentes}"
    )


def test_com_a_diarizacao_instalada_o_lock_dela_tambem_vale():
    # D-819: instalada solta, ela trazia versões que brigavam com o lock
    # principal. Com lock próprio, o ambiente que a tem precisa bater com ele.
    assert "requirements-diarizacao.txt" in _locks_do_ambiente({"pyannote-audio": "4.0.7"})
    assert "requirements-diarizacao.txt" not in _locks_do_ambiente({"fastapi": "1"})


def test_os_locks_concordam_em_todo_pacote_em_comum():
    # D-892: o teste acima cobra os locks juntos, então dois deles fixando o
    # mesmo pacote em versões diferentes o fazem falhar para sempre — o pip
    # instala uma e a outra sobra. Foi o filelock: 4.0.5 no dev, 3.32.4 na
    # diarização, que era compilada só contra o principal.
    versoes: dict[str, dict[str, str]] = {}
    for lock in (*LOCKS, LOCK_DA_DIARIZACAO):
        for nome, versao in _fixados((BACKEND / lock).read_text(encoding="utf-8")).items():
            versoes.setdefault(nome, {})[lock] = versao

    divergentes = {
        nome: por_lock for nome, por_lock in versoes.items() if len(set(por_lock.values())) > 1
    }

    assert not divergentes, (
        f"Locks discordam — recompile a diarização com -c requirements-dev.txt: {divergentes}"
    )


def test_o_leitor_do_lock_respeita_os_marcadores():
    lock = (
        "uvloop==0.22.1 ; sys_platform == 'nunca' \\\n"
        "    --hash=sha256:abc\n"
        "idna==3.20 \\\n"
        "    --hash=sha256:def\n"
        "uvicorn[standard]==0.53.0 \\\n"
    )

    assert _fixados(lock) == {"idna": "3.20", "uvicorn": "0.53.0"}
