"""Testes para `MetadadosService._formatar_historico_visual` (I-038).

Cobre a PRESSÃO POSITIVA: além de listar os ELEMENTOS PROIBIDOS, quando um
eixo satura na janela (aparece 2+ vezes) o bloco passa a emitir uma ordem de
inversão ("EIXOS SATURADOS → POLO OPOSTO"). É a peça que ataca a recorrência
de roupa/dark que a memória só-negativa não resolvia.
"""

from __future__ import annotations

from app.services.metadados import MetadadosService


def _capa(roupa: str, luminosidade: str = "chave-baixa", cenario: str = "rua") -> dict:
    return {
        "texto_capa": "",
        "prompt": (
            f'[VARIATION_TAGS] cenario="{cenario}" | roupa="{roupa}" | '
            f'luminosidade="{luminosidade}"\n\ncorpo do prompt'
        ),
    }


class TestFormatarHistoricoVisual:
    def test_eixo_saturado_vira_ordem_de_inversao(self):
        # roupa repetida 3x → satura; deve emitir pressão positiva.
        historico = [_capa("moletom cinza surrado") for _ in range(3)]
        bloco = MetadadosService._formatar_historico_visual(historico)

        assert "EIXOS SATURADOS" in bloco
        assert "POLO OPOSTO" in bloco
        assert "moletom cinza surrado" in bloco
        # luminosidade também satura (mesmo valor nas 3) → entra na pressão
        assert "REGISTRO TONAL" in bloco

    def test_sem_saturacao_nao_emite_pressao(self):
        historico = [
            _capa("a", "clara", "rua"),
            _capa("b", "quente", "praça"),
            _capa("c", "fria", "estúdio"),
        ]
        bloco = MetadadosService._formatar_historico_visual(historico)

        assert "EIXOS SATURADOS" not in bloco
        # mas o bloco de PROIBIDOS continua presente
        assert "ROUPAS DO MASCOTE" in bloco

    def test_historico_vazio_avisa_primeira_da_serie(self):
        bloco = MetadadosService._formatar_historico_visual([])
        assert "primeira da série" in bloco
