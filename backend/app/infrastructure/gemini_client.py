"""Wrapper thin sobre google-genai — client singleton, geração de JSON e imagens."""

import asyncio
import json
import logging
import os
import re
from typing import Any

from app.config import settings
from google import genai

logger = logging.getLogger(__name__)

# Cache do client para reutilização (thread-safe pelo GIL)
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Retorna client singleton, instanciado lazy."""
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY", settings.gemini_api_key)
        _client = genai.Client(api_key=api_key)
    return _client


async def generate_json(
    model: str,
    prompt: str,
    *,
    schema: Any = None,
    temperature: float = 0.7,
    top_p: float = 0.9,
) -> dict:
    """Chama Gemini e retorna JSON parseado.

    Exemplo:
        >>> data = await generate_json("gemini-2.0-flash", "Lista 3 cores", temperature=0.5)
    """

    def _call_sync() -> dict:
        client = _get_client()
        config: dict[str, Any] = {
            "response_mime_type": "application/json",
            "temperature": temperature,
            "top_p": top_p,
        }
        if schema is not None:
            config["response_schema"] = schema

        logger.info("[GeminiClient] Gerando com modelo %s (temp=%.1f)...", model, temperature)
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=config,
        )
        text = response.text.strip()
        logger.info("[GeminiClient] Resposta recebida (%d chars). Extraindo JSON...", len(text))
        data = _extract_json(text)
        logger.debug("[GeminiClient] JSON extraído com sucesso.")
        return data

    return await asyncio.to_thread(_call_sync)


async def generate_image(prompt: str, *, model: str = "gemini-2.5-flash-image") -> bytes:
    """Gera uma imagem via Gemini e retorna os bytes.

    Exemplo:
        >>> img_bytes = await generate_image("Um gato laranja")
    """

    def _call_sync() -> bytes:
        client = _get_client()
        response = client.models.generate_content(
            model=model,
            contents=[prompt],
        )
        for part in response.parts:
            if part.inline_data is not None:
                return part.as_image().image_bytes
        raise ValueError("Gemini retornou sucesso mas sem imagem no response.parts")

    return await asyncio.to_thread(_call_sync)


def _extract_json(text: str) -> dict:
    """Extrai JSON de resposta que pode conter markdown fences ou texto extra."""
    # Tenta blocos markdown primeiro
    json_match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if json_match:
        return json.loads(json_match.group(1).strip())

    # Fallback: acha primeiro { ou [ e último } ou ]
    start = _find_first(text, "{", "[")
    end = _find_last(text, "}", "]")
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start : end + 1])

    return json.loads(text)


def _find_first(text: str, *chars: str) -> int:
    positions = [pos for c in chars if (pos := text.find(c)) != -1]
    return min(positions) if positions else -1


def _find_last(text: str, *chars: str) -> int:
    positions = [pos for c in chars if (pos := text.rfind(c)) != -1]
    return max(positions) if positions else -1
