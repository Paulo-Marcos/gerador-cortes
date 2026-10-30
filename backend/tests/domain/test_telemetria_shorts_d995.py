"""D-995: a régua proposta×final dos shorts, sem banco."""

from app.domain.short.telemetria_shorts import (
    SITUACAO_APAGADO,
    SITUACAO_VIVO,
    diff_proposta_vs_final,
    resumir,
)


def _proposta(short_id: str = "s1", inicio: float = 10.0, fim: float = 40.0) -> dict:
    return {
        "short_id": short_id,
        "numero": 1,
        "provedor": "claude",
        "modelo": "sonnet",
        "score": 8.5,
        "titulo": "A conta que nao fecha",
        "gancho": "ninguem te conta isso",
        "inicio_seg": inicio,
        "fim_seg": fim,
    }


def _final(status: str = "aprovado", inicio: float = 10.0, fim: float = 40.0, **extra) -> dict:
    return {
        "status": status,
        "inicio_seg": inicio,
        "fim_seg": fim,
        "duracao_seg": extra.get("duracao", fim - inicio),
        "gancho": extra.get("gancho", "ninguem te conta isso"),
    }


def test_short_esticado_mostra_o_quanto_cada_borda_andou():
    linha = diff_proposta_vs_final(_proposta(), _final(inicio=8.0, fim=53.0))

    assert linha["situacao"] == SITUACAO_VIVO
    assert linha["duracao_proposta_seg"] == 30.0
    assert linha["duracao_final_seg"] == 45.0
    assert linha["delta_inicio_seg"] == -2.0
    assert linha["delta_fim_seg"] == 13.0
    assert linha["delta_duracao_seg"] == 15.0
    assert linha["gancho_mudou"] is False
    assert (linha["provedor"], linha["modelo"], linha["score_proposto"]) == (
        "claude",
        "sonnet",
        8.5,
    )


def test_duracao_final_e_a_liquida_e_nao_o_envelope():
    # Colagem (D-604): envelope de 0 a 60 com um buraco; o vídeo dura 45 s.
    linha = diff_proposta_vs_final(
        _proposta(inicio=0.0, fim=60.0), _final(fim=60.0, inicio=0.0, duracao=45.0)
    )

    assert linha["delta_duracao_seg"] == -15.0


def test_short_que_nao_existe_mais_conta_como_apagado_sem_inventar_final():
    linha = diff_proposta_vs_final(_proposta(), None)

    assert linha["situacao"] == SITUACAO_APAGADO
    assert linha["status_final"] == ""
    assert linha["delta_duracao_seg"] is None
    assert linha["gancho_mudou"] is None
    assert linha["inicio_proposto_seg"] == 10.0


def test_gancho_reescrito_pelo_operador_aparece():
    linha = diff_proposta_vs_final(_proposta(), _final(gancho="outra frase"))

    assert linha["gancho_mudou"] is True


def test_resumo_faz_a_conta_da_d989_so_sobre_os_aceitos():
    linhas = [
        diff_proposta_vs_final(_proposta("a"), _final(fim=53.0)),  # +13
        diff_proposta_vs_final(_proposta("b"), _final(status="renderizado", fim=60.0)),  # +20
        diff_proposta_vs_final(_proposta("c"), _final(fim=40.5)),  # ajuste fino
        diff_proposta_vs_final(_proposta("d"), _final(fim=30.0)),  # -10
        diff_proposta_vs_final(_proposta("e"), _final(status="rejeitado", fim=90.0)),
        diff_proposta_vs_final(_proposta("f"), _final(status="sugerido", fim=90.0)),
        diff_proposta_vs_final(_proposta("g"), None),
    ]

    assert resumir(linhas) == {
        "total": 7,
        "apagados": 1,
        "aceitos": 4,
        "esticados": 2,
        "encurtados": 1,
        "mediana_delta_duracao_aceitos_seg": 6.75,
    }


def test_resumo_sem_aceitos_nao_inventa_mediana():
    assert (
        resumir([diff_proposta_vs_final(_proposta(), None)])["mediana_delta_duracao_aceitos_seg"]
        is None
    )
