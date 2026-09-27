"""O pedaço de JSON Schema que os contratos do protocolo usam (D-725).

Os contratos de video-renderer/protocol/ (cena e job) usam só isto: tipos
básicos (um só ou em lista), enum, const, anyOf, obrigatórios, chaves fechadas, tamanho mínimo e
listas. Validar esse pedaço aqui evita uma dependência nova só para teste.
"""

_TIPOS_JSON = {"string": str, "number": (int, float), "array": list, "object": dict}


def violacoes(valor, schema: dict, caminho: str = "valor") -> list[str]:
    """Lista o que em `valor` não cabe em `schema`; vazia quando cabe."""
    if "anyOf" in schema:
        if any(not violacoes(valor, opcao, caminho) for opcao in schema["anyOf"]):
            return []
        return [f"{caminho}: {valor!r} não cabe em nenhuma opção"]
    if "const" in schema:
        return [] if valor == schema["const"] else [f"{caminho}: esperava {schema['const']!r}"]
    if "enum" in schema:
        return [] if valor in schema["enum"] else [f"{caminho}: {valor!r} fora de {schema['enum']}"]
    tipo = schema.get("type")
    if isinstance(tipo, list):
        # `type` com lista (["number", "string"]) é o `anyOf` de tipos simples.
        opcoes = [{**schema, "type": t} for t in tipo]
        return violacoes(valor, {"anyOf": opcoes}, caminho)
    if tipo and (not isinstance(valor, _TIPOS_JSON[tipo]) or isinstance(valor, bool)):
        return [f"{caminho}: esperava {tipo}, veio {type(valor).__name__}"]
    erros: list[str] = []
    if tipo == "string" and len(valor) < schema.get("minLength", 0):
        erros.append(f"{caminho}: texto curto demais")
    if tipo == "object":
        erros += [
            f"{caminho}.{c}: obrigatório" for c in schema.get("required", []) if c not in valor
        ]
        for chave, item in valor.items():
            if chave in schema.get("properties", {}):
                erros += violacoes(item, schema["properties"][chave], f"{caminho}.{chave}")
            elif schema.get("additionalProperties") is False:
                erros.append(f"{caminho}.{chave}: fora do contrato")
    if tipo == "array":
        if len(valor) < schema.get("minItems", 0):
            erros.append(f"{caminho}: lista curta demais")
        if "items" in schema:
            for indice, item in enumerate(valor):
                erros += violacoes(item, schema["items"], f"{caminho}[{indice}]")
    return erros
