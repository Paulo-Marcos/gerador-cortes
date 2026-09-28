"""A capa gerada no ChatGPT do operador, pela assinatura dele (D-804).

## Por que o navegador, e não a API nem o Codex

A API de imagem cobra à parte, e o operador já paga o ChatGPT. O Codex CLI gera
imagem pela assinatura, mas só do Plus para cima — medido em 28/09/2026: a conta
Go recebe "upgrade to Plus". O que sobra é o que ele fazia à mão: abrir o
projeto no ChatGPT, anexar as fichas do mascote, colar o prompt, esperar e
trazer a imagem. O robô faz os mesmos gestos, na mesma janela que ele vê.

## O que mora aqui

O que não depende de haver um navegador: o mapa de seletores (a única coisa que
quebra quando a OpenAI muda a tela), a proporção de cada capa, o texto que vai
para o chat e a validação do link do projeto.
"""

from __future__ import annotations

import re

from app.domain.compartilhado.erros import PedidoInvalido

# Medidos em 28/09/2026 na tela em português. O botão de enviar não tem id nem
# data-testid: o rótulo é a única âncora, por isso os dois idiomas.
SELETORES = {
    "campo_do_prompt": 'form div[contenteditable="true"]',
    "anexo_de_fotos": 'input[type="file"][accept="image/*"]',
    "enviar": 'form button[aria-label="Enviar"], form button[aria-label="Send prompt"]',
    "parar": (
        'button[data-testid="stop-button"], button[aria-label*="Parar"], button[aria-label*="Stop"]'
    ),
    "imagem_gerada": '[data-testid="generated-image-preview"] img',
}

# A tela de login troca a URL; é o sinal de sessão perdida mais barato de ler.
TRECHO_DA_TELA_DE_LOGIN = "/auth/"

# As três capas do app e o quadro que cada uma pede.
PROPORCOES = {
    "16:9": "horizontal 16:9 (1536x864 ou maior)",
    "4:5": "vertical 4:5 (1024x1280)",
    "9:16": "vertical 9:16 (1080x1920)",
}

# Vinte anexos por mensagem é o teto do ChatGPT; dez fichas já é exagero.
MAXIMO_DE_FICHAS = 10
EXTENSOES_DE_FICHA = (".png", ".jpg", ".jpeg", ".webp")

_RE_PROJETO = re.compile(r"^https://chatgpt\.com/g/g-p-[0-9a-f]{32}(-[a-z0-9-]+)?/project/?$")


class ProjetoInvalido(PedidoInvalido):
    """O link colado não é o de um projeto do ChatGPT."""


def url_do_projeto_valida(url: str) -> str:
    """O link do projeto sem espaços, ou `ProjetoInvalido`.

    Vazio vale: é como o operador desliga a integração. Exigir o formato exato
    (e não só o domínio) evita o erro mais provável — colar o link de UM chat do
    projeto, que abriria sempre a mesma conversa em vez de um chat novo.

    >>> url_do_projeto_valida(" https://chatgpt.com/g/g-p-6aa2f1d08414819192ac821e77ded48e/project ")
    'https://chatgpt.com/g/g-p-6aa2f1d08414819192ac821e77ded48e/project'
    """
    url = (url or "").strip()
    if url and not _RE_PROJETO.match(url):
        raise ProjetoInvalido(
            "Cole o link do PROJETO no ChatGPT, no formato "
            "https://chatgpt.com/g/g-p-…/project (abra o projeto e copie a barra de endereço)."
        )
    return url


def montar_pedido(prompt: str, proporcao: str) -> str:
    """O texto que vai para o chat: o prompt do app e o quadro que a capa exige.

    O quadro vai no fim, e não só dentro do prompt, porque os prompts antigos
    foram escritos para o agente capista, que sabia o formato de cor.
    """
    prompt = (prompt or "").strip()
    if not prompt:
        raise PedidoInvalido("Não há prompt para mandar ao ChatGPT: gere o prompt da capa antes.")
    if proporcao not in PROPORCOES:
        raise PedidoInvalido(f"Proporção desconhecida: {proporcao!r}.")
    return (
        f"{prompt}\n\n"
        f"Gere a imagem agora, no formato {PROPORCOES[proporcao]}, usando as fichas "
        "anexas como referência do personagem."
    )


def nome_de_ficha_valido(nome: str) -> str:
    """O nome do arquivo de ficha, ou `PedidoInvalido`.

    O nome vira caminho em disco: sem barra, sem `..` e com extensão de imagem.

    >>> nome_de_ficha_valido("Poses do sapo.PNG")
    'poses-do-sapo.png'
    """
    base = (nome or "").strip().replace("\\", "/").rsplit("/", 1)[-1]
    raiz, _, extensao = base.rpartition(".")
    extensao = f".{extensao.lower()}"
    if not raiz or extensao not in EXTENSOES_DE_FICHA:
        raise PedidoInvalido("A ficha precisa ser uma imagem PNG, JPG ou WEBP.")
    raiz = re.sub(r"[^a-z0-9]+", "-", raiz.lower()).strip("-")
    if not raiz:
        raise PedidoInvalido("Nome de ficha inválido.")
    return f"{raiz}{extensao}"


def tipo_da_imagem(conteudo: bytes) -> str:
    """O tipo MIME pela assinatura dos primeiros bytes, ou "" se não for imagem.

    Pela assinatura, e não pela extensão: a ficha chega com o nome que o
    operador deu, e a imagem do ChatGPT chega sem nome nenhum.

    >>> tipo_da_imagem(bytes.fromhex('89504e470d0a1a0a') + b'...')
    'image/png'
    """
    if conteudo.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if conteudo.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if conteudo[:4] == b"RIFF" and conteudo[8:12] == b"WEBP":
        return "image/webp"
    return ""
