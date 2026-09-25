"""Configuração global da suíte de testes.

D-622: o render escolhe o encoder testando o hardware (Intel Quick Sync ou
libx264). Os testes fixam `qsv` para não depender da máquina — sem isso, a CI
(sem Intel) escolheria libx264 e mudaria o fluxo de fallback da grade.
Os caminhos do libx264 têm testes próprios que passam o encoder explicitamente.

D-760: a suíte não abre banco de verdade. `app.database` cria o engine no import
e cada service guarda o seu `AsyncSessionLocal`; uma tarefa de fundo disparada
por um teste (a capa que encadeia a do TikTok, o gerar-bruto) abria o
`projetos.db` do DEV — medido em 25/09/2026, com -wal/-shm novos. Os bancos da
instância (`settings.db`, `llm_calls.db`) recebiam escrita pelo mesmo caminho.
Por isso a instância e os projetos apontam para uma pasta temporária ANTES de
qualquer import de `app` além do `channel_paths`, que só resolve caminhos.
"""

import atexit
import os
import shutil
import tempfile
from pathlib import Path

os.environ["VIDEO_ENCODER"] = "qsv"

_PASTA_DA_SESSAO = Path(tempfile.mkdtemp(prefix="cutcut-testes-"))
atexit.register(shutil.rmtree, _PASTA_DA_SESSAO, ignore_errors=True)

# Legado dos dados: sem canal ativo na instância isolada, o `projetos.db` e as
# mídias caem aqui (`channel_paths.projetos_dir`).
os.environ["PROJETOS_DIR"] = str(_PASTA_DA_SESSAO / "projetos")
(_PASTA_DA_SESSAO / "projetos").mkdir()

from app.core import channel_paths  # noqa: E402

_REPOSITORIO = channel_paths._REPO_ROOT


def _instancia_isolada() -> Path:
    # Quem reloca a raiz do repositório (os testes do layout de canais) continua
    # vendo `<raiz>/instance`; só a instância do repositório de verdade é trocada.
    if channel_paths._REPO_ROOT == _REPOSITORIO:
        return _PASTA_DA_SESSAO / "instance"
    return channel_paths._REPO_ROOT / "instance"


channel_paths._instance_root = _instancia_isolada
