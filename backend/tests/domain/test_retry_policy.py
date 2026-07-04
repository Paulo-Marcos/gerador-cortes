"""Testes da política de retry (domain puro)."""

import pytest
from app.domain.retry_policy import RetryPolicy

# ─────────────────────────────────────────────────────────────
# Construção e validação
# ─────────────────────────────────────────────────────────────


class TestConstrucao:
    def test_defaults(self):
        p = RetryPolicy()
        assert p.max_attempts == 3
        assert p.base_delay_sec == 2.0

    def test_max_attempts_zero_levanta(self):
        with pytest.raises(ValueError, match="max_attempts"):
            RetryPolicy(max_attempts=0)

    def test_max_attempts_negativo_levanta(self):
        with pytest.raises(ValueError, match="max_attempts"):
            RetryPolicy(max_attempts=-1)

    def test_base_delay_negativo_levanta(self):
        with pytest.raises(ValueError, match="base_delay_sec"):
            RetryPolicy(base_delay_sec=-1.0)

    def test_base_delay_zero_aceito(self):
        # Zero significa "sem espera entre tentativas" — válido para testes
        p = RetryPolicy(base_delay_sec=0.0)
        assert p.base_delay_sec == 0.0

    def test_max_attempts_um_aceito(self):
        # 1 = sem retry (apenas a tentativa original)
        p = RetryPolicy(max_attempts=1)
        assert p.max_attempts == 1

    def test_e_frozen(self):
        p = RetryPolicy()
        with pytest.raises(Exception):
            p.max_attempts = 5  # type: ignore[misc]


# ─────────────────────────────────────────────────────────────
# should_retry
# ─────────────────────────────────────────────────────────────


class TestShouldRetry:
    def test_apos_primeira_tentativa_de_3_pode_retentar(self):
        p = RetryPolicy(max_attempts=3)
        assert p.should_retry(1) is True

    def test_apos_segunda_tentativa_de_3_pode_retentar(self):
        p = RetryPolicy(max_attempts=3)
        assert p.should_retry(2) is True

    def test_apos_terceira_tentativa_de_3_nao_retenta(self):
        p = RetryPolicy(max_attempts=3)
        assert p.should_retry(3) is False

    def test_max_attempts_1_nunca_retenta(self):
        p = RetryPolicy(max_attempts=1)
        assert p.should_retry(1) is False

    def test_attempt_maior_que_max_nao_retenta(self):
        p = RetryPolicy(max_attempts=3)
        assert p.should_retry(5) is False


# ─────────────────────────────────────────────────────────────
# backoff_seconds
# ─────────────────────────────────────────────────────────────


class TestBackoffSeconds:
    def test_backoff_linear_default(self):
        p = RetryPolicy(base_delay_sec=2.0)
        assert p.backoff_seconds(1) == pytest.approx(2.0)
        assert p.backoff_seconds(2) == pytest.approx(4.0)
        assert p.backoff_seconds(3) == pytest.approx(6.0)

    def test_backoff_zero_quando_base_zero(self):
        p = RetryPolicy(base_delay_sec=0.0)
        assert p.backoff_seconds(1) == 0.0
        assert p.backoff_seconds(2) == 0.0

    def test_backoff_attempt_zero_ou_negativo_retorna_zero(self):
        p = RetryPolicy(base_delay_sec=2.0)
        assert p.backoff_seconds(0) == 0.0
        assert p.backoff_seconds(-1) == 0.0

    def test_backoff_customizado(self):
        p = RetryPolicy(base_delay_sec=0.5)
        assert p.backoff_seconds(1) == pytest.approx(0.5)
        assert p.backoff_seconds(4) == pytest.approx(2.0)


# ─────────────────────────────────────────────────────────────
# total_attempts
# ─────────────────────────────────────────────────────────────


class TestTotalAttempts:
    def test_total_attempts_igual_max_attempts(self):
        assert RetryPolicy(max_attempts=5).total_attempts == 5

    def test_total_attempts_minimo(self):
        assert RetryPolicy(max_attempts=1).total_attempts == 1
