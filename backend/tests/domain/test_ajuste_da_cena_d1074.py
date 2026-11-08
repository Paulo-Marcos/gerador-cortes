"""As regras puras do ajuste de uma cena (D-1074, RN-40), e a marca que ele segura."""

from __future__ import annotations

import pytest
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.corte import ajuste_da_cena as ajuste
from app.services import cenas_em_geracao


def _legendas(n: int) -> list[dict]:
    return [{"start": 4.0 * i, "end": 4.0 * i + 4, "texto": f"l{i}"} for i in range(n)]


@pytest.mark.parametrize(
    ("origem", "provider"),
    [("gemini", "gemini"), ("claude", "claude"), ("manual", "claude"), (None, "claude")],
)
def test_o_provedor_e_o_que_gerou_o_plano_atual(origem, provider):
    assert ajuste.provider_do_ajuste(origem) == provider


def test_acha_a_cena_pelo_tipo_e_pelo_inicio_ao_centesimo():
    cenas = [
        {"tipo": "enfase", "inicio": 4.0, "fim": 6.0},
        {"tipo": "barra_inferior", "inicio_seg": 10.004, "fim_seg": 12.0},
    ]

    assert ajuste.achar_a_cena(cenas, "barra_inferior", 10.0) == 1
    assert ajuste.achar_a_cena(cenas, "enfase", 10.0) is None
    assert ajuste.achar_a_cena(cenas, "enfase", 4.2) is None


def test_manual_e_riscada_tem_recusa_e_a_da_ia_nao():
    assert "a IA não mexe" in ajuste.recusa_do_ajuste({"manual": True})
    assert "riscada" in ajuste.recusa_do_ajuste({"riscada": True})
    assert ajuste.recusa_do_ajuste({"tipo": "enfase"}) is None


def test_a_janela_vai_de_dez_legendas_antes_a_dez_depois_da_cena():
    legendas = _legendas(60)

    inicio, janela = ajuste.janela_de_legendas(legendas, 80.0, 90.0)  # legendas 20 a 22

    assert inicio == 20
    assert janela[0]["texto"] == "l10"
    assert janela[-1]["texto"] == "l32"


def test_a_janela_para_nas_pontas_da_transcricao():
    inicio, janela = ajuste.janela_de_legendas(_legendas(5), 0.0, 3.0)

    assert inicio == 0
    assert [legenda["texto"] for legenda in janela] == ["l0", "l1", "l2", "l3", "l4"]


def test_o_bloco_do_pedido_traz_a_cena_e_o_pedido_e_pede_uma_cena_so():
    bloco = ajuste.bloco_do_pedido({"tipo": "enfase", "texto": "Frase"}, "  encurte  ")

    assert '"texto": "Frase"' in bloco
    assert "O pedido do operador: encurte\n" in bloco
    assert "UMA cena só" in bloco


def test_mesclar_mantem_o_que_a_ia_nao_mencionou_e_o_tempo_quando_ela_nao_o_mudou():
    original = {
        "tipo": "ficha_biografica",
        "inicio": 20.0,
        "fim": 24.0,
        "inicio_seg": 20.0,
        "fim_seg": 24.0,
        "texto": "Karl Heinrich Marx",
        "retrato_url": "/retrato.jpg",
        "layout_card": "vertical",
    }
    convertida = {
        "tipo": "ficha_biografica",
        "inicio": 19.5,
        "fim": 23.5,
        "texto": "Karl Marx",
        "layout_card": "auto",
        "modelo_cena": "card",
    }

    depois = ajuste.mesclar_o_ajuste(
        original, convertida, {"texto": "Karl Marx"}, manteve_o_tempo=True
    )

    assert depois["texto"] == "Karl Marx"
    assert depois["retrato_url"] == "/retrato.jpg"
    assert depois["layout_card"] == "vertical"
    assert (depois["inicio"], depois["fim"], depois["inicio_seg"]) == (20.0, 24.0, 20.0)


def test_mesclar_leva_o_tempo_novo_aos_dois_pares_quando_a_ia_moveu_a_cena():
    original = {"tipo": "enfase", "inicio": 20.0, "fim": 24.0, "inicio_seg": 20.0, "fim_seg": 24.0}
    convertida = {"tipo": "enfase", "inicio": 12.0, "fim": 15.0}

    depois = ajuste.mesclar_o_ajuste(original, convertida, {}, manteve_o_tempo=False)

    assert (depois["inicio"], depois["fim"]) == (12.0, 15.0)
    assert (depois["inicio_seg"], depois["fim_seg"]) == (12.0, 15.0)


@pytest.mark.parametrize(
    ("devolvida", "manteve"),
    [
        ({"startLeg": 5, "duracao_s": 4.0}, True),
        ({"startLeg": "5", "duracao_s": "4"}, True),
        ({"startLeg": 6, "duracao_s": 4.0}, False),
        ({"startLeg": 5, "duracao_s": 6.0}, False),
        ({"startLeg": "cinco", "duracao_s": 4.0}, False),
        ({}, False),
    ],
)
def test_manteve_o_tempo_compara_legenda_e_duracao(devolvida, manteve):
    assert ajuste.manteve_o_tempo({"startLeg": 5, "duracao_s": 4.0}, devolvida) is manteve


def test_trocar_a_cena_mantem_o_formato_do_plano():
    nova = {"tipo": "enfase", "texto": "Nova"}

    lista = ajuste.plano_com_a_cena_trocada([{"a": 1}, {"b": 2}], 1, nova)
    dicionario = ajuste.plano_com_a_cena_trocada(
        {"formato": "cortes", "cenas": [{"a": 1}]}, 0, nova
    )

    assert lista == [{"a": 1}, nova]
    assert dicionario == {"formato": "cortes", "cenas": [nova]}


# ── A marca das cenas com um ajuste em voo ───────────────────────────────────


def test_o_ajuste_segura_o_corte_sem_dizer_que_cenas_estao_sendo_geradas():
    with cenas_em_geracao.reservar_o_ajuste("c-marca"):
        assert cenas_em_geracao.esta_gerando("c-marca") is False
        assert "ajustada" in cenas_em_geracao.recusa_ao_bruto("c-marca")
        with pytest.raises(PedidoInvalido, match="ajustada"):
            cenas_em_geracao.reservar_ou_recusar("c-marca")
        with pytest.raises(PedidoInvalido, match="ajustada"):
            cenas_em_geracao.reservar_o_ajuste("c-marca")
    assert cenas_em_geracao.recusa_ao_bruto("c-marca") is None


def test_o_ajuste_espera_o_bruto_que_so_segura_as_cenas():
    with cenas_em_geracao.reservar("c-bruto", gera_cenas=False):
        with pytest.raises(PedidoInvalido, match="bruto"):
            cenas_em_geracao.reservar_o_ajuste("c-bruto")


def test_mesclar_nao_inventa_o_visual_que_a_cena_nao_tinha():
    """A conversão da resposta põe "auto"/"card" no visual; a cena sem visual escolhido segue
    sem ele, e o antes e depois não acusa uma mudança que ninguém pediu (prova no navegador)."""
    original = {"tipo": "enfase", "inicio": 2.0, "fim": 7.0, "texto": "Longa"}
    convertida = {
        "tipo": "enfase",
        "inicio": 2.0,
        "fim": 7.0,
        "texto": "Curta",
        "layout_card": "auto",
        "sombra_nivel": "auto",
        "modelo_cena": "card",
    }

    depois = ajuste.mesclar_o_ajuste(original, convertida, {"texto": "Curta"}, manteve_o_tempo=True)

    assert depois == {"tipo": "enfase", "inicio": 2.0, "fim": 7.0, "texto": "Curta"}
