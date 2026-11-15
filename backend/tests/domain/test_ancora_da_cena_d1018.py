"""D-1018 (RN-43): a cena segue a frase quando o corte muda, e avisa quando a frase sai."""

import json

from app.domain.corte.ancora_da_cena import seguir_recorte

_TEXTO = (
    "um dois três quatro cinco seis sete oito nove dez onze doze treze catorze quinze "
    "dezesseis dezessete dezoito dezenove vinte vinte_e_um vinte_e_dois vinte_e_três"
).split()


def _transcricao(palavras: list[str], passo: float = 1.0, inicio: float = 2.0) -> list[dict]:
    com_tempo = [
        {"texto": palavra, "inicio_seg": round(inicio + i * passo, 2)}
        for i, palavra in enumerate(palavras)
    ]
    return [
        {
            "start": inicio,
            "end": inicio + len(palavras) * passo,
            "texto": " ".join(palavras),
            "palavras": com_tempo,
        }
    ]


def _cena(inicio: float, **campos) -> dict:
    return {"tipo": "enfase", "texto": "Tese", "inicio": inicio, "fim": inicio + 5, **campos}


def _seguir(cenas, antiga, nova):
    saida = seguir_recorte(json.dumps(cenas), json.dumps(antiga), nova)
    return cenas if saida is None else json.loads(saida)


def test_tira_um_trecho_antes_e_a_cena_acompanha_a_frase():
    antiga = _transcricao(_TEXTO)
    # Sai "três quatro cinco": 3 s a menos antes da cena em 12 s (a palavra "onze").
    nova = _transcricao(_TEXTO[:2] + _TEXTO[5:])
    cenas = _seguir([_cena(12.0)], antiga, nova)
    assert cenas[0]["inicio"] == 9.0
    assert cenas[0]["fim"] == 14.0
    assert "ancora_perdida" not in cenas[0]


def test_preserva_o_intervalo_entre_a_cena_e_a_palavra():
    antiga = _transcricao(_TEXTO)
    nova = _transcricao(_TEXTO[:2] + _TEXTO[5:])
    cenas = _seguir([_cena(11.6)], antiga, nova)
    assert cenas[0]["inicio"] == 8.6


def test_atualiza_tambem_inicio_seg_e_fim_seg():
    antiga = _transcricao(_TEXTO)
    nova = _transcricao(_TEXTO[:2] + _TEXTO[5:])
    cenas = _seguir([_cena(12.0, inicio_seg=12.0, fim_seg=17.0)], antiga, nova)
    assert (cenas[0]["inicio_seg"], cenas[0]["fim_seg"]) == (9.0, 14.0)


def test_sem_mudanca_na_fala_nao_ha_o_que_gravar():
    antiga = _transcricao(_TEXTO)
    gravado = json.dumps({"formato": "cortes", "cenas": [_cena(12.0)]})
    assert seguir_recorte(gravado, json.dumps(antiga), antiga) is None


def test_frase_que_saiu_avisa_e_a_cena_fica_onde_estava():
    antiga = _transcricao(_TEXTO)
    # Sai tudo a partir de "nove": a frase da cena em 12 s não existe mais.
    nova = _transcricao(_TEXTO[:7])
    cenas = _seguir([_cena(12.0)], antiga, nova)
    assert cenas[0]["inicio"] == 12.0
    assert cenas[0]["ancora_perdida"] is True
    assert cenas[0]["frase_ancora"]


def test_nunca_apaga_a_cena_que_perdeu_a_frase():
    antiga = _transcricao(_TEXTO)
    cenas = _seguir([_cena(12.0), _cena(4.0)], antiga, _transcricao(_TEXTO[:7]))
    assert len(cenas) == 2


def test_frase_que_volta_devolve_a_cena_e_tira_o_aviso():
    antiga = _transcricao(_TEXTO)
    curta = _transcricao(_TEXTO[:7])
    perdida = _seguir([_cena(12.0)], antiga, curta)
    # O trecho volta (desfez a remoção), um pouco adiantado: a cena vai junto.
    de_volta = _transcricao(_TEXTO[1:])
    cenas = _seguir(perdida, curta, de_volta)
    assert cenas[0]["inicio"] == 11.0
    assert "ancora_perdida" not in cenas[0]
    assert "frase_ancora" not in cenas[0]


def test_corte_no_meio_da_frase_ainda_acha_a_cena():
    antiga = _transcricao(_TEXTO)
    # A palavra da própria cena ("onze") sai, o resto da frase fica.
    nova = _transcricao(_TEXTO[:10] + _TEXTO[11:])
    cenas = _seguir([_cena(12.0)], antiga, nova)
    assert "ancora_perdida" not in cenas[0]
    assert abs(cenas[0]["inicio"] - 12.0) <= 1.0


def test_a_abertura_fica_no_comeco_mesmo_se_a_primeira_frase_sair():
    antiga = _transcricao(_TEXTO)
    nova = _transcricao(_TEXTO[6:], inicio=1.0)
    cenas = _seguir([_cena(0.5)], antiga, nova)
    assert cenas[0]["inicio"] == 0.5
    assert "ancora_perdida" not in cenas[0]


def test_escolhe_a_ocorrencia_mais_proxima_quando_a_frase_se_repete():
    frase = ["a", "b", "c", "d", "e", "f", "g", "h"]
    miolo = [f"x{i}" for i in range(20)]
    palavras = frase + miolo + frase + miolo
    antiga = _transcricao(palavras)
    # Sai um pedaço do primeiro miolo: a cena na 2ª repetição não pode pular para a 1ª.
    nova = _transcricao(frase + miolo[5:] + frase + miolo)
    inicio_segunda = 2.0 + len(frase) + len(miolo)
    cenas = _seguir([_cena(inicio_segunda)], antiga, nova)
    assert cenas[0]["inicio"] == inicio_segunda - 5


def test_mantem_o_payload_e_a_ordem_por_tempo():
    antiga = _transcricao(_TEXTO)
    nova = _transcricao(_TEXTO[:2] + _TEXTO[5:])
    payload = {
        "formato": "cortes",
        "retratos": {"total_fichas": 0},
        "cenas": [_cena(12.0), _cena(4.0)],
    }
    saida = json.loads(seguir_recorte(json.dumps(payload), json.dumps(antiga), nova))
    assert saida["formato"] == "cortes"
    assert saida["retratos"] == {"total_fichas": 0}
    assert [c["inicio"] for c in saida["cenas"]] == sorted(c["inicio"] for c in saida["cenas"])


def test_transcricao_sem_palavras_nao_mexe_nas_cenas():
    gravado = json.dumps([_cena(12.0)])
    antiga = [{"start": 0, "end": 5, "texto": "legado"}]
    nova = [{"start": 0, "end": 4, "texto": "outro"}]
    assert seguir_recorte(gravado, json.dumps(antiga), nova) is None


def test_sem_cenas_devolve_o_que_veio():
    assert seguir_recorte("[]", json.dumps(_transcricao(_TEXTO)), _transcricao(_TEXTO[:5])) is None
    assert seguir_recorte(None, "[]", []) is None


def test_frase_cortada_que_se_repete_depois_avisa_em_vez_de_pular():
    # Caso real: "a agenda dela é agenda do crime" reaparecia 27 s depois do trecho
    # cortado, e a cena pulava para a repetição.
    frase = ["a", "agenda", "dela", "é", "agenda", "do", "crime", "organizado"]
    comeco = [f"antes{i}" for i in range(10)]
    meio = [f"meio{i}" for i in range(10)]
    palavras = comeco + frase + meio + frase + ["fim1", "fim2", "fim3"]
    antiga = _transcricao(palavras)
    nova = _transcricao(comeco + meio + frase + ["fim1", "fim2", "fim3"])
    inicio_da_primeira = 2.0 + len(comeco)
    cenas = _seguir([_cena(inicio_da_primeira)], antiga, nova)
    assert cenas[0]["ancora_perdida"] is True
    assert cenas[0]["inicio"] == inicio_da_primeira


def test_frase_que_volta_nao_pula_para_a_repeticao_que_ja_estava_la():
    frase = ["a", "agenda", "dela", "é", "agenda", "do", "crime", "organizado"]
    comeco = [f"antes{i}" for i in range(10)]
    meio = [f"meio{i}" for i in range(10)]
    fim = frase + ["fim1", "fim2", "fim3"]
    completa = _transcricao(comeco + frase + meio + fim)
    cortada = _transcricao(comeco + meio + fim)
    inicio_da_primeira = 2.0 + len(comeco)
    perdida = _seguir([_cena(inicio_da_primeira)], completa, cortada)
    cenas = _seguir(perdida, cortada, completa)
    assert cenas[0]["inicio"] == inicio_da_primeira
    assert "ancora_perdida" not in cenas[0]


def test_frase_guardada_que_nao_voltou_continua_avisando():
    antiga = _transcricao(_TEXTO)
    curta = _transcricao(_TEXTO[:7])
    perdida = _seguir([_cena(12.0)], antiga, curta)
    cenas = _seguir(perdida, curta, _transcricao(_TEXTO[1:7]))
    assert cenas[0]["ancora_perdida"] is True
    assert cenas[0]["inicio"] == 12.0


def test_cena_depois_da_ultima_palavra_segue_pela_anterior():
    antiga = _transcricao(_TEXTO)
    nova = _transcricao(_TEXTO[:2] + _TEXTO[5:])
    ultima = 2.0 + len(_TEXTO) - 1
    cenas = _seguir([_cena(ultima + 3)], antiga, nova)
    assert cenas[0]["inicio"] == ultima


def test_tirar_e_devolver_o_trecho_varias_vezes_nao_faz_a_cena_andar():
    # Caso real: 326,47 → 326,71 → 327,35. O início tem 2 casas e arredonda para cima
    # da palavra (5,338 vira 5,34), então a palavra da cena ficava para trás a cada volta.
    def com_passo_quebrado(palavras: list[str]) -> list[dict]:
        tempos = [
            {"texto": palavra, "inicio_seg": 2.0 + i * 0.3338} for i, palavra in enumerate(palavras)
        ]
        return [{"start": 2.0, "end": 12.0, "texto": " ".join(palavras), "palavras": tempos}]

    antiga, curta = com_passo_quebrado(_TEXTO), com_passo_quebrado(_TEXTO[:7])
    cenas = [_cena(5.34)]
    tempos = []
    for _ in range(3):
        cenas = _seguir(cenas, antiga, curta)
        assert cenas[0]["ancora_perdida"] is True
        cenas = _seguir(cenas, curta, antiga)
        tempos.append(cenas[0]["inicio"])
    assert tempos == [5.34, 5.34, 5.34]


def test_corte_no_comeco_nunca_deixa_tempo_negativo():
    # Auditoria: mover o início do corte 5 s levava [2,4] e [3,8] a [-3,-1] e [-2,3].
    antiga = _transcricao(_TEXTO)
    nova = _transcricao(_TEXTO[5:], inicio=2.0)
    a, b, c = {**_cena(2.5), "fim": 4.0}, {**_cena(3.0), "fim": 8.0}, _cena(12.0)
    cenas = _seguir([a, b, c], antiga, nova)
    assert all(cena["inicio"] >= 0 and cena["fim"] > cena["inicio"] for cena in cenas)
    por_texto = sorted(cenas, key=lambda cena: cena["fim"])
    assert por_texto[0]["ancora_perdida"] is True  # todas as palavras dela saíram


def test_a_cena_que_sobra_abre_na_palavra_que_ficou():
    antiga = _transcricao(_TEXTO)
    # Saem as 2 primeiras palavras sob a cena em 12 s ("onze doze"); "treze" fica.
    nova = _transcricao(_TEXTO[:10] + _TEXTO[12:])
    cenas = _seguir([_cena(12.0)], antiga, nova)
    assert cenas[0]["inicio"] == 12.0
    assert "ancora_perdida" not in cenas[0]


def test_bloco_que_mudou_de_lugar_leva_a_cena_junto():
    # Auditoria: A B C virando A C B (arranjo de blocos) não era seguido.
    a = [f"a{i}" for i in range(20)]
    b = [f"b{i}" for i in range(10)]
    c = [f"c{i}" for i in range(30)]
    antiga, nova = _transcricao(a + b + c), _transcricao(a + c + b)
    inicio_no_b = 2.0 + 25
    cenas = _seguir([_cena(inicio_no_b)], antiga, nova)
    assert cenas[0]["inicio"] == 2.0 + 55
    assert "ancora_perdida" not in cenas[0]


def test_tres_palavras_iguais_em_trechos_diferentes_nao_alinham():
    comum = ["que", "eu", "tô"]
    antes = [f"x{i}" for i in range(12)]
    depois = [f"y{i}" for i in range(12)]
    tirado = comum + [f"z{i}" for i in range(9)]
    novo_meio = [f"w{i}" for i in range(9)] + comum
    antiga = _transcricao(antes + tirado + depois)
    nova = _transcricao(antes + novo_meio + depois)
    cenas = _seguir([_cena(2.0 + len(antes))], antiga, nova)
    assert cenas[0]["ancora_perdida"] is True


def test_cena_que_chega_ao_comeco_nao_fica_presa_ao_desfazer():
    # Auditoria: caindo em até 1 s, ela virava "abertura" e nunca mais saía de lá.
    antiga = _transcricao(_TEXTO, inicio=0.5)
    nova = _transcricao(_TEXTO[10:], inicio=0.5)
    inicio_original = 0.5 + 10
    movida = _seguir([_cena(inicio_original)], antiga, nova)
    assert movida[0]["inicio"] > 1.0
    de_volta = _seguir(movida, nova, antiga)
    assert abs(de_volta[0]["inicio"] - inicio_original) <= 1.0


def test_frase_guardada_nao_volta_por_coincidencia_de_poucas_palavras():
    frase = ["a", "b", "c", "d", "e", "f", "g", "h"]
    cena = {**_cena(30.0), "ancora_perdida": True, "frase_ancora": " ".join(frase)}
    fica = [f"x{i}" for i in range(10)]
    antiga = _transcricao(fica)
    nova = _transcricao(fica + ["a", "b", "c", "d", "outra", "coisa"])
    cenas = _seguir([cena], antiga, nova)
    assert cenas[0]["ancora_perdida"] is True
    assert cenas[0]["inicio"] == 30.0


def test_frase_guardada_curta_demais_nao_volta():
    cena = {**_cena(30.0), "ancora_perdida": True, "frase_ancora": "sim"}
    fica = [f"x{i}" for i in range(10)]
    cenas = _seguir([cena], _transcricao(fica), _transcricao(fica + ["sim"]))
    assert cenas[0]["ancora_perdida"] is True


def test_dado_fora_do_formato_nao_derruba_a_sincronia():
    antiga, nova = _transcricao(_TEXTO), _transcricao(_TEXTO[:5])
    assert seguir_recorte("{quebrado", json.dumps(antiga), nova) is None
    assert seguir_recorte(json.dumps([_cena(12.0)]), "{quebrado", nova) is None
    saida = json.loads(
        seguir_recorte(json.dumps(["texto solto", _cena(4.0)]), json.dumps(antiga), nova)
    )
    assert "texto solto" in saida
    assert len(saida) == 2
