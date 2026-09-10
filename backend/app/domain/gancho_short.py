"""O titulo-gancho da abertura do short (D-565).

## Por que ele existe, e por que NAO e uma cena

Nos primeiros tres segundos o espectador decide ficar ou passar, e mais de 60%
assiste sem som — entao quem faz o gancho chegar e o TEXTO, nao a fala. A
pratica de mercado converge: 4 a 7 palavras, alto contraste, no minimo 2s em
tela, dentro das safe zones.

Isso e o oposto do que as CENAS faziam. Cena era texto em QUALQUER momento, N
vezes, por cima de uma fala que a legenda ja estava escrevendo — e por isso
foram desligadas (D-560, `CENAS_LIGADAS`). O gancho e UM, ancorado no zero, e
sai antes dos tres segundos. Um letreiro na porta do cinema nao e alguem
acendendo a luz no meio do filme.

Dai este modulo ser separado do `cenas_short.py`: as duas coisas nao dividem
dado, nao dividem interruptor e nao devem dividir destino. Religar cenas um dia
nao pode mexer no gancho, e vice-versa.

Modulo puro: so texto e aritmetica. Sem I/O, sem banco, sem Remotion.
"""

from __future__ import annotations

# A faixa que a pesquisa converge, e que a tela usa para dar o retorno verde.
# NAO e limite: e alvo. Cortar a sexta palavra de um gancho que o operador
# escreveu seria o mesmo defeito que a D-533 tirou da etiqueta da capa.
PALAVRAS_MIN = 4
PALAVRAS_MAX = 7

# Guarda contra texto absurdo, nao regra editorial. Ate aqui o renderizador da
# conta encolhendo o corpo; acima disso nem tres linhas salvam.
MAX_CARACTERES = 90

# Quanto tempo o gancho fica em tela. O minimo vem da pesquisa (abaixo de 2s a
# frase nao e lida, so vista); o maximo e o ponto em que ele deixa de ser
# abertura e vira legenda concorrente.
DURACAO_PADRAO_SEG = 2.5
DURACAO_MIN_SEG = 1.5
DURACAO_MAX_SEG = 5.0


def normalizar_gancho(texto: str) -> str:
    """Arruma o texto do gancho sem apagar palavra nenhuma.

    Colapsa espaco e corta so no absurdo — e a mesma licao da etiqueta da capa
    (D-533): apagar a ultima palavra de um texto que o operador escreveu e pior
    que qualquer corpo pequeno, e e silencioso.

    A caixa NAO e forcada. A etiqueta da capa vai em maiuscula porque e um
    rotulo de prateleira; o gancho e uma frase que alguem le, e caixa alta em
    sete palavras cansa mais do que destaca.

    >>> normalizar_gancho('  ninguem   te   conta   isso  ')
    'ninguem te conta isso'
    >>> normalizar_gancho('')
    ''
    """
    palavras = (texto or "").split()
    if not palavras:
        return ""

    while len(palavras) > 1 and len(" ".join(palavras)) > MAX_CARACTERES:
        palavras.pop()

    return " ".join(palavras)


def contar_palavras(texto: str) -> int:
    """Quantas palavras o gancho tem.

    >>> contar_palavras('ninguem te conta isso')
    4
    >>> contar_palavras('   ')
    0
    """
    return len((texto or "").split())


def esta_na_faixa(texto: str) -> bool:
    """O gancho tem entre 4 e 7 palavras — o alvo que a tela sinaliza.

    >>> esta_na_faixa('ninguem te conta isso')
    True
    >>> esta_na_faixa('curto')
    False
    """
    return PALAVRAS_MIN <= contar_palavras(texto) <= PALAVRAS_MAX


def normalizar_duracao(valor: object) -> float:
    """A duracao em tela, encaixada na faixa util.

    Valor ausente ou ilegivel cai no padrao em vez de levantar: um numero torto
    vindo do banco nao pode custar o render inteiro do short.

    >>> normalizar_duracao(3.0)
    3.0
    >>> normalizar_duracao(0.2)
    1.5
    >>> normalizar_duracao(None)
    2.5
    """
    try:
        duracao = float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return DURACAO_PADRAO_SEG

    if duracao <= 0:
        return DURACAO_PADRAO_SEG
    return min(max(duracao, DURACAO_MIN_SEG), DURACAO_MAX_SEG)


def para_payload(texto: str, ate_seg: object, *, duracao_short_seg: float) -> dict | None:
    """O gancho como o renderer o consome, ou `None` quando nao ha gancho.

    `None` e uma resposta valida e comum: short sem gancho sai so com video e
    legenda, que e exatamente o que saia antes desta demanda.

    O corte contra a duracao do short existe porque o operador ajusta as bordas
    do trecho DEPOIS de escrever o gancho. Um trecho encurtado para 2s com
    gancho de 2,5s pediria ao Remotion uma sequencia maior que a composicao — e
    o sintoma seria um erro de render, nao um gancho comprido.

    >>> para_payload('ninguem te conta isso', 2.5, duracao_short_seg=30.0)
    {'texto': 'ninguem te conta isso', 'ateSeg': 2.5}
    >>> para_payload('  ', 2.5, duracao_short_seg=30.0) is None
    True
    >>> para_payload('oi', 5.0, duracao_short_seg=3.0)
    {'texto': 'oi', 'ateSeg': 3.0}
    """
    limpo = normalizar_gancho(texto)
    if not limpo:
        return None

    ate = normalizar_duracao(ate_seg)
    if duracao_short_seg > 0:
        ate = min(ate, round(float(duracao_short_seg), 2))
    return {"texto": limpo, "ateSeg": ate}
