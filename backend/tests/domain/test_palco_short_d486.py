"""D-486: a geometria do palco vertical.

O que motivou o palco: o short recortava uma janela 9:16 do quadro cru e trazia
junto o chrome da live (verde-limao com "ASSINANTE"). O horizontal nunca teve
isso porque recorta REGIOES e as recoloca em SLOTS — nunca copia o quadro
inteiro.

A regra que estes testes protegem:

    o CROP vem da regiao (preset do canal)
    o SLOT vem do modelo (palco_short)

E a decisao editorial que mais erra em silencio: COBRIR num rosto, CABER numa
tela. Trocar os dois nao quebra nada — so entrega um short com o rosto
espremido entre tarjas, ou uma tela compartilhada com as bordas cortadas.
"""

import pytest
from app.domain.palco_short import (
    CANVAS,
    MODELO_PADRAO,
    MODELOS,
    Ajuste,
    RegiaoFaltando,
    escalar,
    modelo_sugerido,
    montar_plano,
    regioes_do_layout,
)

FACECAM = {"x": 24, "y": 410, "w": 340, "h": 260}
TELA = {"x": 365, "y": 180, "w": 1325, "h": 720}


class TestModelos:
    def test_os_quatro_modelos_pedidos_existem(self):
        assert set(MODELOS) == {
            "tela_cima_pessoa_baixo",
            "pessoa_cheia",
            "pessoa_com_insert",
            "quadro_com_moldura",
        }

    @pytest.mark.parametrize("modelo", MODELOS.values(), ids=lambda m: m.id)
    def test_nenhum_slot_sai_do_quadro(self, modelo):
        for nome, slot in modelo.slots.items():
            assert slot.x >= 0 and slot.y >= 0, f"{modelo.id}/{nome} comeca fora"
            assert slot.x + slot.w <= CANVAS.largura, f"{modelo.id}/{nome} vaza na largura"
            assert slot.fim_y <= CANVAS.altura, f"{modelo.id}/{nome} vaza na altura"

    @pytest.mark.parametrize("modelo", MODELOS.values(), ids=lambda m: m.id)
    def test_todo_modelo_explica_para_que_serve(self, modelo):
        """Sem o porque, escolher entre quatro arranjos vira adivinhacao."""
        assert modelo.nome and len(modelo.porque) > 40

    def test_rosto_cobre_e_tela_cabe(self):
        """A decisao editorial do arquivo, travada.

        COBRIR num rosto: sobra de testa nao custa nada, e tarja ao lado da
        pessoa e espaco morto. CABER numa tela: cortar esconde o que a pessoa
        esta mostrando, e ninguem rebobina um short.
        """
        for modelo in MODELOS.values():
            for nome, slot in modelo.slots.items():
                esperado = Ajuste.CABER if nome == "tela" else Ajuste.COBRIR
                assert slot.ajuste == esperado, f"{modelo.id}/{nome} com ajuste trocado"

    def test_no_arranjo_de_duas_faixas_a_tela_fica_acima_da_pessoa(self):
        slots = MODELOS["tela_cima_pessoa_baixo"].slots

        assert slots["tela"].fim_y <= slots["pessoa"].y, "as faixas se sobrepoem"

    def test_o_insert_e_declarado_depois_da_pessoa(self):
        """A ordem dos slots e a ordem de empilhamento: quem vem depois fica por cima."""
        assert list(MODELOS["pessoa_com_insert"].slots) == ["pessoa", "tela"]


class TestEscalar:
    def test_cobrir_transborda_o_slot_em_pelo_menos_uma_dimensao(self):
        slot = MODELOS["pessoa_cheia"].slots["pessoa"]

        largura, altura = escalar(FACECAM, slot)

        assert largura >= slot.w and altura >= slot.h
        assert (largura, altura) != (slot.w, slot.h) or FACECAM["w"] / FACECAM[
            "h"
        ] == slot.w / slot.h

    def test_caber_nunca_ultrapassa_o_slot(self):
        slot = MODELOS["tela_cima_pessoa_baixo"].slots["tela"]

        largura, altura = escalar(TELA, slot)

        assert largura <= slot.w and altura <= slot.h

    def test_a_proporcao_do_recorte_e_preservada(self):
        """Esticar o rosto para caber seria pior que cortar."""
        slot = MODELOS["pessoa_cheia"].slots["pessoa"]

        largura, altura = escalar(FACECAM, slot)

        assert largura / altura == pytest.approx(FACECAM["w"] / FACECAM["h"], rel=0.01)

    @pytest.mark.parametrize("crop", [FACECAM, TELA, {"x": 0, "y": 0, "w": 1, "h": 1}])
    @pytest.mark.parametrize(
        "slot",
        [s for m in MODELOS.values() for s in m.slots.values()],
        ids=lambda s: f"{s.w}x{s.h}-{s.ajuste.value}",
    )
    def test_dimensoes_sempre_pares(self, crop, slot):
        """Impar quebra o encode em yuv420p com 'width not divisible by 2'."""
        largura, altura = escalar(crop, slot)

        assert largura % 2 == 0 and altura % 2 == 0
        assert largura >= 2 and altura >= 2

    def test_crop_degenerado_nao_divide_por_zero(self):
        assert escalar({"x": 0, "y": 0, "w": 0, "h": 0}, MODELOS["pessoa_cheia"].slots["pessoa"])


class TestMontarPlano:
    def test_o_crop_vem_da_regiao_e_o_slot_do_modelo(self):
        """A regra central do arquivo, escrita como caso."""
        plano = montar_plano("tela_cima_pessoa_baixo", {"pessoa": FACECAM, "tela": TELA})

        por_regiao = {r.regiao: r for r in plano.recortes}

        assert por_regiao["pessoa"].crop == FACECAM
        assert por_regiao["pessoa"].slot == MODELOS["tela_cima_pessoa_baixo"].slots["pessoa"]
        assert por_regiao["tela"].crop == TELA

    def test_regiao_faltando_e_erro_explicito_e_diz_qual(self):
        """Arranjo meia-boca em silencio deixaria um buraco que so aparece no arquivo."""
        with pytest.raises(RegiaoFaltando, match="tela"):
            montar_plano("tela_cima_pessoa_baixo", {"pessoa": FACECAM})

    def test_regiao_com_area_zero_conta_como_faltando(self):
        with pytest.raises(RegiaoFaltando):
            montar_plano("pessoa_cheia", {"pessoa": {"x": 0, "y": 0, "w": 0, "h": 100}})

    def test_modelo_desconhecido_falha_alto(self):
        with pytest.raises(KeyError):
            montar_plano("nao_existe", {"pessoa": FACECAM})

    def test_o_deslocamento_centraliza_o_excesso(self):
        """Cortar so de um lado jogaria o rosto para a borda."""
        plano = montar_plano("pessoa_cheia", {"pessoa": FACECAM})
        recorte = plano.recortes[0]

        dx, dy = recorte.desloca

        assert dx == (recorte.escala[0] - recorte.slot.w) // 2
        assert dy >= 0

    def test_quem_cabe_no_slot_nao_desloca(self):
        plano = montar_plano("tela_cima_pessoa_baixo", {"pessoa": FACECAM, "tela": TELA})
        tela = next(r for r in plano.recortes if r.regiao == "tela")

        assert tela.desloca == (0, 0)


class TestModeloSugerido:
    def test_com_tela_marcada_usa_as_duas_faixas(self):
        assert modelo_sugerido({"pessoa": FACECAM, "tela": TELA}) == "tela_cima_pessoa_baixo"

    def test_so_pessoa_vira_quadro_cheio(self):
        assert modelo_sugerido({"pessoa": FACECAM}) == "pessoa_cheia"

    def test_sem_regiao_nenhuma_cai_no_padrao(self):
        """Corte sem preset aplicado — o caso do corte que o dev renderizou."""
        assert modelo_sugerido({}) == MODELO_PADRAO

    def test_o_sugerido_sempre_monta(self):
        """De nada adianta sugerir um modelo cujas regioes nao existem."""
        for regioes in ({"pessoa": FACECAM, "tela": TELA}, {"pessoa": FACECAM}):
            montar_plano(modelo_sugerido(regioes), regioes)


class TestRegioesDoLayout:
    def test_traduz_o_vocabulario_do_horizontal(self):
        """crop_facecam/crop_tela sao os MESMOS retangulos sobre o MESMO quadro."""
        regioes = regioes_do_layout({"crop_facecam": FACECAM, "crop_tela": TELA})

        assert regioes == {"pessoa": FACECAM, "tela": TELA}

    def test_le_o_preset_compartilhado_do_canal(self):
        """Formato real de layout_presets em PROD."""
        preset = {
            "compartilhada": {"telas": 2, "crop_facecam": FACECAM, "crop_tela": TELA},
            "fundo": "hud-topo",
        }

        assert regioes_do_layout(preset) == {"pessoa": FACECAM, "tela": TELA}

    def test_layout_do_corte_sem_regioes_devolve_vazio(self):
        """O caso real: {"modo_padrao": "full", "regioes": []}."""
        assert regioes_do_layout({"modo_padrao": "full", "regioes": []}) == {}

    def test_layout_ausente_nao_quebra(self):
        assert regioes_do_layout(None) == {}
        assert regioes_do_layout("nao e dict") == {}

    def test_modo_full_vira_a_regiao_quadro(self):
        quadro = {"x": 225, "y": 139, "w": 1482, "h": 808}

        assert regioes_do_layout({"crop": quadro}) == {"quadro": quadro}
