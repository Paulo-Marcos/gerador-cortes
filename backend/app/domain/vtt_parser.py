"""
Parser de legendas VTT — lógica pura, sem I/O.

Extraído de IngestaoService._parse_vtt (ingestao.py).

Exemplo:
    >>> parse_vtt("WEBVTT\\n\\n00:00:01.000 --> 00:00:02.000\\nHello")
    [{'inicio': '00:00:01.000', 'fim': '00:00:02.000', 'texto': 'Hello'}]
"""

import re


def parse_vtt(vtt_content: str) -> list[dict]:
    """Converte conteúdo VTT bruto em lista de segmentos com timestamps.
    Remove o efeito de repetição (roll-up) comparando as linhas com o bloco anterior.

    Exemplo:
        >>> parse_vtt("WEBVTT\\n\\n00:01.000 --> 00:02.000\\nOlá\\n\\n00:02.000 --> 00:03.000\\nOlá\\nmundo")
        [{'inicio': '00:01.000', 'fim': '00:02.000', 'texto': 'Olá'}, {'inicio': '00:02.000', 'fim': '00:03.000', 'texto': 'mundo'}]
    """
    segmentos: list[dict] = []
    blocks = vtt_content.strip().split("\n\n")

    linhas_anteriores = []

    for block in blocks:
        lines = block.strip().split("\n")
        time_line = next((line for line in lines if "-->" in line), None)
        if not time_line:
            continue

        partes = time_line.split("-->")
        if len(partes) != 2:
            continue

        inicio = partes[0].strip().split(" ")[0]
        fim = partes[1].strip().split(" ")[0]

        # Limpa tags HTML e extrai apenas as linhas de texto do bloco atual
        texto_linhas = [
            re.sub(r"<[^>]+>", "", line).strip()
            for line in lines
            if "-->" not in line and not line.strip().isdigit()
        ]

        # Filtra linhas vazias
        texto_linhas = [linha for linha in texto_linhas if linha]

        # Lógica de deduplicação (Remove roll-up)
        novas_linhas = []
        for linha in texto_linhas:
            # Se a linha exata já estava visível no bloco anterior, nós pulamos
            if linha not in linhas_anteriores:
                novas_linhas.append(linha)

        # Atualiza a memória de linhas para o próximo bloco
        linhas_anteriores = texto_linhas

        texto = " ".join(novas_linhas).strip()

        # O youtube as vezes manda caracteres espúrios como setas, ou só espaços
        if texto:
            segmentos.append({"inicio": inicio, "fim": fim, "texto": texto})

    return segmentos
