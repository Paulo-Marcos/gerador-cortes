"""
Loader único da configuração editorial do canal (prompts, créditos, direção).

Resolve os símbolos editoriais por uma cadeia de fallback, do mais específico
para o mais genérico, de modo que um clone novo — sem `app/canal_config.py`
(arquivo gitignored) — não derrube o backend:

  1. `instance/channels/<ativo>/canal_config.py` — config real do canal ativo,
                                             para onde D-155 a consolida
  2. `instance/editorial/canal_config.py`  — override da instância (alvo de D-144)
  3. `app.canal_config`                    — back-compat: preserva exatamente o
                                             comportamento atual quando o módulo existe
  4. `examples/instance.example/editorial/canal_config.py` — exemplo versionado (alvo de D-144)
  5. `backend/app/canal_config.py.example` — template versionado, sempre presente
                                             (rede de segurança: garante que os
                                             símbolos existam mesmo sem nenhum dos acima)

Se nenhuma fonte resolver, levanta um erro claro orientando como configurar.

Os módulos que antes faziam `from app.canal_config import ...` passam a importar
deste loader. Os nomes exportados são idênticos aos do `canal_config`.
"""

from __future__ import annotations

import importlib
import importlib.util
from importlib.machinery import SourceFileLoader
from pathlib import Path
from types import ModuleType

from app.channel_paths import active_channel_root, editorial_dir

# Símbolos editoriais que toda fonte de configuração precisa fornecer.
SIMBOLOS_REQUERIDOS = (
    "CREDITOS_TEMPLATE",
    "PROMPT_GERAR_METADADOS",
    "PROMPT_GERAR_THUMBNAIL",
    "PROMPT_GERAR_THUMBNAIL_AGENTE",
    "PROMPT_GERAR_THUMBNAIL_AGENTE_LIVRE",
    "PROMPT_DIRECAO",
)

_APP_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _APP_DIR.parent.parent

# Fontes baseadas em arquivo (caminho absoluto do `canal_config.py`), na ordem
# de prioridade. A fonte por módulo importável (`app.canal_config`) é tratada à
# parte para respeitar stubs em `sys.modules` (usado nos testes e em clones limpos).
# A instância resolve pela raiz do canal ativo (channel_paths) — costura única.
# D-155: o `canal_config.py` real do canal passa a viver na RAIZ do canal ativo
# (`instance/channels/<ativo>/canal_config.py`), para onde a migração de boot o move;
# é a fonte de maior prioridade. Mantemos a fonte em `editorial/` (D-144) como fallback.
_FONTE_ARQUIVO_CANAL = active_channel_root() / "canal_config.py"
_FONTE_ARQUIVO_INSTANCIA = editorial_dir() / "canal_config.py"
_FONTE_ARQUIVO_EXEMPLO = (
    _REPO_ROOT / "examples" / "instance.example" / "editorial" / "canal_config.py"
)
_FONTE_ARQUIVO_TEMPLATE = _APP_DIR / "canal_config.py.example"


def _tem_todos_simbolos(modulo: ModuleType) -> bool:
    return all(hasattr(modulo, nome) for nome in SIMBOLOS_REQUERIDOS)


def _carregar_de_arquivo(caminho: Path) -> ModuleType | None:
    """Importa um `canal_config.py` avulso a partir do caminho, ou None se ausente/incompleto."""
    if not caminho.is_file():
        return None
    # SourceFileLoader explicito: o template tem sufixo `.example` (nao `.py`),
    # que spec_from_file_location nao reconhece como fonte Python sozinho.
    nome = f"_channel_config_{caminho.name.replace('.', '_')}"
    loader = SourceFileLoader(nome, str(caminho))
    spec = importlib.util.spec_from_file_location(nome, caminho, loader=loader)
    if spec is None or spec.loader is None:
        return None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo if _tem_todos_simbolos(modulo) else None


def _carregar_canal_config_importavel() -> ModuleType | None:
    """Importa `app.canal_config` (back-compat), ou None se ausente/incompleto."""
    try:
        modulo = importlib.import_module("app.canal_config")
    except ImportError:
        return None
    return modulo if _tem_todos_simbolos(modulo) else None


def _resolver_fonte() -> ModuleType:
    """Percorre a cadeia de fallback e devolve o primeiro módulo completo."""
    candidatos = (
        lambda: _carregar_de_arquivo(_FONTE_ARQUIVO_CANAL),
        lambda: _carregar_de_arquivo(_FONTE_ARQUIVO_INSTANCIA),
        _carregar_canal_config_importavel,
        lambda: _carregar_de_arquivo(_FONTE_ARQUIVO_EXEMPLO),
        lambda: _carregar_de_arquivo(_FONTE_ARQUIVO_TEMPLATE),
    )
    for resolver in candidatos:
        modulo = resolver()
        if modulo is not None:
            return modulo
    raise RuntimeError(
        "Configuração editorial do canal não encontrada. Forneça uma destas fontes:\n"
        f"  1. {_FONTE_ARQUIVO_CANAL}\n"
        f"  2. {_FONTE_ARQUIVO_INSTANCIA}\n"
        f"  3. {_APP_DIR / 'canal_config.py'} (copie de canal_config.py.example)\n"
        f"  4. {_FONTE_ARQUIVO_EXEMPLO}\n"
        f"  5. {_FONTE_ARQUIVO_TEMPLATE}\n"
        f"Cada fonte deve definir: {', '.join(SIMBOLOS_REQUERIDOS)}."
    )


_fonte = _resolver_fonte()

CREDITOS_TEMPLATE = _fonte.CREDITOS_TEMPLATE
PROMPT_GERAR_METADADOS = _fonte.PROMPT_GERAR_METADADOS
PROMPT_GERAR_THUMBNAIL = _fonte.PROMPT_GERAR_THUMBNAIL
PROMPT_GERAR_THUMBNAIL_AGENTE = _fonte.PROMPT_GERAR_THUMBNAIL_AGENTE
PROMPT_GERAR_THUMBNAIL_AGENTE_LIVRE = _fonte.PROMPT_GERAR_THUMBNAIL_AGENTE_LIVRE
PROMPT_DIRECAO = _fonte.PROMPT_DIRECAO

__all__ = list(SIMBOLOS_REQUERIDOS)
