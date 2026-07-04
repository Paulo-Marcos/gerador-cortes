def verificar_sobreposicao(a: dict, b: dict) -> bool:
    """Verifica se duas cenas têm sobreposição temporal.

    Exemplo:
    >>> verificar_sobreposicao({"inicio": 0, "fim": 5}, {"inicio": 4, "fim": 8})
    True
    """
    inicio_a = float(a.get("inicio", 0))
    fim_a = float(a.get("fim", 0))
    inicio_b = float(b.get("inicio", 0))
    fim_b = float(b.get("fim", 0))
    return inicio_a < fim_b and inicio_b < fim_a


def identificar_cenas_sobrepostas(cenas: list[dict]) -> set[int]:
    """Retorna os índices das cenas que possuem alguma sobreposição temporal."""
    sobrepostas = set()
    n = len(cenas)
    for i in range(n):
        for j in range(i + 1, n):
            if verificar_sobreposicao(cenas[i], cenas[j]):
                sobrepostas.add(i)
                sobrepostas.add(j)
    return sobrepostas


def calcular_max_simultaneas(cenas: list[dict]) -> int:
    """Calcula o número máximo de cenas simultâneas em qualquer ponto."""
    if not cenas:
        return 0

    eventos = []
    for cena in cenas:
        eventos.append((float(cena.get("inicio", 0)), 1))
        eventos.append((float(cena.get("fim", 0)), -1))

    # Ordena eventos: encerramentos (-1) antes de aberturas (1) se empatados no tempo
    eventos.sort(key=lambda x: (x[0], x[1]))

    atual = 0
    maximo = 0
    for _, tipo in eventos:
        atual += tipo
        if atual > maximo:
            maximo = atual

    return maximo
