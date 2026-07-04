from app.domain.corte_mapper import (
    coalescer_chaves_mascote,
    extrair_cenas_remotion,
    normalizar_cena_remotion,
    normalizar_cenas_remotion_payload,
    primeiro_numero_valido,
    tem_colapso_de_tempos_das_cenas,
)


def test_coalescer_chaves_mascote_traduz_legado_sapo():
    # D-186: cena antiga salva com sapoMood/sapoPosicao/sapoTamanho é lida com as
    # chaves novas mascot*, sem deixar a chave legada vazar.
    cena = coalescer_chaves_mascote(
        {"sapoMood": "investigador", "sapoPosicao": "tr", "sapoTamanho": "medio"}
    )
    assert cena["mascotMood"] == "investigador"
    assert cena["mascotPosicao"] == "tr"
    assert cena["mascotTamanho"] == "medio"
    assert "sapoMood" not in cena
    assert "sapoPosicao" not in cena
    assert "sapoTamanho" not in cena


def test_coalescer_chaves_mascote_preserva_chave_nova():
    # Quando a chave nova já existe, o legado não a sobrescreve.
    cena = coalescer_chaves_mascote({"mascotMood": "serio", "sapoMood": "animado"})
    assert cena["mascotMood"] == "serio"
    assert "sapoMood" not in cena


def test_normalizar_cena_remotion_back_compat_mascote_legado():
    # Um corte gerado ANTES do rename (sapoMood no banco) resolve o mood igual
    # ao passar pela normalização de leitura — sem migração de banco.
    cena = normalizar_cena_remotion(
        {"inicio": 10, "fim": 15, "tipo": "card_informacao", "sapoMood": "pensativo"}
    )
    assert cena["mascotMood"] == "pensativo"
    assert "sapoMood" not in cena


def test_primeiro_numero_valido():
    # Pula valores não-convertíveis até achar o primeiro float válido
    assert primeiro_numero_valido(None, "x", "3.5") == 3.5
    # Sem nenhum válido cai no fallback
    assert primeiro_numero_valido(None, "x", fallback=7.0) == 7.0
    # NaN é descartado
    assert primeiro_numero_valido(float("nan"), 2.0) == 2.0


def test_normalizar_cena_remotion_preenche_inicio_e_fim():
    cena = normalizar_cena_remotion({"inicio": 10, "fim": 15, "tipo": "padrao"})
    assert cena["inicio"] == cena["inicio_seg"] == 10.0
    assert cena["fim"] == cena["fim_seg"] == 15.0


def test_normalizar_cena_remotion_fim_invalido_vira_inicio_mais_5():
    cena = normalizar_cena_remotion({"inicio_seg": 20, "fim_seg": 18})
    assert cena["inicio"] == 20.0
    assert cena["fim"] == 25.0


def test_normalizar_cena_remotion_tela_cheia_vira_card():
    cena = normalizar_cena_remotion({"inicio": 0, "fim": 5, "tipo": "tela_cheia"})
    assert cena["modelo_cena"] == "card"


def test_normalizar_cenas_remotion_payload_aceita_lista_e_dict():
    lista = normalizar_cenas_remotion_payload([{"inicio": 1, "fim": 4}])
    assert lista[0]["fim_seg"] == 4.0

    payload = normalizar_cenas_remotion_payload({"cenas": [{"inicio": 2, "fim": 6}], "meta": 1})
    assert payload["meta"] == 1
    assert payload["cenas"][0]["inicio_seg"] == 2.0


def test_extrair_cenas_remotion():
    assert extrair_cenas_remotion([{"a": 1}]) == [{"a": 1}]
    assert extrair_cenas_remotion({"cenas": [{"a": 1}]}) == [{"a": 1}]
    assert extrair_cenas_remotion({"sem_cenas": True}) == []


def test_tem_colapso_de_tempos_das_cenas():
    # Maioria das cenas com mesmo (inicio, fim) → colapso
    colapsadas = [{"inicio": 0, "fim": 5} for _ in range(4)]
    assert tem_colapso_de_tempos_das_cenas(colapsadas)

    # Tempos distintos → sem colapso
    variadas = [{"inicio": i, "fim": i + 5} for i in range(4)]
    assert not tem_colapso_de_tempos_das_cenas(variadas)

    # Menos de 3 cenas nunca é colapso
    assert not tem_colapso_de_tempos_das_cenas([{"inicio": 0, "fim": 5}, {"inicio": 0, "fim": 5}])
