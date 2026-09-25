"""As âncoras de caminho dos módulos que saem da raiz de app/ (D-698).

Teste de caracterização, antes do movimento. Sete módulos acham o repositório
contando pastas a partir do próprio arquivo (`Path(__file__)...parent`). Mudar o
módulo de pasta sem ajustar a conta faz o app procurar `instance/` e os exemplos
no lugar errado — e subir sem canal, sem erro de import que avise. A verdade
aqui vem de outra fonte: este arquivo, que mora em `backend/tests/` e não se
move. As referências que o movimento troca ficam no topo.
"""

from pathlib import Path

from app import channel_layout_migration, editorial_scaffolds, editorial_skills, prompts_utilitarios
from app.core import channel_paths
from app.infrastructure import channel_assets_sync, channel_config_loader

_BACKEND = Path(__file__).resolve().parents[1]
_APP = _BACKEND / "app"
_REPO = _BACKEND.parent


def test_a_verdade_aponta_para_o_repositorio():
    assert (_REPO / "AGENTS.md").is_file()
    assert (_REPO / "examples" / "instance.example").is_dir()
    assert (_APP / "canal_config.py.example").is_file()


def test_os_caminhos_do_canal_partem_da_raiz_do_repositorio():
    assert channel_paths._REPO_ROOT == _REPO
    assert channel_paths._BACKEND_ROOT == _BACKEND
    assert channel_paths._VIDEO_RENDERER_ROOT == _REPO / "video-renderer"


def test_a_sincronia_de_assets_serve_as_pastas_do_frontend_e_do_renderer():
    assert channel_assets_sync._REPO_ROOT == _REPO


def test_o_loader_da_config_editorial_acha_o_exemplo_dentro_de_app():
    assert channel_config_loader._APP_DIR == _APP
    assert channel_config_loader._REPO_ROOT == _REPO


def test_o_migrador_de_boot_parte_de_app_backend_e_repositorio():
    assert channel_layout_migration._APP_DIR == _APP
    assert channel_layout_migration._BACKEND_ROOT == _BACKEND
    assert channel_layout_migration._REPO_ROOT == _REPO


def test_as_sementes_editoriais_vem_dos_exemplos_do_repositorio():
    assert editorial_skills._REPO_ROOT == _REPO
    assert editorial_scaffolds._REPO_ROOT == _REPO
    assert prompts_utilitarios._REPO_ROOT == _REPO
