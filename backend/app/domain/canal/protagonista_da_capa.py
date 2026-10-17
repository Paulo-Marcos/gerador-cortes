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
        "Pessoas citadas no corte continuam podendo aparecer.\n"
        "Na primeira linha da resposta (logo depois da linha [VARIATION_TAGS], quando ela "
        "existir), escreva uma linha exatamente neste formato:\n"
        f'{MARCA_DA_LINHA}="expressão 1, expressão 2"]\n'
        f"com 1 a {MAXIMO_DE_FOTOS_POR_CAPA} expressões do apresentador que combinam com o "
        f"momento do corte, escolhidas desta lista: {disponiveis}.\n\n"
    )
