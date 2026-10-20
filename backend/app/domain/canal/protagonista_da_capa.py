"""Quem protagoniza as capas do canal: o mascote OU o apresentador (D-909).

## Nunca os dois

Com o mascote, o apresentador e a pessoa citada no corte, a capa tinha "muita
coisa brigando". O canal escolhe um protagonista, e o outro sai da capa
inteira: do prompt e dos anexos que o robô manda ao ChatGPT.

## Reversível sem reescrever skill

O modo é uma chave do canal, e não um corpo de skill. O serviço injeta um bloco
`MODO DA CAPA: ...` no prompt de cada capa, e a skill tem uma seção para cada
modo. Voltar ao mascote é trocar a chave: nada se perde, nada se reescreve.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Literal, get_args

from app.domain.canal.fotos_do_apresentador import MARCA_DA_LINHA, MAXIMO_DE_FOTOS_POR_CAPA
from app.domain.compartilhado.chatgpt_imagem import MARCA_DA_EXPRESSAO_DO_APRESENTADOR
from app.domain.compartilhado.erros import PedidoInvalido

Protagonista = Literal["mascote", "apresentador"]
PROTAGONISTAS: tuple[str, ...] = get_args(Protagonista)
# O canal nasce como sempre foi: o mascote no centro.
PROTAGONISTA_PADRAO: Protagonista = "mascote"


def protagonista_valido(valor: str) -> Protagonista:
    """O protagonista pedido, ou `PedidoInvalido`.

    >>> protagonista_valido(" Apresentador ")
    'apresentador'
    """
    normalizado = (valor or "").strip().casefold()
    if normalizado not in PROTAGONISTAS:
        raise PedidoInvalido(f"Protagonista da capa deve ser {' ou '.join(PROTAGONISTAS)}.")
    return normalizado  # type: ignore[return-value]


def bloco_do_modo(protagonista: Protagonista, *, mascote: str, expressoes: Sequence[str]) -> str:
    """O bloco que abre o prompt de cada capa e diz à skill qual seção seguir.

    `expressoes` são os rótulos do banco de fotos do apresentador: o Capista
    escolhe entre elas, e o casamento com os arquivos fica exato.
    """
    mascote = mascote or "mascote"
    if protagonista == "mascote":
        return (
            "=== MODO DA CAPA: mascote ===\n"
            f'Siga a seção "MODO mascote" da skill: o {mascote} é o protagonista desta capa, '
            "como sempre.\n\n"
        )
    disponiveis = (
        ", ".join(expressoes)
        if expressoes
        else "(o banco de fotos ainda está vazio: escolha as expressões que o corte pede)"
    )
    return (
        "=== MODO DA CAPA: apresentador ===\n"
        'Siga a seção "MODO apresentador" da skill. O protagonista desta capa é o '
        "APRESENTADOR da live, e o robô anexa imagens reais dele como referência de rosto: "
        "quadros da própria live no momento em que ele diz a frase da capa, junto das fotos "
        "do banco. Escreva a cara dele numa linha própria, começando por "
        f"{MARCA_DA_EXPRESSAO_DO_APRESENTADOR}, e só nela: com os quadros, o robô troca essa "
        "linha pela expressão real que eles mostram. "
        # D-962: a capa saía desafiadora, de clickbait, ao lado de convidados sóbrios.
        "A cara dele é humana e contida, a de quem conversa com o público: nada de olhos "
        "arregalados, sobrancelhas arqueadas, bochechas infladas, olhar desafiador ou careta "
        "de desenho animado — nem na pose, nem nas tags, nem na descrição do personagem. "
        f"O {mascote} NÃO entra nesta capa: nem como protagonista, nem como coadjuvante, "
        f"nem citado no prompt final; as regras da skill sobre o {mascote} não valem aqui. "
        "Pessoas citadas no corte continuam podendo aparecer. "
        # D-974: o Gemini vestiu o apresentador com a jaqueta do mascote, copiada do YouTube.
        f"Se o PROMPT DA THUMBNAIL DO YOUTUBE trouxer o {mascote}, ele foi escrito em outro "
        "modo, e o personagem dele não é o apresentador: herde dali só paleta, luz e registro "
        f"da ilustração, nunca a aparência nem a roupa do {mascote}. Rosto e roupa do "
        "apresentador vêm das imagens anexadas.\n"
        "Na primeira linha da resposta (logo depois da linha [VARIATION_TAGS], quando ela "
        "existir), escreva uma linha exatamente neste formato:\n"
        f'{MARCA_DA_LINHA}="expressão 1, expressão 2"]\n'
        f"com 1 a {MAXIMO_DE_FOTOS_POR_CAPA} expressões do apresentador que combinam com o "
        f"momento do corte, escolhidas desta lista: {disponiveis}.\n\n"
    )


# O que sai antes da busca, nesta ordem:
# - os trechos citados, porque a frase da capa vai entre aspas e pode trazer a
#   palavra ("CHEGA DE ENGOLIR SAPO"). Mesmo padrão da D-587 em domain/short/capa_short.py,
#   copiado porque os dois domínios não se importam;
# - a lista do que evitar: "Avoid"/"Exclude" no começo da linha, ou o cabeçalho com
#   dois-pontos em qualquer lugar ("Avoid:", "Negative prompt:"), até o fim da frase;
#   os itens "- frog" abaixo dele só quando o cabeçalho termina a linha;
# - cada negação solta ("no frog or mascot", "don't include the Sapo", "sem sapo"):
#   o termo negado, até duas palavras antes dele que não sejam conjunção, e os
#   coordenados: colados por vírgula ou barra ("no Sapo, frog/mascot"), ou por
#   "or"/"and" com até duas palavras antes ("or any cartoon frog"). Citar o mascote
#   para proibi-lo é o que a skill pede.
# As duas borrachas são estreitas de propósito: largas, apagavam junto o mascote que
# vinha depois ("no tie and the Sapo frog", "no frog, the Sapo stands behind").
_TRECHOS_CITADOS = re.compile(r"\"[^\"]*\"|“[^”]*”|«[^»]*»|(?<!\w)'[^']*'(?!\w)")
_LISTA_DO_QUE_EVITAR = re.compile(
    r"(?:^[ \t]*[-*•]?[ \t]*(?:avoid|exclude)(?!\w)[ \t]*:?"
    r"|(?<!\w)(?:avoid|exclude|negative(?: prompt)?)[ \t]*:)"
    r"(?:[ \t]*(?:\n[ \t]*[-*•][^\n]*)+|(?:[^.\n]|\.(?=\S))*)",
    re.IGNORECASE | re.MULTILINE,
)
_PALAVRA_NEGADORA = r"(?:no|not|nor|without|never|avoid|exclude|excluding|sem|\w*n['’]t)"
_PALAVRA_SEM_CONJUNCAO = r"(?!(?:and|or|but|with|nor|e|ou|com)(?!\w))[\w'’-]+"
_TERMOS_DO_MASCOTE = ("frogs?", "mascots?")


def mascote_descrito(prompt: str, *, mascote: str) -> list[str]:
    """Os termos com que o prompt DESCREVE o mascote, fora da lista do que evitar (D-974).

    No modo apresentador o mascote não entra na capa, mas o modelo às vezes segue
    o prompt do YouTube e a skill, que falam dele, e ignora o bloco do modo. A
    trava é do código: lista vazia é prompt limpo.

    >>> mascote_descrito("The Sapo, a frog, behind the host.", mascote="Sapo")
    ['frog', 'sapo']
    >>> mascote_descrito("Host alone. No Sapo, no frog, no mascot.", mascote="Sapo")
    []
    """
    nome = [re.escape(mascote.strip())] if mascote.strip() else []
    # Lookarounds, e não fronteira de palavra: o nome pode terminar em símbolo ("Robo-X!").
    termo = rf"(?:{'|'.join([*nome, *_TERMOS_DO_MASCOTE])})(?!\w)"
    negacao = re.compile(
        rf"(?<!\w){_PALAVRA_NEGADORA}\s+(?:{_PALAVRA_SEM_CONJUNCAO}\s+){{0,2}}{termo}"
        rf"(?:\s*[,/]\s*{termo}"
        rf"|\s*,?\s+(?:or|nor|and|ou|e)\s+(?:{_PALAVRA_SEM_CONJUNCAO}\s+){{0,2}}{termo})*",
        re.IGNORECASE,
    )
    texto = _TRECHOS_CITADOS.sub(" ", prompt or "")
    texto = negacao.sub(" ", _LISTA_DO_QUE_EVITAR.sub(" ", texto))
    achados = re.finditer(rf"(?<!\w){termo}", texto, re.IGNORECASE)
    return sorted({achado.group(0).casefold() for achado in achados})


def aviso_de_mascote_na_capa(termos: Sequence[str], *, mascote: str) -> str:
    """O aviso que abre a nova tentativa depois de um prompt recusado (D-974)."""
    mascote = mascote or "mascote"
    return (
        "=== RESPOSTA ANTERIOR RECUSADA ===\n"
        f"Sua resposta anterior descreveu o {mascote} na imagem ({', '.join(termos)}). "
        f"No MODO apresentador o {mascote} não aparece: nem como protagonista, nem como "
        "coadjuvante, nem como segunda figura, mesmo que a skill e o prompt do YouTube "
        f"falem dele. Reescreva o prompt inteiro sem ele; o nome {mascote}, frog e mascot "
        "só podem aparecer na lista do que evitar (no frog, no mascot).\n\n"
    )
