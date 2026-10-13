"""I-035: geometria da zona do card no layout compartilhado.

Estes testes TRAVAM os valores exatos da faixa onde o card vertical encaixa.
A regra e dinamica por layout YT:
  - a borda externa do palco e fixa -> define topo/esquerda (margem 48);
  - a tela grande (slot_tela) limita o alcance a DIREITA;
  - a tela pequena/facecam (slot_facecam) limita o alcance INFERIOR.

Qualquer mudanca na matematica deve quebrar aqui de forma visivel.
"""

from app.domain.corte.youtube_layout import (
    DEFAULT_CROP_FACECAM,
    DEFAULT_CROP_TELA,
    DEFAULT_SLOT_FACECAM,
    DEFAULT_SLOT_TELA,
    aplicar_layout_card_por_contexto,
    merge_compartilhada,
    normalizar_layout_youtube,
    regioes_compartilhadas,
    resolver_layout_em_cascata,
)
from app.domain.corte.zona_card import resolver_zona_card

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
        zona = resolver_zona_card(_config())
        # left vem da borda lateral fixa (48); top da margem superior (96);
        # right=slot_tela.x-respiro (500-28=472 -> w=424);
        # bottom=slot_facecam.y-respiro (405-28=377 -> h=377-96=281).
        assert zona == {"x": 48, "y": 96, "w": 424, "h": 281}

    def test_tela_mais_a_direita_alarga_a_zona(self):
        # Mover a tela grande para a direita libera espaco -> card mais largo.
        zona = resolver_zona_card(_config(slot_tela={"x": 700, "y": 150, "w": 1100, "h": 720}))
        assert zona["x"] == 48
        assert zona["w"] == 700 - RESPIRO - MARGEM  # 624
        # facecam intacto -> altura nao muda.
        assert zona["h"] == 405 - RESPIRO - MARGEM_TOPO  # 281

    def test_tela_mais_a_esquerda_estreita_a_zona(self):
        # Tela grande mais perto da borda -> menos espaco a esquerda.
        zona = resolver_zona_card(_config(slot_tela={"x": 420, "y": 150, "w": 1325, "h": 720}))
        assert zona["w"] == 420 - RESPIRO - MARGEM  # 344

    def test_facecam_mais_baixo_aumenta_a_altura(self):
        # Facecam descendo abre a faixa vertical -> card mais alto.
        zona = resolver_zona_card(_config(slot_facecam={"x": 54, "y": 600, "w": 340, "h": 260}))
        assert zona["y"] == 96
        assert zona["h"] == 600 - RESPIRO - MARGEM_TOPO  # 476
        # tela intacta -> largura nao muda.
        assert zona["w"] == 424

    def test_facecam_mais_alto_reduz_a_altura(self):
        zona = resolver_zona_card(_config(slot_facecam={"x": 54, "y": 520, "w": 340, "h": 260}))
        assert zona["h"] == 520 - RESPIRO - MARGEM_TOPO  # 396

    def test_zona_nao_invade_as_telas(self):
        # Invariante central: a faixa fica a esquerda da tela e acima do facecam.
        config = _config(
            slot_tela={"x": 640, "y": 150, "w": 1180, "h": 720},
            slot_facecam={"x": 54, "y": 480, "w": 340, "h": 260},
        )
        zona = resolver_zona_card(config)
        assert zona["x"] + zona["w"] <= config["slot_tela"]["x"]
        assert zona["y"] + zona["h"] <= config["slot_facecam"]["y"]

    def test_piso_de_seguranca_quando_telas_colam_na_borda(self):
        # Config degenerada: telas quase na borda. O card nao some — piso 240x180.
        zona = resolver_zona_card(
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
        zona = resolver_zona_card(_config(telas=1))
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

        esperado = resolver_zona_card(layout["compartilhada"])
        assert render[0]["layout_card_zone"] == esperado
        # A zona dinamica refletiu as telas movidas (mais larga e mais alta).
        assert render[0]["layout_card_zone"]["w"] == 624
        assert render[0]["layout_card_zone"]["h"] == 476


class TestZonaCardManual:
    """D-904 (RN-28): o operador diz onde os cards ficam, e a regra automatica
    vira o que vale quando ele nao disse nada."""

    MANUAL = {"x": 1400, "y": 200, "w": 440, "h": 600}

    def test_zona_manual_vence_a_regra_automatica_com_duas_telas(self):
        config = _config() | {"zona_card": dict(self.MANUAL)}
        assert resolver_zona_card(config) == self.MANUAL

    def test_zona_manual_vence_a_regra_automatica_com_uma_tela(self):
        config = _config(telas=1) | {"zona_card": dict(self.MANUAL)}
        assert resolver_zona_card(config) == self.MANUAL

    def test_chave_ausente_mantem_a_regra_automatica(self):
        assert resolver_zona_card(_config()) == {
            "x": 48,
            "y": 96,
            "w": 424,
            "h": 281,
        }

    def test_zona_invalida_cai_na_regra_automatica(self):
        for lixo in ("texto", 12, {"x": 10}, {"x": "a", "y": 1, "w": 300, "h": 300}):
            config = _config() | {"zona_card": lixo}
            assert resolver_zona_card(config) == {
                "x": 48,
                "y": 96,
                "w": 424,
                "h": 281,
            }, lixo

    def test_zona_manual_respeita_o_piso_e_o_quadro(self):
        # Piso 240x180 espelha o fit do renderer; o retangulo nunca sai do 1920x1080.
        config = _config() | {"zona_card": {"x": 1900, "y": 1000, "w": 10, "h": 10}}
        assert resolver_zona_card(config) == {
            "x": 1920 - 240,
            "y": 1080 - 180,
            "w": 240,
            "h": 180,
        }

    def test_normalizar_so_guarda_a_zona_quando_ela_veio(self):
        # RN-10: chave ausente e heranca; normalizar nao a materializa.
        sem = normalizar_layout_youtube({"compartilhada": {"telas": 2}})
        assert "zona_card" not in sem["compartilhada"]

        com = normalizar_layout_youtube({"compartilhada": {"zona_card": dict(self.MANUAL)}})
        assert com["compartilhada"]["zona_card"] == self.MANUAL

    def test_zona_do_projeto_chega_ao_corte_pela_cascata(self):
        efetivo = resolver_layout_em_cascata(
            corte_layout={"modo_padrao": "compartilhada"},
            projeto_padrao={"compartilhada": {"zona_card": dict(self.MANUAL)}},
        )
        assert efetivo["compartilhada"]["zona_card"] == self.MANUAL

    def test_corte_sobrepoe_a_zona_do_projeto(self):
        do_corte = {"x": 60, "y": 500, "w": 400, "h": 500}
        efetivo = resolver_layout_em_cascata(
            corte_layout={"compartilhada": {"zona_card": do_corte}},
            projeto_padrao={"compartilhada": {"zona_card": dict(self.MANUAL)}},
        )
        assert efetivo["compartilhada"]["zona_card"] == do_corte

    def test_override_de_segmento_carrega_a_zona(self):
        layout = {
            "modo_padrao": "full",
            "regioes": [
                {"inicio": 0, "fim": 10, "modo": "compartilhada"},
                {
                    "inicio": 10,
                    "fim": 20,
                    "modo": "compartilhada",
                    "compartilhada": {"zona_card": dict(self.MANUAL)},
                },
            ],
        }
        trechos = regioes_compartilhadas(layout, duracao_seg=30)
        assert "zona_card" not in trechos[0]
        assert trechos[1]["zona_card"] == self.MANUAL

    def test_padrao_de_segmento_guarda_a_zona(self):
        layout = normalizar_layout_youtube(
            {"compartilhada_segmento": {"zona_card": dict(self.MANUAL)}}
        )
        assert layout["compartilhada_segmento"]["zona_card"] == self.MANUAL

    def test_merge_carrega_a_zona_da_base_e_do_override(self):
        base = _config() | {"zona_card": dict(self.MANUAL)}
        assert merge_compartilhada(base, None)["zona_card"] == self.MANUAL
        outra = {"x": 60, "y": 500, "w": 400, "h": 500}
        assert merge_compartilhada(base, {"zona_card": outra})["zona_card"] == outra
        assert "zona_card" not in merge_compartilhada(_config(), {"telas": 1})

    def test_cena_compartilhada_recebe_a_zona_manual(self):
        layout = normalizar_layout_youtube(
            {
                "modo_padrao": "compartilhada",
                "compartilhada": {"zona_card": dict(self.MANUAL)},
            }
        )
        cenas = [{"tipo": "card_informacao", "inicio": 0, "fim": 5, "texto": "A"}]
        render = aplicar_layout_card_por_contexto(cenas, layout)
        assert render[0]["layout_card_zone"] == self.MANUAL


class TestZonaCardDoSegmento:
    """D-904: a zona manual de um SEGMENTO vale no render como vale no preview.

    O preview resolve o `compartilhada` no instante (`resolveSharedConfigAtTime`);
    o render calculava a zona uma vez, com a base do corte, e ignorava a zona que
    o operador definiu no segmento.
    """

    ZONA_SEGMENTO = {"x": 1400, "y": 200, "w": 440, "h": 600}

    def _layout(self, override):
        return normalizar_layout_youtube(
            {
                "modo_padrao": "compartilhada",
                "regioes": [
                    {"inicio": 10, "fim": 20, "modo": "compartilhada", "compartilhada": override}
                ],
            }
        )

    def test_cena_dentro_do_segmento_usa_a_zona_dele(self):
        layout = self._layout({"zona_card": dict(self.ZONA_SEGMENTO)})
        cenas = [
            {"tipo": "card_informacao", "inicio": 2, "fim": 6, "texto": "fora"},
            {"tipo": "card_informacao", "inicio": 12, "fim": 16, "texto": "dentro"},
        ]
        fora, dentro = aplicar_layout_card_por_contexto(cenas, layout)
        assert fora["layout_card_zone"] == {"x": 48, "y": 96, "w": 424, "h": 281}
        assert dentro["layout_card_zone"] == self.ZONA_SEGMENTO

    def test_segmento_sem_zona_propria_mantem_a_do_corte(self):
        # Regra de hoje intacta: override so de telas/encaixes nao muda a zona.
        layout = self._layout({"telas": 1})
        cenas = [{"tipo": "card_informacao", "inicio": 12, "fim": 16, "texto": "dentro"}]
        assert aplicar_layout_card_por_contexto(cenas, layout)[0]["layout_card_zone"] == {
            "x": 48,
            "y": 96,
            "w": 424,
            "h": 281,
        }
