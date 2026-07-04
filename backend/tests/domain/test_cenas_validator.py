from app.domain.cenas_validator import (
    calcular_max_simultaneas,
    identificar_cenas_sobrepostas,
    verificar_sobreposicao,
)


def test_verificar_sobreposicao():
    # Sem colisão
    assert not verificar_sobreposicao({"inicio": 0, "fim": 5}, {"inicio": 5, "fim": 10})
    assert not verificar_sobreposicao({"inicio": 5, "fim": 10}, {"inicio": 0, "fim": 5})
    assert not verificar_sobreposicao({"inicio": 10, "fim": 12}, {"inicio": 0, "fim": 5})

    # Colisão parcial
    assert verificar_sobreposicao({"inicio": 0, "fim": 5.1}, {"inicio": 5, "fim": 10})
    assert verificar_sobreposicao({"inicio": 4, "fim": 8}, {"inicio": 0, "fim": 5})

    # Colisão total (aninhada)
    assert verificar_sobreposicao({"inicio": 0, "fim": 10}, {"inicio": 3, "fim": 7})
    assert verificar_sobreposicao({"inicio": 3, "fim": 7}, {"inicio": 0, "fim": 10})


def test_identificar_cenas_sobrepostas():
    cenas = [
        {"inicio": 0, "fim": 5},  # 0
        {"inicio": 4, "fim": 8},  # 1 (sobreposta com 0)
        {"inicio": 10, "fim": 12},  # 2
        {"inicio": 11, "fim": 14},  # 3 (sobreposta com 2)
    ]
    sobrepostas = identificar_cenas_sobrepostas(cenas)
    assert sobrepostas == {0, 1, 2, 3}

    cenas_sem_colisao = [
        {"inicio": 0, "fim": 5},
        {"inicio": 5, "fim": 10},
        {"inicio": 10, "fim": 15},
    ]
    assert identificar_cenas_sobrepostas(cenas_sem_colisao) == set()


def test_calcular_max_simultaneas():
    assert calcular_max_simultaneas([]) == 0

    cenas = [
        {"inicio": 0, "fim": 10},
        {"inicio": 2, "fim": 6},
        {"inicio": 5, "fim": 8},
    ]
    # Entre 5 e 6 temos as 3 ativas
    assert calcular_max_simultaneas(cenas) == 3

    cenas_limite = [
        {"inicio": 0, "fim": 5},
        {"inicio": 5, "fim": 10},
    ]
    assert calcular_max_simultaneas(cenas_limite) == 1
