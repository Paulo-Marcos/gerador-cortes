"""Extração do JSON na resposta de texto de uma IA (Claude CLI)."""

import json
import re

_TRECHO_DA_RECUSA = 400


class RespostaSemJson(json.JSONDecodeError):
    """A IA respondeu com texto (recusa, dúvida, conversa) onde se esperava JSON.

    Segue sendo `JSONDecodeError` para quem já captura esse tipo, mas a mensagem
    traz o que a IA disse: "Expecting value: line 1 column 1" não diz nada.
    """

    def __init__(self, texto: str):
        super().__init__("A IA não devolveu JSON", texto, 0)
        trecho = " ".join(texto.split())[:_TRECHO_DA_RECUSA]
        self.explicacao = f"A IA não devolveu JSON. Resposta dela: {trecho}"

    def __str__(self) -> str:
        return self.explicacao


def extract_json(text: str) -> dict:
    """Extrai JSON de uma resposta que pode conter markdown fences ou texto extra.

    Mesma estratégia do gemini_client._extract_json (consistência de contrato).
    """
    json_match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if json_match:
        return _parse_objeto_json(json_match.group(1).strip())

    inicio = _find_first(text, "{", "[")
    fim = _find_last(text, "}", "]")
    if inicio != -1 and fim != -1 and fim > inicio:
        return _parse_objeto_json(text[inicio : fim + 1])

    return _parse_objeto_json(text)


def _parse_objeto_json(bruto: str) -> dict:
    """Faz o parse e garante que o topo é um objeto JSON (dict).

    A IA às vezes devolve um array válido (ex.: `[{...}]`); sem esta guarda o
    chamador quebraria adiante com `KeyError`. Falhar aqui, na fronteira, dá um
    erro claro em vez de um estouro obscuro rio abaixo.
    """
    resultado = json.loads(bruto)
    if not isinstance(resultado, dict):
        raise ValueError(f"Resposta JSON não é um objeto: recebido {type(resultado).__name__}.")
    return resultado


def _find_first(text: str, *chars: str) -> int:
    posicoes = [pos for c in chars if (pos := text.find(c)) != -1]
    return min(posicoes) if posicoes else -1


def _find_last(text: str, *chars: str) -> int:
    posicoes = [pos for c in chars if (pos := text.rfind(c)) != -1]
    return max(posicoes) if posicoes else -1
