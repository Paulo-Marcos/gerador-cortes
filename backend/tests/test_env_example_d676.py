"""O `.env.example` só documenta o que o app lê (D-676).

O exemplo antigo ensinava a pôr `CANAL_MASCOTE_NOME` e `PROJETOS_DIR` no `.env`
— chaves que nenhum campo de `Settings` lê. O pydantic-settings consome o `.env`
só para os próprios campos; o `os.getenv` do app não enxerga o arquivo. Quem
seguia o exemplo configurava algo que não tinha efeito, sem erro nenhum.
"""

import re
from pathlib import Path

from app.config import Settings

_EXEMPLO = Path(__file__).resolve().parents[1] / ".env.example"
_LINHA = re.compile(r"^(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$")


def _chaves_do_exemplo() -> dict[str, tuple[bool, str]]:
    """Chave → (comentada?, valor) de cada linha `CHAVE=valor` do exemplo."""
    chaves = {}
    for linha in _EXEMPLO.read_text(encoding="utf-8").splitlines():
        achado = _LINHA.match(linha.strip())
        if achado:
            comentada, chave, valor = achado.groups()
            chaves[chave] = (comentada is not None, valor.strip())
    return chaves


def _como_no_env(valor) -> str:
    return str(valor).lower() if isinstance(valor, bool) else str(valor)


def test_toda_chave_do_exemplo_e_um_campo_de_settings():
    campos = {nome.upper() for nome in Settings.model_fields}
    mortas = sorted(set(_chaves_do_exemplo()) - campos)
    assert not mortas, f"chaves que o app não lê: {mortas}"


def test_todo_segredo_de_settings_esta_no_exemplo_e_vazio():
    segredos = {
        nome.upper() for nome in Settings.model_fields if nome.endswith(("_api_key", "_token"))
    }
    chaves = _chaves_do_exemplo()
    for segredo in segredos:
        assert segredo in chaves, f"{segredo} falta no .env.example"
        assert chaves[segredo] == (False, ""), f"{segredo} deve vir ativo e vazio"


def test_ajuste_comentado_mostra_o_padrao_do_config():
    for chave, (comentada, valor) in _chaves_do_exemplo().items():
        if comentada:
            padrao = Settings.model_fields[chave.lower()].default
            assert valor == _como_no_env(padrao), f"{chave}: exemplo {valor!r}, config {padrao!r}"
