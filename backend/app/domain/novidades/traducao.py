"""O pedido de tradução das novidades e a leitura da resposta (D-922).

O CHANGELOG é escrito em inglês para o repositório público; o operador lê em
português. A IA não só traduz: reescreve cada entrada para quem USA o app —
um resumo do que mudou e, quando há o que fazer, onde fica e como se usa.
Ela só pode tirar isso do texto: inventar um caminho de tela seria pior que
não ter nenhum.
"""

from __future__ import annotations

import json

from app.domain.novidades.changelog import Entrada

# Quantas entradas vão num pedido: a 0.6.0 tem dezenas, e um pedido só seria
# lento e frágil (uma resposta truncada perderia todas).
LOTE = 8

_INSTRUCOES = """\
Você recebe entradas do CHANGELOG (em inglês) de um app desktop que transforma
lives do YouTube em cortes, shorts e capas. O leitor é o operador do app, que
fala português do Brasil e quer saber o que mudou e como usar.

Para cada entrada, escreva em português do Brasil:
- "titulo": o título da entrada, traduzido, curto (até 90 caracteres).
- "resumo": o que mudou e por que importa para o operador, em 1 a 3 frases.
- "como_usar": onde fica no app e os passos para usar ou ajustar, em frases
  curtas ou passos separados por quebra de linha. Use só o que está no texto
  (nomes de tela, seção e botão entre aspas ficam como estão, em português).
  Deixe "" quando não há nada que o operador faça: mudança interna, de CI, de
  dependência ou correção que só passa a funcionar.

Não invente telas, botões nem comportamentos que o texto não diga. Mantenha os
números, nomes de redes e termos técnicos do app. Não cite os códigos D-NNN.

Responda só com JSON, sem comentários:
{"traducoes": [{"chave": "...", "titulo": "...", "resumo": "...", "como_usar": "..."}]}
"""


def montar_pedido(entradas: list[Entrada]) -> str:
    itens = [{"chave": e.chave, "categoria": e.categoria, "texto": e.texto} for e in entradas]
    return f"{_INSTRUCOES}\nEntradas:\n{json.dumps(itens, ensure_ascii=False, indent=1)}\n"


def ler_resposta(resposta: dict, pedidas: set[str]) -> dict[str, dict[str, str]]:
    """As traduções válidas: chave pedida, título e resumo preenchidos.

    Item fora disso é descartado, não corrigido — a entrada continua pendente e
    volta no próximo pedido.
    """
    traducoes: dict[str, dict[str, str]] = {}
    itens = resposta.get("traducoes")
    for item in itens if isinstance(itens, list) else []:
        if not isinstance(item, dict) or item.get("chave") not in pedidas:
            continue
        campos = {nome: item.get(nome) for nome in ("titulo", "resumo", "como_usar")}
        if not all(isinstance(valor, str) for valor in campos.values()):
            continue
        limpos = {nome: str(valor).strip() for nome, valor in campos.items()}
        if limpos["titulo"] and limpos["resumo"]:
            traducoes[str(item["chave"])] = limpos
    return traducoes
