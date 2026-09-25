"""A suíte nunca abre um banco que viva dentro do repositório (D-760).

O `conftest.py` aponta os bancos para uma pasta temporária antes de qualquer
import de `app`. Estes testes são a catraca: se alguém mover o import do engine
para antes do redirecionamento, ou um banco novo nascer fora dele, falham aqui
em vez de escrever no banco do DEV.
"""

from __future__ import annotations

from pathlib import Path

from app import database
from app.core import channel_paths
from app.infrastructure import llm_calls_store

_REPO = Path(__file__).resolve().parents[2]


def _fora_do_repositorio(caminho: Path) -> bool:
    return not caminho.resolve().is_relative_to(_REPO)


def test_o_engine_do_app_aponta_para_fora_do_repositorio():
    assert _fora_do_repositorio(Path(database.engine.url.database))


def test_os_bancos_da_instancia_ficam_fora_do_repositorio():
    assert _fora_do_repositorio(channel_paths.active_channel_root())
    assert _fora_do_repositorio(channel_paths.settings_db_path())
    assert _fora_do_repositorio(llm_calls_store._default_db_path())
