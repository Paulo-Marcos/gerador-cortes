"""D-448: ordem canônica dos cortes de uma live — cronológica por padrão.

O `numero` do corte é a posição que a UI, o export e a série de metadados leem.
Ele nascia na CRIAÇÃO (`max(numero) + 1`), então todo corte que aparecia depois
— o criado a partir de um desvio, o da 2ª passada da análise — ia parar no fim
da lista mesmo começando aos 12 minutos da live. A ordem virava histórico de
criação, não linha do tempo.

Aqui o `numero` volta a significar POSIÇÃO CRONOLÓGICA: a ordem é derivada de
`inicio_seg` e recalculada depois de cada operação que cria ou move corte. Sair
dessa ordem passa a ser um ato explícito — `posicao_fixada` (o pin), gravado
quando o editor move o corte na mão. Sem pin, nenhum corte fica fora de lugar.

Sem I/O: só a matemática da ordem. Quem lê e grava é o `CorteService`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CorteOrdenavel:
    """O mínimo que um corte precisa expor para ser ordenado.

    `posicao_fixada` é 1-based (a posição que o editor escolheu) ou `None` para
    o caso normal — seguir o tempo.
    """

    id: str
    inicio_seg: float
    posicao_fixada: int | None = None


def _cronologicos(itens: list[CorteOrdenavel]) -> list[CorteOrdenavel]:
    """Todos por tempo de início; o `id` desempata para a ordem ser estável."""
    return sorted(itens, key=lambda c: (float(c.inicio_seg or 0.0), c.id))


def _primeiro_slot_livre(preferido: int, ocupados: set[int], total: int) -> int:
    """Slot 0-based livre mais próximo de `preferido`, procurando para a frente.

    Pin colidido não é erro a propagar: dois cortes podem acabar apontando para a
    mesma posição depois que um corte no meio é deletado. Empurrar para o slot
    seguinte preserva a intenção ("este vem antes daquele") sem derrubar a lista.
    """
    alvo = max(0, min(preferido, total - 1))
    for slot in range(alvo, total):
        if slot not in ocupados:
            return slot
    for slot in range(alvo - 1, -1, -1):
        if slot not in ocupados:
            return slot
    raise ValueError("Não há slot livre — a lista de cortes está inconsistente.")


def ordenar_por_tempo(itens: list[CorteOrdenavel]) -> list[str]:
    """Ids na ordem final: cronológica, com os cortes fixados em suas posições.

    Os fixados são colocados primeiro (na ordem do pin); os demais preenchem os
    slots que sobraram, mantendo entre si a ordem do tempo.

    Exemplo:
        >>> ordenar_por_tempo([
        ...     CorteOrdenavel("b", 200.0),
        ...     CorteOrdenavel("a", 100.0),
        ...     CorteOrdenavel("c", 300.0, posicao_fixada=1),
        ... ])
        ['c', 'a', 'b']
    """
    total = len(itens)
    if total == 0:
        return []

    slots: list[str | None] = [None] * total
    ocupados: set[int] = set()

    fixados = [c for c in itens if c.posicao_fixada is not None]
    for corte in sorted(fixados, key=lambda c: (c.posicao_fixada, float(c.inicio_seg or 0.0))):
        slot = _primeiro_slot_livre(int(corte.posicao_fixada) - 1, ocupados, total)
        slots[slot] = corte.id
        ocupados.add(slot)

    livres = (c.id for c in _cronologicos(itens) if c.posicao_fixada is None)
    for slot in range(total):
        if slots[slot] is None:
            slots[slot] = next(livres)

    return [id_ for id_ in slots if id_ is not None]


def pins_para_ordem(
    itens: list[CorteOrdenavel], ordem_desejada: list[str]
) -> dict[str, int | None]:
    """Os pins MÍNIMOS que fazem `ordenar_por_tempo` reproduzir `ordem_desejada`.

    É o que traduz o gesto do editor (mover um corte na lista) para o dado
    persistido. "Mínimos" é a parte que importa: a API recebe só a lista final,
    então não dá para saber quem foi arrastado — mas dá para fixar apenas quem
    PRECISA estar fixo. Mover um corte para cima empurra os vizinhos; se os
    vizinhos empurrados também fossem fixados, a lista congelaria inteira e o
    próximo corte a nascer iria parar no fim de novo — exatamente o defeito que
    o D-448 corrige.

    O conjunto a manter livre é a maior subsequência da ordem pedida que já
    respeita o tempo (LIS por posição cronológica); todo o resto vira pin. Os
    livres, ordenados por tempo, caem exatamente nos slots que sobraram.

    Exemplo:
        >>> itens = [CorteOrdenavel("a", 100.0), CorteOrdenavel("b", 200.0)]
        >>> pins_para_ordem(itens, ["b", "a"])
        {'b': 1, 'a': None}
    """
    posicao_cronologica = {corte.id: indice for indice, corte in enumerate(_cronologicos(itens))}
    ranks = [posicao_cronologica.get(corte_id, 0) for corte_id in ordem_desejada]
    livres = _maior_subsequencia_crescente(ranks)
    return {
        corte_id: (None if indice in livres else indice + 1)
        for indice, corte_id in enumerate(ordem_desejada)
    }


def _maior_subsequencia_crescente(valores: list[int]) -> set[int]:
    """Índices da maior subsequência estritamente crescente de `valores`.

    Empate resolvido pelo índice MAIS TARDIO (tanto no fim quanto no
    predecessor). Isso importa no caso simétrico: trocar dois cortes de lugar
    admite duas soluções mínimas — fixar o de cima ou o de baixo — e a certa é
    fixar o que o editor puxou para cima, que é o que aparece ANTES do seu lugar
    cronológico. Preferir o índice tardio deixa a cauda intocada livre.

    O(n²) de propósito: a lista é de cortes de uma live (dezenas), e a versão
    quadrática cabe em quinze linhas legíveis.
    """
    if not valores:
        return set()

    comprimento = [1] * len(valores)
    anterior = [-1] * len(valores)
    for fim in range(len(valores)):
        for inicio in range(fim):
            if valores[inicio] < valores[fim] and comprimento[inicio] + 1 >= comprimento[fim]:
                comprimento[fim] = comprimento[inicio] + 1
                anterior[fim] = inicio

    maior = max(comprimento)
    indice = len(comprimento) - 1 - comprimento[::-1].index(maior)
    escolhidos: set[int] = set()
    while indice != -1:
        escolhidos.add(indice)
        indice = anterior[indice]
    return escolhidos
