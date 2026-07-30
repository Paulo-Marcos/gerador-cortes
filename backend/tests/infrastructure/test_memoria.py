"""D-441: leitura de RAM disponível (caminho feliz)."""

from app.infrastructure.memoria import ram_disponivel_mb


def test_ram_disponivel_retorna_valor_plausivel():
    livre = ram_disponivel_mb()
    assert livre is None or 0 < livre < 4 * 1024 * 1024
