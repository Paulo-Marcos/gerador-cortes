"""A regra pura das cenas manuais numa geração nova (D-1075, RN-39)."""

import json

from app.domain.corte.cenas_manuais import encaixar_em_volta_das_manuais, ler_as_manuais


def _cena(texto: str, inicio: float, fim: float, **extra) -> dict:
    return {"tipo": "enfase", "texto": texto, "inicio": inicio, "fim": fim, **extra}


def _manual(texto: str, inicio: float, fim: float, **extra) -> dict:
    return _cena(texto, inicio, fim, manual=True, **extra)


def _textos(cenas: list[dict]) -> list[str]:
    return [cena["texto"] for cena in cenas]


# ─── quais são as manuais do plano gravado ───────────────────────────────────


def test_as_manuais_saem_do_plano_gravado_como_estao():
    manual = _manual("Minha", 10, 14, riscada=True, retrato_url="/r.jpg")
    gravado = json.dumps({"formato": "cortes", "cenas": [_cena("Da IA", 0, 3), manual]})

    assert ler_as_manuais(gravado) == [manual]


def test_o_plano_antigo_em_lista_tambem_tem_manuais():
    manual = _manual("Minha", 10, 14)

    assert ler_as_manuais(json.dumps([manual, _cena("Da IA", 0, 3)])) == [manual]


def test_so_manual_true_conta_como_manual():
    gravado = json.dumps([_cena("Falso", 0, 3, manual=False), _cena("Sem marca", 5, 8)])

    assert ler_as_manuais(gravado) == []


def test_plano_vazio_ou_fora_do_formato_nao_tem_manuais():
    for gravado in (None, "", "[]", "{", '"texto"', '{"cenas": "x"}'):
        assert ler_as_manuais(gravado) == [], gravado


# ─── encaixar as geradas em volta ────────────────────────────────────────────


def test_a_manual_fica_intacta_e_as_da_ia_entram_em_volta():
    manual = _manual("Minha", 10, 14, riscada=False, cor="#fff")

    plano = encaixar_em_volta_das_manuais([_cena("Antes", 0, 3), _cena("Depois", 20, 23)], [manual])

    assert plano.cenas == [_cena("Antes", 0, 3), manual, _cena("Depois", 20, 23)]
    assert plano.cenas[1] is manual
    assert plano.descartadas == 0


def test_a_da_ia_que_se_sobrepoe_a_manual_e_descartada():
    manuais = [_manual("Minha", 10, 14)]
    geradas = [
        _cena("Começa dentro", 12, 16),
        _cena("Acaba dentro", 8, 11),
        _cena("Cobre a manual", 9, 15),
        _cena("Dentro dela", 11, 13),
        _cena("Longe", 30, 33),
    ]

    plano = encaixar_em_volta_das_manuais(geradas, manuais)

    assert _textos(plano.cenas) == ["Minha", "Longe"]
    assert plano.descartadas == 4


def test_encostar_nao_e_sobrepor():
    geradas = [_cena("Acaba quando ela começa", 7, 10), _cena("Começa quando ela acaba", 14, 17)]

    plano = encaixar_em_volta_das_manuais(geradas, [_manual("Minha", 10, 14)])

    assert _textos(plano.cenas) == ["Acaba quando ela começa", "Minha", "Começa quando ela acaba"]
    assert plano.descartadas == 0


def test_a_manual_riscada_continua_riscada_e_tambem_barra():
    """Riscada sai do vídeo, mas o "Trazer de volta" a põe de novo: a IA não ocupa o lugar."""
    riscada = _manual("Riscada", 10, 14, riscada=True)

    plano = encaixar_em_volta_das_manuais([_cena("Em cima", 11, 13)], [riscada])

    assert plano.cenas == [riscada]
    assert plano.descartadas == 1


def test_o_plano_sai_ordenado_por_inicio():
    manuais = [_manual("M2", 40, 44), _manual("M1", 10, 14)]
    geradas = [_cena("G3", 50, 53), _cena("G1", 0, 3), _cena("G2", 20, 23)]

    plano = encaixar_em_volta_das_manuais(geradas, manuais)

    assert _textos(plano.cenas) == ["G1", "M1", "G2", "M2", "G3"]


def test_o_tempo_em_inicio_seg_tambem_vale():
    """A cena gravada pode trazer o tempo só em `inicio_seg`/`fim_seg` (o formato do render)."""
    manual = {"tipo": "enfase", "texto": "Minha", "inicio_seg": 10, "fim_seg": 14, "manual": True}

    plano = encaixar_em_volta_das_manuais([_cena("Em cima", 12, 15)], [manual])

    assert plano.cenas == [manual]
    assert plano.descartadas == 1


def test_sem_manuais_a_geracao_entra_inteira():
    geradas = [_cena("A", 0, 3), _cena("B", 5, 8)]

    plano = encaixar_em_volta_das_manuais(geradas, [])

    assert plano.cenas == geradas
    assert plano.descartadas == 0


def test_nao_mexe_nas_listas_recebidas():
    geradas, manuais = [_cena("Em cima", 11, 13)], [_manual("Minha", 10, 14)]
    copia_geradas, copia_manuais = json.dumps(geradas), json.dumps(manuais)

    encaixar_em_volta_das_manuais(geradas, manuais)

    assert (json.dumps(geradas), json.dumps(manuais)) == (copia_geradas, copia_manuais)
