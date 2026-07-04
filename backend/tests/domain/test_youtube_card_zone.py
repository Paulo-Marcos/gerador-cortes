"""I-035: geometria da zona do card no layout compartilhado.

Estes testes TRAVAM os valores exatos da faixa onde o card vertical encaixa.
A regra e dinamica por layout YT:
  - a borda externa do palco e fixa -> define topo/esquerda (margem 48);
  - a tela grande (slot_tela) limita o alcance a DIREITA;
  - a tela pequena/facecam (slot_facecam) limita o alcance INFERIOR.

Qualquer mudanca na matematica deve quebrar aqui de forma visivel.
"""

from app.domain.youtube_layout import (
    DEFAULT_CROP_FACECAM,
    DEFAULT_CROP_TELA,
    DEFAULT_SLOT_FACECAM,
    DEFAULT_SLOT_TELA,
    _zona_card_vertical_compartilhada,
    aplicar_layout_card_por_contexto,
    normalizar_layout_youtube,
)

MARGEM = 48
MARGEM_TOPO = 96
RESPIRO = 28


def _config(telas=2, slot_tela=None, slot_facecam=None):
    """Monta um compartilhada partindo do default, trocando so os slots dados."""
    return {
        "telas": telas,
        "crop_facecam": dict(DEFAULT_CROP_FACECAM),
        "crop_tela": dict(DEFAULT_CROP_TELA),
        "slot_facecam": dict(slot_facecam or DEFAULT_SLOT_FACECAM),
        "slot_tela": dict(slot_tela or DEFAULT_SLOT_TELA),
    }


class TestZonaCardDuasTelas:
    def test_default_borda_fixa_telas_limitam_direita_e_baixo(self):
        zona = _zona_card_vertical_compartilhada(_config())
        # left vem da borda lateral fixa (48); top da margem superior (96);
        # right=slot_tela.x-respiro (500-28=472 -> w=424);
        # bottom=slot_facecam.y-respiro (405-28=377 -> h=377-96=281).
        assert zona == {"x": 48, "y": 96, "w": 424, "h": 281}

    def test_tela_mais_a_direita_alarga_a_zona(self):
        # Mover a tela grande para a direita libera espaco -> card mais largo.
        zona = _zona_card_vertical_compartilhada(
            _config(slot_tela={"x": 700, "y": 150, "w": 1100, "h": 720})
        )
        assert zona["x"] == 48
        assert zona["w"] == 700 - RESPIRO - MARGEM  # 624
        # facecam intacto -> altura nao muda.
        assert zona["h"] == 405 - RESPIRO - MARGEM_TOPO  # 281

    def test_tela_mais_a_esquerda_estreita_a_zona(self):
        # Tela grande mais perto da borda -> menos espaco a esquerda.
        zona = _zona_card_vertical_compartilhada(
            _config(slot_tela={"x": 420, "y": 150, "w": 1325, "h": 720})
        )
        assert zona["w"] == 420 - RESPIRO - MARGEM  # 344

    def test_facecam_mais_baixo_aumenta_a_altura(self):
        # Facecam descendo abre a faixa vertical -> card mais alto.
        zona = _zona_card_vertical_compartilhada(
            _config(slot_facecam={"x": 54, "y": 600, "w": 340, "h": 260})
        )
        assert zona["y"] == 96
        assert zona["h"] == 600 - RESPIRO - MARGEM_TOPO  # 476
        # tela intacta -> largura nao muda.
        assert zona["w"] == 424

    def test_facecam_mais_alto_reduz_a_altura(self):
        zona = _zona_card_vertical_compartilhada(
            _config(slot_facecam={"x": 54, "y": 520, "w": 340, "h": 260})
        )
        assert zona["h"] == 520 - RESPIRO - MARGEM_TOPO  # 396

    def test_zona_nao_invade_as_telas(self):
        # Invariante central: a faixa fica a esquerda da tela e acima do facecam.
        config = _config(
            slot_tela={"x": 640, "y": 150, "w": 1180, "h": 720},
            slot_facecam={"x": 54, "y": 480, "w": 340, "h": 260},
        )
        zona = _zona_card_vertical_compartilhada(config)
        assert zona["x"] + zona["w"] <= config["slot_tela"]["x"]
        assert zona["y"] + zona["h"] <= config["slot_facecam"]["y"]

    def test_piso_de_seguranca_quando_telas_colam_na_borda(self):
        # Config degenerada: telas quase na borda. O card nao some — piso 240x180.
        zona = _zona_card_vertical_compartilhada(
            _config(
                slot_tela={"x": 120, "y": 60, "w": 1325, "h": 720},
                slot_facecam={"x": 54, "y": 120, "w": 340, "h": 260},
            )
        )
        assert zona["w"] == 240
        assert zona["h"] == 180


class TestZonaCardUmaTela:
    def test_uma_tela_regressao_inalterada(self):
        # I-035 nao mexe no ramo de 1 tela — trava o valor para garantir.
        zona = _zona_card_vertical_compartilhada(_config(telas=1))
        assert zona == {"x": 48, "y": 150, "w": 424, "h": 720}


class TestIntegracaoAplicarLayout:
    def test_cena_compartilhada_recebe_zona_dinamica(self):
        layout = normalizar_layout_youtube(
            {
                "modo_padrao": "compartilhada",
                "compartilhada": {
                    "telas": 2,
                    "slot_tela": {"x": 700, "y": 150, "w": 1100, "h": 720},
                    "slot_facecam": {"x": 54, "y": 600, "w": 340, "h": 260},
                },
            }
        )
        cenas = [{"tipo": "card_informacao", "inicio": 0, "fim": 5, "texto": "A"}]
        render = aplicar_layout_card_por_contexto(cenas, layout)

        esperado = _zona_card_vertical_compartilhada(layout["compartilhada"])
        assert render[0]["layout_card_zone"] == esperado
        # A zona dinamica refletiu as telas movidas (mais larga e mais alta).
        assert render[0]["layout_card_zone"]["w"] == 624
        assert render[0]["layout_card_zone"]["h"] == 476
