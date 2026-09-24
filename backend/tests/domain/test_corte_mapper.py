from app.domain.corte.corte_mapper import (
    cenas_fora_do_corte,
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


# --- cenas com tempo fora do corte (regressao do roteiro visual absoluto) ---
#
# Cortes de agosto/2026 sairam com metade das cenas gravadas no tempo ABSOLUTO
# da live: o corte 1342,7s->2323,0s tinha cenas de 1370s a 2294s convivendo com
# cenas relativas de 2s a 576s. A timeline do editor faz max(duracao, maiorFim)
# e esticava para 38:14 num video de 9 min, que rodava vazio depois do fim.


def test_cenas_fora_do_corte_ignora_cenas_dentro():
    cenas = [{"inicio": 2.24, "fim": 6.24}, {"inicio": 569.05, "fim": 576.05}]
    assert cenas_fora_do_corte(cenas, 980.3) == []


def test_cenas_fora_do_corte_acusa_tempo_absoluto_da_live():
    # 1370,88 e a posicao na live (corte comeca em 1342,7): rel = 28,2s.
    cenas = [{"inicio": 2.24, "fim": 6.24}, {"inicio": 1370.88, "fim": 1375.88}]
    fora = cenas_fora_do_corte(cenas, 980.3)
    assert len(fora) == 1
    assert fora[0]["indice"] == 1
    assert fora[0]["inicio"] == 1370.88


def test_cenas_fora_do_corte_reporta_todas_as_infratoras():
    cenas = [{"inicio": 10.0, "fim": 15.0}] + [
        {"inicio": t, "fim": t + 5.0} for t in (1370.88, 1439.4, 2290.04)
    ]
    fora = cenas_fora_do_corte(cenas, 980.3)
    assert [c["indice"] for c in fora] == [1, 2, 3]


def test_cenas_fora_do_corte_tolera_ultima_cena_estourando_o_fim():
    # A ultima cena ganha duracao fixa e pode passar do ultimo segmento de fala;
    # isso nao e defeito enquanto o INICIO estiver dentro do corte.
    cenas = [{"inicio": 975.0, "fim": 981.0}]
    assert cenas_fora_do_corte(cenas, 980.3) == []


def test_cenas_fora_do_corte_acusa_fim_muito_alem_da_tolerancia():
    cenas = [{"inicio": 900.0, "fim": 1500.0}]
    assert len(cenas_fora_do_corte(cenas, 980.3)) == 1


def test_cenas_fora_do_corte_sem_duracao_nao_acusa():
    # Sem referencia de duracao nao ha como julgar — nunca acusa por falta dela.
    cenas = [{"inicio": 1370.88, "fim": 1375.88}]
    assert cenas_fora_do_corte(cenas, 0.0) == []
    assert cenas_fora_do_corte(cenas, -1.0) == []


def test_cenas_fora_do_corte_usa_chaves_seg_como_o_normalizador():
    cenas = [{"inicio_seg": 1370.88, "fim_seg": 1375.88}]
    assert len(cenas_fora_do_corte(cenas, 980.3)) == 1


def test_cenas_fora_do_corte_ignora_itens_nao_dict():
    assert cenas_fora_do_corte(["lixo", None, {"inicio": 5.0, "fim": 9.0}], 980.3) == []
