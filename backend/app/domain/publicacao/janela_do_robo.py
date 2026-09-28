"""Como a janela do Chrome do robô se comporta na tela do operador (D-799).

## A página branca

O operador deixava o robô trabalhando e voltava ao app. Com a janela do Chrome
inteiramente coberta, o Windows avisa o Chrome ("ninguém vê esta janela"), e o
Chrome para de desenhar a página e desacelera os relógios dela. O robô ficava
esperando um botão que nunca terminava de aparecer; o operador via uma tela
branca, que só voltava quando ele focava a janela. Isso é oclusão, e
não tem a ver com minimizar: medido em 28/09/2026, a janela minimizada seguia
viva, e a coberta não.

Por isso o Chrome do robô nasce com a oclusão DESLIGADA. E, já que ela não o
faz mais parar, ele pode nascer fora da tela: o operador não vê nada, e o
Chrome segue se achando visível.

## O foco

Medido no mesmo dia: dos gestos do robô, só o NASCIMENTO do Chrome rouba o foco
do Windows (abrir aba, navegar e clicar não roubam). Janela invisível com o foco
é o pior dos mundos — o que o operador digita some numa janela que ele não vê.
Quem devolve o foco é a infraestrutura; aqui fica só a regra.
"""

from __future__ import annotations

# Cada uma desliga um jeito diferente de o Chrome "economizar" com a janela que
# acha que ninguém vê. A última é a que desliga o cálculo de oclusão do Windows;
# as outras três seguram a página viva mesmo que ele volte por outro caminho.
ARGUMENTOS_INVISIVEIS: tuple[str, ...] = (
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling",
)

# Fora de qualquer monitor, e com tamanho de tela de verdade: o Studio do TikTok
# muda de layout em janela estreita, e os seletores foram medidos na larga.
POSICAO_FORA_DA_TELA = (-2400, -2400)
TAMANHO_DA_JANELA = (1280, 900)

# Onde a janela reaparece quando é a vez do operador revisar.
POSICAO_DE_REVISAO = (80, 40)


def argumentos_da_janela() -> list[str]:
    """Os argumentos de linha de comando que fazem a janela nascer escondida.

    >>> argumentos_da_janela()[-2:]
    ['--window-position=-2400,-2400', '--window-size=1280,900']
    """
    x, y = POSICAO_FORA_DA_TELA
    largura, altura = TAMANHO_DA_JANELA
    return [
        *ARGUMENTOS_INVISIVEIS,
        f"--window-position={x},{y}",
        f"--window-size={largura},{altura}",
    ]


def falta_modo_invisivel(linha_de_comando: list[str]) -> bool:
    """O Chrome desta linha de comando foi aberto ANTES do modo invisível?

    É o Chrome que o robô de uma versão anterior deixou aberto: ele continua
    ficando branco quando coberto, e só um reinício o conserta. Linha vazia
    quer dizer "não sei de quem é", e aí a resposta é não mexer.

    >>> falta_modo_invisivel(["chrome.exe", "--user-data-dir=C:/p"])
    True
    >>> falta_modo_invisivel(["chrome.exe", *ARGUMENTOS_INVISIVEIS])
    False
    >>> falta_modo_invisivel([])
    False
    """
    if not linha_de_comando:
        return False
    return not all(argumento in linha_de_comando for argumento in ARGUMENTOS_INVISIVEIS)
