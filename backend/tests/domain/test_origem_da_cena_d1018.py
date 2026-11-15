"""D-1018 (RN-42): a conferência da origem avisa e nunca reescreve. Os casos são os erros medidos em cenas reais."""

import copy

from app.domain.corte.origem_da_cena import CONTRATO_DA_ORIGEM, conferir_cenas


def _fala(texto: str, inicio: float = 10.0) -> list[dict]:
    palavras = [
        {"texto": palavra, "inicio_seg": round(inicio + i * 0.4, 2)}
        for i, palavra in enumerate(texto.split())
    ]
    return [{"start": inicio, "end": inicio + 30, "texto": texto, "palavras": palavras}]


def _codigos(cena: dict, fala: list[dict]) -> list[str]:
    return [aviso["codigo"] for aviso in conferir_cenas([cena], fala)]


def _cena(tipo: str, **campos) -> dict:
    return {"tipo": tipo, "inicio": 12.0, "fim": 18.0, **campos}


def test_numero_sem_frase_nem_fonte_avisa():
    assert _codigos(_cena("destaque_numerico", numero="50x"), _fala("qualquer coisa")) == [
        "sem_fonte"
    ]


def test_numero_dito_na_frase_nao_avisa():
    fala = _fala("os negros correspondem a 1/3 da população")
    cena = _cena(
        "destaque_numerico",
        numero="1/3",
        frase_da_fala="os negros correspondem a 1/3 da população",
        quem_disse="video_reagido",
    )
    assert _codigos(cena, fala) == []


def test_numero_por_extenso_e_mil_contam_como_ditos():
    fala = _fala("quatro anos velho e eu posso ganhar 3 mil reais")
    assert (
        _codigos(
            _cena("destaque_numerico", numero="4 anos", frase_da_fala="quatro anos velho"), fala
        )
        == []
    )
    assert (
        _codigos(
            _cena("destaque_numerico", numero="R$ 3.000", frase_da_fala="posso ganhar 3 mil reais"),
            fala,
        )
        == []
    )


def test_numero_diferente_da_frase_avisa():
    # Caso real: a legenda diz "15 milhão e meio" e a cena pôs R$ 15,5 MI.
    fala = _fala("a tua casa valorizar 200.000 ou 15 milhão e meio no ano")
    cena = _cena(
        "destaque_numerico",
        numero="R$ 15,5 MI",
        frase_da_fala="valorizar 200.000 ou 15 milhão e meio no ano",
    )
    assert _codigos(cena, fala) == ["numero_fora_da_frase"]


def test_frase_que_nao_esta_na_fala_avisa():
    cena = _cena(
        "enfase", texto="Tese", frase_da_fala="uma frase que ninguém pronunciou nesta live inteira"
    )
    assert _codigos(cena, _fala("outro assunto completamente diferente aqui")) == [
        "frase_fora_da_fala"
    ]


def test_cena_sem_frase_de_tipo_que_nao_afirma_nao_avisa():
    assert _codigos(_cena("enfase", texto="Tese"), _fala("algo")) == []


def test_citacao_na_boca_de_quem_nao_disse_avisa():
    # Caso real: o apresentador parafraseia e a cena atribui ao Nando Moura.
    frase = "por aí você não vai se você quiser continuar indo se reconstrua"
    cena = _cena(
        "citacao_autor",
        texto="Por aí você não vai. Se você quiser continuar indo, se reconstrua",
        autor="Fernando Moura",
        frase_da_fala=frase,
        quem_disse="apresentador",
    )
    assert _codigos(cena, _fala(frase)) == ["autor_nao_e_quem_disse"]


def test_citacao_de_quem_disse_nao_avisa():
    frase = "a constituição é muito clara características raciais não devem ser usadas"
    cena = _cena(
        "citacao_autor",
        texto="A Constituição é muito clara. Características raciais não devem ser usadas",
        autor="Doug Blair",
        frase_da_fala=frase,
        quem_disse="Doug Blair",
    )
    assert _codigos(cena, _fala(frase)) == []


def test_citacao_lida_do_video_reagido_nao_acusa_autor():
    frase = "governar um grande estado é como cozinhar um peixe pequeno"
    cena = _cena(
        "citacao_autor",
        texto="Governar um grande Estado é como cozinhar um peixe pequeno",
        autor="Lao Tsé",
        frase_da_fala=frase,
        quem_disse="video_reagido",
    )
    assert _codigos(cena, _fala(frase)) == []


def test_citacao_diferente_do_que_foi_dito_avisa():
    # Caso real: a última frase é do narrador, e "poder" não foi dito.
    frase = "quando o trabalho está concluído todos dizem nós mesmos fizemos"
    cena = _cena(
        "citacao_autor",
        texto="Quando o trabalho está concluído, o povo diz: nós mesmos fizemos. Talvez esse seja o teste real do poder",
        autor="Lao Tsé",
        frase_da_fala=frase,
        quem_disse="video_reagido",
    )
    assert _codigos(cena, _fala(frase)) == ["citacao_nao_literal"]


def test_ficha_sem_fonte_avisa_que_vem_da_memoria():
    # Caso real: "Eduardo Bolsonaro, deputado federal" depois de perder o mandato.
    cena = _cena(
        "ficha_biografica",
        texto="Eduardo Bolsonaro",
        subtexto="Deputado federal (PL-SP)",
        frase_da_fala="eduardo bolsonaro viajou",
    )
    assert _codigos(cena, _fala("eduardo bolsonaro viajou")) == ["ficha_da_memoria"]


def test_fonte_declarada_cala_o_aviso_de_origem():
    cena = _cena("ficha_biografica", texto="Sartre", fonte="Stanford Encyclopedia")
    assert _codigos(cena, _fala("sartre")) == []
    assert _codigos(_cena("destaque_numerico", numero="1932", fonte="TSE"), _fala("algo")) == []


def test_cena_que_perdeu_a_frase_avisa():
    cena = _cena("enfase", texto="Tese", ancora_perdida=True)
    assert _codigos(cena, _fala("algo")) == ["frase_saiu_do_corte"]


def test_transcricao_sem_palavras_nao_acusa_frase():
    # Dados legados sem `palavras`: não há como conferir, então não se acusa.
    cena = _cena("enfase", texto="Tese", frase_da_fala="qualquer frase de legado aqui")
    assert _codigos(cena, [{"start": 0, "end": 5, "texto": "outra"}]) == []


def test_o_aviso_identifica_a_cena_e_a_conferencia_nao_altera_nada():
    cenas = [_cena("destaque_numerico", numero="50x")]
    antes = copy.deepcopy(cenas)
    avisos = conferir_cenas(cenas, _fala("algo"))
    assert cenas == antes
    assert avisos[0]["tipo"] == "destaque_numerico"
    assert avisos[0]["inicio"] == 12.0
    assert avisos[0]["mensagem"]


def test_o_contrato_pede_a_frase_literal_e_proibe_inventar_fonte():
    assert "frase_da_fala" in CONTRATO_DA_ORIGEM
    assert "quem_disse" in CONTRATO_DA_ORIGEM
    assert "fonte" in CONTRATO_DA_ORIGEM
    assert "nunca invente" in CONTRATO_DA_ORIGEM.lower()


def test_o_contrato_nao_induz_fonte_vazia_que_apaga_a_verdadeira():
    # Geração real: "deixe vazio" fez a IA repetir `"fonte": ""` depois da fonte da
    # cena fonte_referencia, e no JSON a última chave vence: a fonte sumia.
    assert "omita o campo" in CONTRATO_DA_ORIGEM
    assert "deixe vazio" not in CONTRATO_DA_ORIGEM


def test_frase_que_saiu_do_corte_nao_repete_o_aviso_de_fora_da_fala():
    cena = _cena("enfase", texto="Tese", ancora_perdida=True, frase_da_fala="uma frase que saiu")
    assert _codigos(cena, _fala("outro assunto completamente diferente")) == ["frase_saiu_do_corte"]


def test_tres_mil_por_extenso_conta_como_dito():
    cena = _cena("destaque_numerico", numero="3.000", frase_da_fala="posso ganhar três mil reais")
    assert _codigos(cena, _fala("posso ganhar três mil reais")) == []


def test_sobrenome_com_de_nao_faz_de_duas_pessoas_a_mesma():
    frase = "a verdade é o todo e sempre foi assim"
    cena = _cena(
        "citacao_autor",
        texto="A verdade é o todo e sempre foi assim",
        autor="João de Souza",
        frase_da_fala=frase,
        quem_disse="Maria de Lima",
    )
    assert _codigos(cena, _fala(frase)) == ["autor_nao_e_quem_disse"]


def test_campo_fora_do_formato_nao_derruba_a_conferencia():
    fala = _fala("o ano foi 1932 no brasil")
    assert (
        _codigos(_cena("destaque_numerico", numero=1932, frase_da_fala="o ano foi 1932"), fala)
        == []
    )
    cenas = [
        "texto solto",
        _cena("citacao_autor", texto=None, autor=7, quem_disse=8, frase_da_fala=9),
        _cena("destaque_numerico", numero=None, texto=None, frase_da_fala="o ano"),
        {"inicio": 3.0, "fim": 5.0},
    ]
    assert isinstance(conferir_cenas(cenas, fala), list)
