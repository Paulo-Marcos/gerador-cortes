"""O provider deduzido do nome do modelo — a base do selo Claude/Gemini."""

from app.domain.compartilhado.provider_ia import provider_do_modelo


def test_modelo_gemini_e_do_antigravity():
    assert provider_do_modelo("gemini-3.1-pro-high") == "gemini"


def test_alias_do_claude_e_do_claude():
    assert provider_do_modelo("opus") == "claude"
    assert provider_do_modelo("claude-sonnet-5") == "claude"


def test_sem_modelo_nao_afirma_provider():
    """Geração antiga, sem telemetria: a tela não mostra selo em vez de chutar."""
    assert provider_do_modelo("") is None
    assert provider_do_modelo(None) is None
