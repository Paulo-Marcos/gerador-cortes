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

# D-581: como o gancho se separa do resto do quadro.
#
# Ate aqui ele saia branco, com o mesmo corpo pesado e a mesma sombra da
# legenda, e o resultado foi o relato do operador: "ele aparece branco e igual a
# legenda e da conflito". Sao dois textos brancos na mesma tela, ao mesmo tempo,
# e nada dizendo ao olho qual e a promessa e qual e a fala.
#
# A pesquisa de formato converge em tres tecnicas, e elas nao competem: contorno
# (o mais confiavel sobre fundo que muda), caixa (o mais legivel sobre fundo
# sujo) e sombra (o mais discreto, para imagem limpa). O veu em degrade e o que
# o gancho ja fazia, e continua sendo o padrao — trocar o default mudaria o
# visual de todo short ja curado sem ninguem pedir.
#
# O `nenhum` existe para quem escolheu uma COR forte: com amarelo sobre video
# escuro, qualquer reforco vira excesso.
REALCE_VEU = "veu"
REALCE_CAIXA = "caixa"
REALCE_CONTORNO = "contorno"
REALCE_SOMBRA = "sombra"
REALCE_NENHUM = "nenhum"

REALCE_PADRAO = REALCE_VEU

REALCES = (REALCE_VEU, REALCE_CAIXA, REALCE_CONTORNO, REALCE_SOMBRA, REALCE_NENHUM)

# D-594: a escala do corpo do gancho sobre o tamanho de sempre (5% da altura).
#
# E multiplicador, e nao pixel: o gancho e desenhado num quadro de 1920 de
# altura no render e numa previa de 300px, e so uma proporcao significa a mesma
# coisa nos dois. A faixa e estreita de proposito — abaixo de 0,7 as 4 a 7
# palavras deixam de ser lidas numa sacada; acima de 1,6 a frase de sete
# palavras passa de tres linhas e invade o video.
TAMANHO_PADRAO = 1.0
TAMANHO_MIN = 0.7
TAMANHO_MAX = 1.6

# D-600: ONDE o gancho senta no quadro, e que largura ele ocupa.
#
# Ate aqui o lugar era lei do codigo: topo da safe zone, centralizado, com 7% de
# margem de cada lado. Isso funcionou enquanto o palco era um so; com arranjos
# diferentes, o ponto fixo cai em cima da cara de alguem num short e sobra
# deserto no seguinte. Quem ve o trecho e o operador, e a decisao de onde a
# promessa cabe e dele.
#
# Guardamos PORCENTAGEM do quadro, e nao pixel, pela mesma razao do `tamanho`: o
# gancho e desenhado num quadro de 1080x1920 no render e numa janela de 220px na
# previa, e so uma proporcao significa a mesma coisa nos dois.
#
# `x` e o CENTRO da caixa e `y` e o TOPO dela. Centro no horizontal porque o
# texto e centralizado e cresce para os dois lados — ancorar pela esquerda faria
# a frase escorregar ao trocar de palavra. Topo no vertical porque o texto cresce
# para BAIXO ao virar tres linhas, e ancorar pelo meio moveria a primeira linha
# a cada palavra digitada.
POSICAO_X_PADRAO = 50.0
POSICAO_Y_PADRAO = 18.0  # a SAFE_ZONE do renderer, que era o valor fixo de antes
LARGURA_PADRAO = 86.0  # 100 - 7 - 7, as margens que o codigo tinha embutidas

# A caixa pode ir quase ate a borda, mas nao PARA FORA dela: um gancho com metade
# das letras cortadas nao e uma escolha editorial, e um render perdido.
POSICAO_X_MIN = 10.0
POSICAO_X_MAX = 90.0
POSICAO_Y_MIN = 0.0
POSICAO_Y_MAX = 88.0

# Abaixo de 25% a frase de sete palavras vira uma coluna de uma palavra por
# linha. Acima de 100% ela sairia do quadro.
LARGURA_MIN = 25.0
LARGURA_MAX = 100.0


# D-594: a familia da fonte e guardada pelo NOME, como a da legenda (D-563) —
# quem desenha e a previa e o Remotion, e o nome ja e o valor nos dois. O teto
# so barra lixo; quem sabe se a familia existe e o renderer, que degrada para a
# do canal quando nao a carregou.
MAX_FONTE = 60


def normalizar_realce(valor: object) -> str:
    """O destaque do gancho, ou o padrao quando o valor nao e um dos conhecidos.

    Degradar, e nao levantar: o catalogo pode encolher entre versoes, e um short
    gravado com um realce que deixou de existir nao pode custar o render. O
    sintoma aceitavel e ele sair com o veu de sempre.

    >>> normalizar_realce('caixa')
    'caixa'
    >>> normalizar_realce('roxo-neon')
    'veu'
    >>> normalizar_realce(None)
    'veu'
    """
    texto = str(valor or "").strip().lower()
    return texto if texto in REALCES else REALCE_PADRAO


def normalizar_cor(valor: object) -> str:
    """O hex da cor do gancho, ou "" para o branco de sempre.

    Guardamos o HEX e nao uma chave de catalogo pelo motivo que a D-563 ja
    registrou na legenda: quem desenha o gancho sao dois lugares — a previa no
    navegador e o Remotion no render — e uma chave obrigaria os dois a manterem
    a mesma tabela de cores. Duas copias da mesma tabela divergem.

    >>> normalizar_cor('#FACC15')
    '#facc15'
    >>> normalizar_cor('facc15')
    '#facc15'
    >>> normalizar_cor('vermelho')
    ''
    """
    texto = str(valor or "").strip().lower().lstrip("#")
    if len(texto) not in (3, 6) or any(c not in "0123456789abcdef" for c in texto):
        return ""
    return f"#{texto}"


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


def normalizar_tamanho(valor: object) -> float:
    """A escala do corpo, encaixada na faixa util. Ausente ou torto = 1.0.

    >>> normalizar_tamanho(1.2)
    1.2
    >>> normalizar_tamanho(9)
    1.6
    >>> normalizar_tamanho(None)
    1.0
    """
    try:
        tamanho = float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return TAMANHO_PADRAO

    if tamanho <= 0:
        return TAMANHO_PADRAO
    return round(min(max(tamanho, TAMANHO_MIN), TAMANHO_MAX), 2)


def _na_faixa(valor: object, padrao: float, minimo: float, maximo: float) -> float:
    """Um numero de layout encaixado na faixa util. Ausente, zero ou torto = padrao.

    Zero cai no padrao de proposito: ele e o "nao decidi" desta demanda inteira,
    igual ao que `tamanho` e `duracao` ja faziam. O topo absoluto do quadro (y=0)
    fica de fora do vocabulario por isso — e como o de fora da safe zone, nao e
    lugar de gancho nenhum.
    """
    try:
        numero = float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return padrao
    if numero <= 0:
        return padrao
    return round(min(max(numero, minimo), maximo), 2)


def normalizar_x(valor: object) -> float:
    """O centro horizontal da caixa, em % da largura. Ausente = centralizado.

    >>> normalizar_x(30)
    30.0
    >>> normalizar_x(120)
    90.0
    >>> normalizar_x(None)
    50.0
    """
    return _na_faixa(valor, POSICAO_X_PADRAO, POSICAO_X_MIN, POSICAO_X_MAX)


def normalizar_y(valor: object) -> float:
    """O topo da caixa, em % da altura. Ausente = o alto da safe zone de sempre.

    >>> normalizar_y(60)
    60.0
    >>> normalizar_y(99)
    88.0
    >>> normalizar_y(None)
    18.0
    """
    return _na_faixa(valor, POSICAO_Y_PADRAO, POSICAO_Y_MIN, POSICAO_Y_MAX)


def normalizar_largura(valor: object) -> float:
    """A largura da caixa, em % da largura do quadro. Ausente = os 86% de sempre.

    >>> normalizar_largura(50)
    50.0
    >>> normalizar_largura(5)
    25.0
    >>> normalizar_largura(None)
    86.0
    """
    return _na_faixa(valor, LARGURA_PADRAO, LARGURA_MIN, LARGURA_MAX)


def normalizar_fonte(valor: object) -> str:
    """O nome da familia, sem espaco nas pontas. "" = a fonte do canal.

    >>> normalizar_fonte('  Anton ')
    'Anton'
    >>> normalizar_fonte(None)
    ''
    """
    return str(valor or "").strip()[:MAX_FONTE]


def normalizar_preset(payload: dict) -> dict:
    """O payload de um preset de GANCHO (D-594), parcial de proposito.

    Vazio e zero significam "este preset nao decide" — e nao "branco" ou "2,5s".
    Materializar os defaults aqui congelaria o sistema do dia em que o preset
    foi salvo, a mesma armadilha que a cascata de layout ja registrou.

    >>> normalizar_preset({'cor': 'FACC15', 'realce': 'caixa', 'tamanho': 1.2})['cor']
    '#facc15'
    >>> normalizar_preset({'y': 60, 'largura': 50})['y']
    60.0
    >>> normalizar_preset({})['largura']
    0.0
    """
    realce = str(payload.get("realce") or "").strip().lower()
    return {
        "cor": normalizar_cor(payload.get("cor")),
        "realce": realce if realce in REALCES else "",
        "fonte": normalizar_fonte(payload.get("fonte")),
        "tamanho": normalizar_tamanho(payload["tamanho"]) if payload.get("tamanho") else 0.0,
        "duracao": normalizar_duracao(payload["duracao"]) if payload.get("duracao") else 0.0,
        # D-600: o lugar tambem e parcial. Um preset salvo antes desta demanda
        # volta com 0 aqui, e 0 significa "este preset nao decide onde" — o
        # gancho continua saindo no ponto fixo de sempre, que e exatamente o
        # comportamento que ele tinha quando foi salvo.
        "x": normalizar_x(payload["x"]) if payload.get("x") else 0.0,
        "y": normalizar_y(payload["y"]) if payload.get("y") else 0.0,
        "largura": normalizar_largura(payload["largura"]) if payload.get("largura") else 0.0,
    }


def aparencia_resolvida(proprio: dict, padrao: dict | None) -> dict:
    """A aparencia do gancho de um short: o que ele decidiu, ou o do corte.

    D-594: o dono do padrao passou a ser o PRESET DE GANCHO escolhido no corte,
    e nao mais o palco (que era o caminho da D-585). Mesma heranca viva: vazio
    no short e "nao decidi", e trocar o padrao reflete na hora em quem nao
    customizou.

    `fonte` e `tamanho` so existem no preset: sao identidade do canal, e dar a
    cada trecho um tamanho proprio seria abrir a porta para oito shorts do mesmo
    corte com oito corpos diferentes.

    O TEXTO fica de fora, e tem de ficar: cada short promete uma coisa.

    D-600: `x`, `y` e `largura` sao a excecao a regra do paragrafo acima — eles
    existem nos DOIS lados. O corpo e a fonte sao identidade do canal e por isso
    moram so no preset; o LUGAR depende do que esta no quadro, e o quadro muda a
    cada trecho. Um palco com a pessoa a esquerda e outro com ela no centro
    pedem ganchos em pontos diferentes do MESMO corte.

    >>> aparencia_resolvida({'cor': '', 'realce': 'caixa', 'ate_seg': 0}, {'cor': '#facc15', 'realce': 'sombra', 'duracao': 3.0})['realce']
    'caixa'
    >>> aparencia_resolvida({'y': 0}, {'y': 60.0})['y']
    60.0
    >>> aparencia_resolvida({'y': 30.0}, {'y': 60.0})['y']
    30.0
    >>> aparencia_resolvida({'cor': '#ff5a72'}, None)['x']
    0.0
    """
    base = padrao or {}
    return {
        "cor": proprio.get("cor") or base.get("cor") or "",
        "realce": proprio.get("realce") or base.get("realce") or "",
        "ate_seg": float(proprio.get("ate_seg") or base.get("duracao") or 0.0),
        "fonte": base.get("fonte") or "",
        "tamanho": float(base.get("tamanho") or 0.0),
        "x": float(proprio.get("x") or base.get("x") or 0.0),
        "y": float(proprio.get("y") or base.get("y") or 0.0),
        "largura": float(proprio.get("largura") or base.get("largura") or 0.0),
    }


def para_payload(
    texto: str,
    ate_seg: object,
    *,
    duracao_short_seg: float,
    cor: object = "",
    realce: object = "",
    fonte: object = "",
    tamanho: object = 0.0,
    x: object = 0.0,
    y: object = 0.0,
    largura: object = 0.0,
) -> dict | None:
    """O gancho como o renderer o consome, ou `None` quando nao ha gancho.

    `None` e uma resposta valida e comum: short sem gancho sai so com video e
    legenda, que e exatamente o que saia antes desta demanda.

    O corte contra a duracao do short existe porque o operador ajusta as bordas
    do trecho DEPOIS de escrever o gancho. Um trecho encurtado para 2s com
    gancho de 2,5s pediria ao Remotion uma sequencia maior que a composicao — e
    o sintoma seria um erro de render, nao um gancho comprido.

    >>> para_payload('ninguem te conta isso', 2.5, duracao_short_seg=30.0)['ateSeg']
    2.5
    >>> para_payload('oi', 2.5, duracao_short_seg=30.0, y=60)['y']
    60.0
    >>> para_payload('oi', 2.5, duracao_short_seg=30.0)['y']
    18.0
    >>> para_payload('  ', 2.5, duracao_short_seg=30.0) is None
    True
    >>> para_payload('oi', 5.0, duracao_short_seg=3.0)['ateSeg']
    3.0
    >>> para_payload('oi', 2.5, duracao_short_seg=9.0, cor='#FACC15')['cor']
    '#facc15'
    """
    limpo = normalizar_gancho(texto)
    if not limpo:
        return None

    ate = normalizar_duracao(ate_seg)
    if duracao_short_seg > 0:
        ate = min(ate, round(float(duracao_short_seg), 2))
    return {
        "texto": limpo,
        "ateSeg": ate,
        # A aparencia chega aqui JA resolvida (`aparencia_resolvida`): quem
        # chama decide a heranca, e este payload so normaliza o que o renderer
        # vai desenhar.
        "cor": normalizar_cor(cor),
        "realce": normalizar_realce(realce),
        "fonte": normalizar_fonte(fonte),
        "tamanho": normalizar_tamanho(tamanho),
        # D-600: o lugar chega aqui ja resolvido, e sai SEMPRE preenchido. O
        # renderer nao deve conhecer a regra de heranca — ele recebe onde
        # desenhar, e os defaults sao os numeros que estavam cravados nele ate
        # esta demanda, entao um short antigo sai pixel a pixel como saia.
        "x": normalizar_x(x),
        "y": normalizar_y(y),
        "largura": normalizar_largura(largura),
    }


# Quantas variacoes o gerador entrega. Seis cabem na tela sem rolagem e ja
# cobrem os angulos possiveis; acima disso a escolha vira trabalho, e o operador
# passa a ler lista em vez de decidir.
MAX_VARIACOES = 6

# Marcadores de lista que o modelo poe mesmo quando o contrato pede uma por
# linha. Tira-los aqui e mais barato que insistir no prompt.
_MARCADORES = ("-", "*", "•", "–", "—")


def ganchos_da_resposta(bruto: str, ja_usados: list[str] | None = None) -> list[str]:
    r"""As variacoes de gancho dentro do que o modelo devolveu.

    Contrato de saida e promessa, nao garantia — a mesma licao que a etiqueta da
    capa aprendeu (D-520). O modelo numera, embrulha em aspas, poe um titulo
    antes da lista ou explica a escolha depois. Sem esta limpeza, "Aqui estao as
    opcoes:" viraria a primeira variacao, e o operador leria isso como um gancho
    que a maquina propos a serio.

    `ja_usados` sao os ganchos que o canal ja gastou. O prompt PEDE para nao
    repeti-los; aqui isso passa a ser garantido — e a diferenca apareceu na
    primeira execucao real: o modelo devolveu um gancho ja usado com a ressalva
    "(ja usado — evitar)" colada no texto. Ele entendeu a regra e escolheu
    COMENTA-LA em vez de obedece-la, e a ressalva iria para a tela como se fosse
    parte da frase.

    Devolve lista VAZIA quando nada aproveitavel voltou: a tela diz que nao saiu
    nada e o operador escreve o dele, que e melhor que oferecer lixo.

    >>> ganchos_da_resposta('o juro trabalha contra voce\nninguem te conta isso')
    ['o juro trabalha contra voce', 'ninguem te conta isso']
    >>> ganchos_da_resposta('1. "primeira aqui"\n2. - segunda aqui')
    ['primeira aqui', 'segunda aqui']
    >>> ganchos_da_resposta('boa frase nova aqui', ja_usados=['BOA FRASE NOVA AQUI'])
    []
    >>> ganchos_da_resposta('   ')
    []
    """
    gastos = {g.strip().lower() for g in (ja_usados or []) if g and g.strip()}
    variacoes: list[str] = []
    for linha in (bruto or "").splitlines():
        limpa = _sem_enfeite(linha)
        if not limpa:
            continue
        if limpa.lower() in gastos:
            continue
        # Duplicata acontece quando o modelo repete a melhor opcao com outra
        # pontuacao. Duas linhas iguais na tela parecem defeito, nao escolha.
        if limpa.lower() in {v.lower() for v in variacoes}:
            continue
        variacoes.append(limpa)
        if len(variacoes) == MAX_VARIACOES:
            break
    return variacoes


def _sem_enfeite(linha: str) -> str:
    """Uma linha da resposta sem numeracao, marcador, aspas ou cerca.

    >>> _sem_enfeite('  3) "o erro que todo mundo comete" ')
    'o erro que todo mundo comete'
    >>> _sem_enfeite('```')
    ''
    """
    texto = (linha or "").strip()
    if not texto or texto.startswith("```"):
        return ""

    # Numeracao: "1.", "2)", "3 -".
    while texto and texto[0].isdigit():
        resto = texto.lstrip("0123456789").lstrip()
        if resto.startswith((".", ")", "-", ":")):
            texto = resto[1:].strip()
        else:
            break

    for marcador in _MARCADORES:
        if texto.startswith(marcador):
            texto = texto[len(marcador) :].strip()

    texto = _sem_ressalva(texto)
    return normalizar_gancho(texto.strip("`\"'“”‘’ "))


def _sem_ressalva(texto: str) -> str:
    """A linha sem o comentario entre parenteses que o modelo cola no fim.

    Num gancho de 4 a 7 palavras o parenteses final e sempre META — "(ja usado)",
    "(mais forte)", "(angulo do custo)" —, nunca parte da frase que vai a tela.
    A skill ja proibe pontuacao decorativa, mas proibir no prompt nao impede: foi
    exatamente assim que o modelo devolveu "... (ja usado — evitar)" na primeira
    execucao real.

    >>> _sem_ressalva('seu financiamento custa o dobro (ja usado)')
    'seu financiamento custa o dobro'
    >>> _sem_ressalva('(so um comentario)')
    ''
    >>> _sem_ressalva('uma frase inteira sem parenteses')
    'uma frase inteira sem parenteses'
    """
    if not texto.endswith(")") or "(" not in texto:
        return texto
    return texto[: texto.rindex("(")].strip()
