"""Esperar e tentar de novo: o cooldown entre renders, a política de retry e
o retry assíncrono.

Parte do antigo test_pipeline_render.py (1927 linhas), dividido por assunto
no D-719. Os testes são os mesmos; só mudaram de arquivo.
"""

import asyncio
import time

import pytest
from app.infrastructure.render.retry_policy import RetryPolicy
from app.services.render.pipeline_render import (
    _aguardar_cooldown,
    _render_retry_policy,
    _retry_async,
)

# ─────────────────────────────────────────────────────────────
# _aguardar_cooldown (sleep configurável)
# ─────────────────────────────────────────────────────────────


class TestAguardarCooldown:
    def test_cooldown_zero_retorna_imediatamente(self):
        inicio = time.perf_counter()
        asyncio.run(_aguardar_cooldown(0, ha_mais_chunks=True))
        assert time.perf_counter() - inicio < 0.1

    def test_cooldown_negativo_retorna_imediatamente(self):
        inicio = time.perf_counter()
        asyncio.run(_aguardar_cooldown(-5, ha_mais_chunks=True))
        assert time.perf_counter() - inicio < 0.1

    def test_sem_mais_chunks_nao_dorme(self):
        inicio = time.perf_counter()
        asyncio.run(_aguardar_cooldown(20, ha_mais_chunks=False))
        assert time.perf_counter() - inicio < 0.1

    def test_cooldown_positivo_aguarda(self):
        from unittest.mock import AsyncMock, patch

        with patch(
            "app.services.render.pipeline_render.asyncio.sleep", new_callable=AsyncMock
        ) as fake_sleep:
            asyncio.run(_aguardar_cooldown(3, ha_mais_chunks=True))
            fake_sleep.assert_awaited_once_with(3)


# ─────────────────────────────────────────────────────────────
# _render_retry_policy
# ─────────────────────────────────────────────────────────────


class TestRenderRetryPolicy:
    def test_le_max_attempts_das_settings(self):
        from app.services.app_settings import RenderSettings

        cfg = RenderSettings(overlay_max_attempts=5)
        policy = _render_retry_policy(cfg)
        assert policy.max_attempts == 5

    def test_default_3_attempts(self):
        from app.services.app_settings import RenderSettings

        policy = _render_retry_policy(RenderSettings())
        assert policy.max_attempts == 3

    def test_backoff_linear_2s(self):
        from app.services.app_settings import RenderSettings

        policy = _render_retry_policy(RenderSettings())
        assert policy.base_delay_sec == 2.0


# ─────────────────────────────────────────────────────────────
# _retry_async — wrapper de retry para operações async
# ─────────────────────────────────────────────────────────────


class TestRetryAsync:
    def test_sucesso_na_primeira_tentativa_chama_uma_vez(self):
        chamadas = {"n": 0}

        async def op():
            chamadas["n"] += 1

        policy = RetryPolicy(max_attempts=3, base_delay_sec=0.0)
        asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))
        assert chamadas["n"] == 1

    def test_falha_uma_vez_depois_sucesso(self):
        from unittest.mock import AsyncMock, patch

        chamadas = {"n": 0}

        async def op():
            chamadas["n"] += 1
            if chamadas["n"] == 1:
                raise RuntimeError("transient")

        policy = RetryPolicy(max_attempts=3, base_delay_sec=2.0)
        with patch("app.services.render.pipeline_render.asyncio.sleep", new_callable=AsyncMock):
            asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))
        assert chamadas["n"] == 2

    def test_esgota_tentativas_e_relevanta_ultimo_erro(self):
        from unittest.mock import AsyncMock, patch

        chamadas = {"n": 0}

        async def op():
            chamadas["n"] += 1
            raise RuntimeError(f"falha-{chamadas['n']}")

        policy = RetryPolicy(max_attempts=3, base_delay_sec=2.0)
        with patch("app.services.render.pipeline_render.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(RuntimeError, match="falha-3"):
                asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))
        assert chamadas["n"] == 3

    def test_max_attempts_1_nao_retenta(self):
        chamadas = {"n": 0}

        async def op():
            chamadas["n"] += 1
            raise RuntimeError("falha")

        policy = RetryPolicy(max_attempts=1, base_delay_sec=0.0)
        with pytest.raises(RuntimeError):
            asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))
        assert chamadas["n"] == 1

    def test_aguarda_backoff_entre_tentativas(self):
        from unittest.mock import AsyncMock, patch

        async def op():
            raise RuntimeError("sempre falha")

        policy = RetryPolicy(max_attempts=3, base_delay_sec=2.0)
        with patch(
            "app.services.render.pipeline_render.asyncio.sleep", new_callable=AsyncMock
        ) as fake_sleep:
            with pytest.raises(RuntimeError):
                asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))

        # 2 retries → 2 sleeps com backoff 2s e 4s
        delays_chamados = [call.args[0] for call in fake_sleep.call_args_list]
        assert delays_chamados == [2.0, 4.0]

    def test_backoff_zero_nao_chama_sleep(self):
        from unittest.mock import AsyncMock, patch

        async def op():
            raise RuntimeError("falha")

        policy = RetryPolicy(max_attempts=3, base_delay_sec=0.0)
        with patch(
            "app.services.render.pipeline_render.asyncio.sleep", new_callable=AsyncMock
        ) as fake_sleep:
            with pytest.raises(RuntimeError):
                asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))
        fake_sleep.assert_not_called()
