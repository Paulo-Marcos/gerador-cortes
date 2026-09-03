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
from app.domain.arranjo_short import Arranjo, Disposicao, ModoPalco, montar_modelo
from app.domain.palco_short import (
    CANVAS,
    Ajuste,
    RegiaoFaltando,
    escalar,
    montar_plano,
    regioes_do_layout,
)

FACECAM = {"x": 24, "y": 410, "w": 340, "h": 260}
TELA = {"x": 365, "y": 180, "w": 1325, "h": 720}

# D-507: os quatro modelos viraram (modo, disposicao, fonte). Este adaptador
# mantem os testes de GEOMETRIA falando o vocabulario antigo de proposito — se
# um numero tivesse se movido na refatoracao, eles cairiam aqui. Passaram todos
# sem tocar num assert: a geometria e a mesma, so o caminho ate ela mudou.
_ARRANJO_DO_MODELO = {
    "pessoa_cheia": Arranjo(fonte="pessoa"),
    "quadro_com_moldura": Arranjo(fonte="quadro"),
    "tela_cima_pessoa_baixo": Arranjo(modo=ModoPalco.DIVIDIDA, disposicao=Disposicao.EMPILHADA),
    "pessoa_com_insert": Arranjo(modo=ModoPalco.DIVIDIDA, disposicao=Disposicao.INSERT),
}

TODAS_AS_REGIOES = {
    "pessoa": FACECAM,
    "tela": TELA,
    "quadro": {"x": 0, "y": 0, "w": 1920, "h": 1080},
}


def modelo_de(modelo_id: str, regioes: dict | None = None):
    return montar_modelo(_ARRANJO_DO_MODELO[modelo_id], regioes or TODAS_AS_REGIOES)


MODELOS = {chave: modelo_de(chave) for chave in _ARRANJO_DO_MODELO}


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
        plano = montar_plano(modelo_de("tela_cima_pessoa_baixo"), {"pessoa": FACECAM, "tela": TELA})

        por_regiao = {r.regiao: r for r in plano.recortes}

        assert por_regiao["pessoa"].crop == FACECAM
        assert por_regiao["pessoa"].slot == MODELOS["tela_cima_pessoa_baixo"].slots["pessoa"]
        assert por_regiao["tela"].crop == TELA

    def test_regiao_faltando_e_erro_explicito_e_diz_qual(self):
        """Arranjo meia-boca em silencio deixaria um buraco que so aparece no arquivo."""
        with pytest.raises(RegiaoFaltando, match="tela"):
            montar_plano(modelo_de("tela_cima_pessoa_baixo"), {"pessoa": FACECAM})

    def test_regiao_com_area_zero_conta_como_faltando(self):
        with pytest.raises(RegiaoFaltando):
            montar_plano(modelo_de("pessoa_cheia"), {"pessoa": {"x": 0, "y": 0, "w": 0, "h": 100}})

    def test_modelo_desconhecido_falha_alto(self):
        with pytest.raises(KeyError):
            montar_plano(modelo_de("nao_existe"), {"pessoa": FACECAM})

    def test_o_deslocamento_centraliza_o_excesso(self):
        """Cortar so de um lado jogaria o rosto para a borda."""
        plano = montar_plano(modelo_de("pessoa_cheia"), {"pessoa": FACECAM})
        recorte = plano.recortes[0]

        dx, dy = recorte.desloca

        assert dx == (recorte.escala[0] - recorte.slot.w) // 2
        assert dy >= 0

    def test_quem_cabe_no_slot_nao_desloca(self):
        plano = montar_plano(modelo_de("tela_cima_pessoa_baixo"), {"pessoa": FACECAM, "tela": TELA})
        tela = next(r for r in plano.recortes if r.regiao == "tela")

        assert tela.desloca == (0, 0)


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

    def test_preset_de_modo_full_tambem_da_a_regiao_quadro(self):
        """Payload real do tipo "posicionamento_full", em PROD.

        O crop do FULL ja nasce recortado PARA DENTRO das bordas da live — e o
        antidoto mais direto contra o chrome verde. Ler so `crop` no topo
        deixava esse preset de fora da lista, invisivel para o operador.
        """
        quadro = {"x": 225, "y": 139, "w": 1482, "h": 808}
        preset = {"full": {"crop": quadro, "slot": {"x": 150, "y": 130, "w": 1630, "h": 889}}}

        assert regioes_do_layout(preset) == {"quadro": quadro}


class TestDesenhoConcordaComOFiltro:
    """D-489: a previa desenha pelos numeros de `desenho`; o arquivo sai pelos
    de `posicao`/`corte_interno`. Se os dois discordarem, a tela mostra um
    enquadramento e o MP4 entrega outro — sem nada quebrar para avisar.

    Este bug ACONTECEU: `desenho` derivava do slot cru e ignorava a
    centralizacao do CABER, deixando a tela 54px a esquerda no canvas e
    centralizada no ffmpeg. Pego lendo os numeros que o endpoint servia.
    """

    @pytest.mark.parametrize("modelo_id", sorted(MODELOS))
    def test_o_canto_desenhado_bate_com_o_que_o_filtro_sobrepoe(self, modelo_id):
        regioes = {
            "pessoa": FACECAM,
            "tela": TELA,
            "quadro": {"x": 0, "y": 0, "w": 1920, "h": 1080},
        }
        for recorte in montar_plano(modelo_de(modelo_id, regioes), regioes).recortes:
            desenho = recorte.desenho
            px, py = recorte.posicao
            dx, dy = recorte.desloca

            assert desenho["destino"]["x"] == px - dx, f"{modelo_id}/{recorte.regiao} em x"
            assert desenho["destino"]["y"] == py - dy, f"{modelo_id}/{recorte.regiao} em y"

    def test_em_caber_o_desenho_centraliza_como_o_overlay(self):
        """O caso exato do bug, com o retangulo real do preset "Comp. 2 OBS".

        1117x699 e mais estreito que o slot 1080x608, entao a tela escala por
        altura e sobra largura — 54px de cada lado. Era essa sobra que o canvas
        ignorava.
        """
        tela_real = {"x": 706, "y": 141, "w": 1117, "h": 699}
        recorte = next(
            r
            for r in montar_plano(
                modelo_de("tela_cima_pessoa_baixo"), {"pessoa": FACECAM, "tela": tela_real}
            ).recortes
            if r.regiao == "tela"
        )

        sobra = (recorte.slot.w - recorte.escala[0]) // 2

        assert sobra > 0, "escolha um TELA que realmente sobre, senao o teste nao prova nada"
        assert recorte.desenho["destino"]["x"] == recorte.slot.x + sobra

    @pytest.mark.parametrize("modelo_id", sorted(MODELOS))
    def test_a_area_de_clip_e_sempre_o_slot(self, modelo_id):
        regioes = {
            "pessoa": FACECAM,
            "tela": TELA,
            "quadro": {"x": 0, "y": 0, "w": 1920, "h": 1080},
        }
        for recorte in montar_plano(modelo_de(modelo_id, regioes), regioes).recortes:
            recorta = recorte.desenho["recorta"]

            assert (recorta["x"], recorta["y"]) == (recorte.slot.x, recorte.slot.y)
            assert (recorta["w"], recorta["h"]) == (recorte.slot.w, recorte.slot.h)


class TestAjustesDoOperador:
    """D-493: o slot passa a vir do modelo OU do ajuste.

    A mudanca de eixo do arquivo. O que estes testes protegem e a HERANCA
    PARCIAL: chave ausente nao e slot zerado, e o slot do modelo. Materializar
    os defaults ao gravar congelaria o arranjo — trocar de modelo depois nao
    moveria mais nada. E a mesma regra do layout do horizontal.
    """

    def test_sem_ajuste_o_modelo_manda(self):
        from app.domain.palco_short import aplicar_ajustes

        assert aplicar_ajustes(MODELOS["pessoa_cheia"], None) is MODELOS["pessoa_cheia"]
        assert aplicar_ajustes(MODELOS["pessoa_cheia"], {}) is MODELOS["pessoa_cheia"]

    def test_ajuste_de_um_slot_nao_mexe_no_outro(self):
        """A heranca parcial, escrita como caso."""
        from app.domain.palco_short import aplicar_ajustes

        base = MODELOS["tela_cima_pessoa_baixo"]
        ajustado = aplicar_ajustes(base, {"tela": {"x": 100, "y": 200, "w": 800, "h": 450}})

        assert (ajustado.slots["tela"].x, ajustado.slots["tela"].w) == (100, 800)
        assert ajustado.slots["pessoa"] == base.slots["pessoa"], "o outro slot mudou"

    def test_o_ajuste_nao_troca_a_regra_de_encaixe(self):
        """Cobrir/caber e do tipo de conteudo, nao do arraste.

        Deixar o operador inverter isso movendo um bloco seria dar-lhe uma
        alavanca cujo efeito ele nao ve na hora.
        """
        from app.domain.palco_short import aplicar_ajustes

        base = MODELOS["tela_cima_pessoa_baixo"]
        ajustado = aplicar_ajustes(base, {"tela": {"x": 0, "y": 0, "w": 500, "h": 300}})

        assert ajustado.slots["tela"].ajuste == base.slots["tela"].ajuste

    def test_slot_ajustado_nao_sai_do_quadro(self):
        from app.domain.palco_short import aplicar_ajustes

        ajustado = aplicar_ajustes(
            MODELOS["pessoa_cheia"], {"pessoa": {"x": -50, "y": 9999, "w": 99999, "h": 10}}
        )
        slot = ajustado.slots["pessoa"]

        assert slot.x >= 0
        assert slot.y <= CANVAS.altura
        assert slot.w <= CANVAS.largura
        assert slot.h >= 40, "bloco menor que a alca sumiria sem como traze-lo de volta"

    def test_ajuste_invalido_cai_no_modelo_em_vez_de_virar_bloco_fantasma(self):
        """Largura zero de um arraste malfeito nao pode gerar um bloco invisivel."""
        from app.domain.palco_short import aplicar_ajustes

        base = MODELOS["pessoa_cheia"]
        for lixo in [{"x": 0, "y": 0, "w": 0, "h": 0}, {"x": 0}, "nao e dict", None]:
            ajustado = aplicar_ajustes(base, {"pessoa": lixo})

            assert ajustado.slots["pessoa"] == base.slots["pessoa"], f"aceitou {lixo!r}"

    def test_ajuste_de_regiao_que_o_modelo_nao_tem_e_ignorado(self):
        """Sobrou de quando o operador usava outro arranjo — nao deve criar slot."""
        from app.domain.palco_short import aplicar_ajustes

        ajustado = aplicar_ajustes(
            MODELOS["pessoa_cheia"], {"tela": {"x": 0, "y": 0, "w": 500, "h": 300}}
        )

        assert set(ajustado.slots) == {"pessoa"}

    def test_coordenada_fracionaria_vira_inteira(self):
        """Slot fracionario viraria crop fracionario, e o ffmpeg arredonda sozinho."""
        from app.domain.palco_short import aplicar_ajustes

        ajustado = aplicar_ajustes(
            MODELOS["pessoa_cheia"], {"pessoa": {"x": 10.6, "y": 20.4, "w": 500.5, "h": 300.5}}
        )
        slot = ajustado.slots["pessoa"]

        assert all(isinstance(v, int) for v in (slot.x, slot.y, slot.w, slot.h))

    def test_montar_plano_aceita_os_ajustes(self):
        plano = montar_plano(
            modelo_de("pessoa_cheia"),
            {"pessoa": FACECAM},
            {"pessoa": {"x": 40, "y": 60, "w": 600, "h": 900}},
        )

        assert plano.recortes[0].slot.x == 40
        assert plano.recortes[0].desenho["recorta"] == {"x": 40, "y": 60, "w": 600, "h": 900}
