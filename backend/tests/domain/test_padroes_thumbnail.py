"""Testes do domínio puro `padroes_thumbnail` (D-070)."""

from app.domain.padroes_thumbnail import (
    EIXOS,
    compilar_padroes,
    parsear_variation_tags,
    pontuar_avaliacao,
    selecionar_melhores,
)


def _prompt(cenario: str, paleta: str, tipografia: str = "bold condensado") -> str:
    """Monta um prompt com a linha [VARIATION_TAGS] como o Capista emite."""
    return (
        f'[VARIATION_TAGS] cenario="{cenario}" | paleta="{paleta}" | '
        f'tipografia="{tipografia}"\n\nEditorial 2D thumbnail, scene...'
    )


class TestParsearVariationTags:
    def test_extrai_eixos_conhecidos(self):
        tags = parsear_variation_tags(_prompt("tribunal", "vermelho e preto"))
        assert tags["cenario"] == "tribunal"
        assert tags["paleta"] == "vermelho e preto"
        assert tags["tipografia"] == "bold condensado"

    def test_ignora_eixo_desconhecido(self):
        tags = parsear_variation_tags('[VARIATION_TAGS] cenario="x" | foo="bar"')
        assert "foo" not in tags
        assert tags["cenario"] == "x"

    def test_prompt_sem_linha_de_tags_vira_vazio(self):
        assert parsear_variation_tags("Só um prompt manual antigo") == {}
        assert parsear_variation_tags("") == {}
        assert parsear_variation_tags(None) == {}

    def test_aceita_aspas_curvas(self):
        tags = parsear_variation_tags("[VARIATION_TAGS] cenario=“rua”")
        assert tags["cenario"] == "rua"


class TestPontuarESelecionar:
    def test_otimo_pontua_mais_que_bom(self):
        otimo = pontuar_avaliacao({"veredito": "otimo"})
        bom = pontuar_avaliacao({"veredito": "bom"})
        assert otimo > bom

    def test_seleciona_so_positivos_com_prompt_ordenados(self):
        avaliacoes = [
            {"veredito": "bom", "prompt_snapshot": _prompt("a", "azul")},
            {"veredito": "ruim", "prompt_snapshot": _prompt("b", "verde")},
            {"veredito": "otimo", "prompt_snapshot": _prompt("c", "vermelho")},
            {"veredito": "otimo", "prompt_snapshot": ""},  # sem prompt -> fora
        ]
        melhores = selecionar_melhores(avaliacoes)
        assert [m["veredito"] for m in melhores] == ["otimo", "bom"]

    def test_limite_corta_os_excedentes(self):
        avaliacoes = [
            {"veredito": "bom", "prompt_snapshot": _prompt("a", "azul")},
            {"veredito": "otimo", "prompt_snapshot": _prompt("c", "vermelho")},
        ]
        assert len(selecionar_melhores(avaliacoes, limite=1)) == 1


class TestCompilarPadroes:
    def test_conta_frequencia_por_eixo_dos_melhores(self):
        melhores = [
            {"veredito": "otimo", "prompt_snapshot": _prompt("tribunal", "vermelho")},
            {"veredito": "bom", "prompt_snapshot": _prompt("tribunal", "azul")},
            {"veredito": "bom", "prompt_snapshot": _prompt("praça", "azul")},
        ]
        padroes = compilar_padroes(melhores)

        assert padroes["total_melhores"] == 3
        assert padroes["com_tags"] == 3
        # cenário: "tribunal" aparece 2x, vem primeiro.
        cenario = padroes["eixos"]["cenario"]
        assert cenario[0] == {"valor": "tribunal", "contagem": 2}
        # paleta: "azul" 2x antes de "vermelho" 1x.
        assert padroes["eixos"]["paleta"][0] == {"valor": "azul", "contagem": 2}

    def test_todos_os_eixos_presentes_mesmo_vazios(self):
        padroes = compilar_padroes([])
        assert set(padroes["eixos"].keys()) == set(EIXOS)
        assert padroes["total_melhores"] == 0
        assert padroes["com_tags"] == 0
        assert padroes["eixos"]["cenario"] == []
