import json

from app.domain.youtube_layout import (
    FUNDO_PADRAO,
    MODO_COMPARTILHADA,
    MODO_FULL,
    PLACA_PADRAO,
    aplicar_layout_card_por_contexto,
    merge_compartilhada,
    normalizar_layout_youtube,
    palco_cache_key,
    palco_cache_key_para_config,
    regioes_compartilhadas,
    resolver_layout_em_cascata,
    resolver_modo_no_tempo,
)


class TestPalcoCacheKey:
    def test_layouts_equivalentes_geram_mesma_chave(self):
        a = palco_cache_key({"modo_padrao": "compartilhada", "fundo": "hud-forte"})
        b = palco_cache_key({"modo_padrao": "full", "fundo": "hud-forte"})
        # modo_padrao nao afeta o visual do palco — so geometria/placa/fundo.
        assert a == b

    def test_placa_diferente_muda_chave(self):
        base = palco_cache_key({"fundo": "hud-forte"})
        outra = palco_cache_key({"fundo": "hud-forte", "placa": {"nome": "Outro", "papel": "x"}})
        assert base != outra

    def test_fundo_diferente_muda_chave(self):
        assert palco_cache_key({"fundo": "hud-forte"}) != palco_cache_key({"fundo": "cosmograph"})

    def test_slot_diferente_muda_chave(self):
        base = palco_cache_key({"fundo": "hud-forte"})
        movido = palco_cache_key(
            {
                "fundo": "hud-forte",
                "compartilhada": {"slot_tela": {"x": 600, "y": 150, "w": 1325, "h": 720}},
            }
        )
        assert base != movido

    def test_quantidade_telas_muda_chave(self):
        base = palco_cache_key({"fundo": "hud-forte"})
        uma_tela = palco_cache_key({"fundo": "hud-forte", "compartilhada": {"telas": 1}})
        assert base != uma_tela

    def test_chave_e_hex_curto_estavel(self):
        chave = palco_cache_key({"fundo": "hud-forte"})
        assert isinstance(chave, str)
        assert len(chave) == 16
        assert chave == palco_cache_key({"fundo": "hud-forte"})


def test_normalizar_layout_default_full_sem_regioes():
    layout = normalizar_layout_youtube(None)

    assert layout["modo_padrao"] == MODO_FULL
    assert layout["fundo"] == FUNDO_PADRAO
    assert layout["regioes"] == []
    assert layout["compartilhada"]["telas"] == 2
    assert layout["compartilhada"]["slot_facecam"]["w"] > 0


def test_normalizar_fundo_preserva_valido_e_cai_no_padrao_quando_invalido():
    valido = normalizar_layout_youtube({"fundo": "cosmograph"})
    invalido = normalizar_layout_youtube({"fundo": "inexistente"})

    assert valido["fundo"] == "cosmograph"
    assert invalido["fundo"] == FUNDO_PADRAO


def test_normalizar_placa_preserva_dict_e_default_pedro_ivo():
    com_nome = normalizar_layout_youtube({"placa": {"nome": "Outro", "papel": "Host"}})
    ausente = normalizar_layout_youtube({})
    limpa = normalizar_layout_youtube({"placa": {"nome": "", "papel": ""}})

    assert com_nome["placa"] == {"nome": "Outro", "papel": "Host"}
    assert ausente["placa"] == PLACA_PADRAO
    assert limpa["placa"] == {"nome": "", "papel": ""}


def test_normalizar_aliases_e_ordena_regioes():
    layout = normalizar_layout_youtube(
        {
            "modo_padrao": "shared",
            "regioes": [
                {"inicio": 20, "fim": 30, "modo": "full"},
                {"inicio": 5, "fim": 10, "modo": "compartilhada"},
            ],
        }
    )

    assert layout["modo_padrao"] == MODO_COMPARTILHADA
    assert [regiao["inicio"] for regiao in layout["regioes"]] == [5.0, 20.0]
    assert layout["regioes"][1]["modo"] == MODO_FULL


def test_normalizar_layout_limita_retangulos_ao_frame_1080p():
    layout = normalizar_layout_youtube(
        {
            "compartilhada": {
                "crop_facecam": {"x": 3000, "y": 2000, "w": 5000, "h": 5000},
            }
        }
    )

    assert layout["compartilhada"]["crop_facecam"] == {"x": 0, "y": 0, "w": 1920, "h": 1080}


def test_normalizar_layout_quantidade_telas_compartilhadas():
    uma_tela = normalizar_layout_youtube({"compartilhada": {"telas": 1}})
    invalido = normalizar_layout_youtube({"compartilhada": {"telas": 3}})

    assert uma_tela["compartilhada"]["telas"] == 1
    assert invalido["compartilhada"]["telas"] == 2


def test_normalizar_layout_converte_slot_legado_para_tamanho_real():
    layout = normalizar_layout_youtube(
        {
            "compartilhada": {
                "slot_facecam": {"x": 54, "y": 405, "w": 390, "h": 292},
                "slot_tela": {"x": 500, "y": 150, "w": 1325, "h": 745},
            }
        }
    )

    assert layout["compartilhada"]["slot_facecam"] == {"x": 54, "y": 405, "w": 340, "h": 260}
    assert layout["compartilhada"]["slot_tela"] == {"x": 500, "y": 150, "w": 1325, "h": 720}


def test_normalizar_layout_mantem_slot_proporcional_ao_crop():
    layout = normalizar_layout_youtube(
        {
            "compartilhada": {
                "crop_facecam": {"x": 0, "y": 0, "w": 400, "h": 200},
                "slot_facecam": {"x": 10, "y": 20, "w": 300, "h": 300},
            }
        }
    )

    assert layout["compartilhada"]["slot_facecam"] == {"x": 10, "y": 20, "w": 300, "h": 150}


def test_resolver_modo_no_tempo_regiao_sobrescreve_default():
    layout = normalizar_layout_youtube(
        {"modo_padrao": "full", "regioes": [{"inicio": 10, "fim": 20, "modo": "shared"}]}
    )

    assert resolver_modo_no_tempo(layout, 9.9) == MODO_FULL
    assert resolver_modo_no_tempo(layout, 10.0) == MODO_COMPARTILHADA
    assert resolver_modo_no_tempo(layout, 19.9) == MODO_COMPARTILHADA
    assert resolver_modo_no_tempo(layout, 20.0) == MODO_FULL


def test_regioes_compartilhadas_default_full_usa_apenas_intervalos_shared():
    layout = normalizar_layout_youtube(
        {
            "modo_padrao": "full",
            "regioes": [
                {"inicio": 10, "fim": 20, "modo": "compartilhada"},
                {"inicio": 30, "fim": 40, "modo": "full"},
            ],
        }
    )

    regioes = regioes_compartilhadas(layout, duracao_seg=60)

    assert [(r["inicio"], r["fim"]) for r in regioes] == [(10.0, 20.0)]
    assert regioes[0]["telas"] == 2
    assert "crop_facecam" in regioes[0]


def test_regioes_compartilhadas_preserva_uma_tela():
    layout = normalizar_layout_youtube(
        {
            "modo_padrao": "compartilhada",
            "compartilhada": {"telas": 1},
        }
    )

    regioes = regioes_compartilhadas(layout, duracao_seg=60)

    assert regioes[0]["telas"] == 1


def test_regioes_compartilhadas_default_shared_subtrai_full():
    layout = normalizar_layout_youtube(
        {
            "modo_padrao": "compartilhada",
            "regioes": [
                {"inicio": 10, "fim": 20, "modo": "full"},
                {"inicio": 40, "fim": 50, "modo": "full"},
            ],
        }
    )

    regioes = regioes_compartilhadas(layout, duracao_seg=60)

    assert [(r["inicio"], r["fim"]) for r in regioes] == [
        (0.0, 10.0),
        (20.0, 40.0),
        (50.0, 60.0),
    ]


def test_aplicar_layout_card_por_contexto_preserva_explicitacao():
    layout = normalizar_layout_youtube(
        {"modo_padrao": "full", "regioes": [{"inicio": 10, "fim": 20, "modo": "shared"}]}
    )
    cenas = [
        {"tipo": "card_informacao", "inicio": 0, "fim": 5, "texto": "A"},
        {"tipo": "card_informacao", "inicio": 12, "fim": 16, "texto": "B"},
        {
            "tipo": "card_informacao",
            "inicio": 12,
            "fim": 16,
            "texto": "C",
            "layout_card": "vertical",
        },
        {
            "tipo": "card_informacao",
            "inicio": 12,
            "fim": 16,
            "texto": "D",
            "layout_card": "horizontal",
        },
    ]

    render = aplicar_layout_card_por_contexto(cenas, layout)

    assert render[0]["layout_card"] == "vertical"
    assert render[1]["layout_card"] == "vertical"
    assert render[1]["layout_youtube_modo"] == "compartilhada"
    assert render[1]["layout_card_zone"]["w"] > 0
    assert render[2]["layout_card"] == "vertical"
    assert render[3]["layout_card"] == "horizontal"
    assert render[0]["modelo_cena"] == "card"


def test_tela_cheia_sempre_renderiza_como_card():
    # I-031: o render do palco YouTube forca tela_cheia em card, inclusive
    # quando o banco tem modelo_cena=padrao (cenas antigas, IA antiga).
    layout = normalizar_layout_youtube({"modo_padrao": "full", "regioes": []})
    cenas = [
        {"tipo": "tela_cheia", "inicio": 0, "fim": 5, "texto": "frase"},
        {"tipo": "tela_cheia", "inicio": 6, "fim": 11, "texto": "outra", "modelo_cena": "padrao"},
        {"tipo": "tela_cheia", "inicio": 12, "fim": 17, "texto": "auto", "modelo_cena": "auto"},
    ]

    render = aplicar_layout_card_por_contexto(cenas, layout)

    assert render[0]["modelo_cena"] == "card"
    assert render[1]["modelo_cena"] == "card"
    assert render[2]["modelo_cena"] == "card"


def test_corte_intocado_herda_modo_do_padrao_do_projeto():
    # F-020: corte ainda na sentinela do banco JA inicializa no modo do padrao.
    padrao = {"modo_padrao": "compartilhada", "fundo": "hud-topo"}
    layout = normalizar_layout_youtube(
        {"modo_padrao": "full", "regioes": []}, fallback_layout=padrao
    )

    assert layout["modo_padrao"] == MODO_COMPARTILHADA
    assert layout["fundo"] == "hud-topo"


def test_corte_configurado_preserva_modo_mesmo_com_padrao_compartilhada():
    # Se o corte tem layout proprio (fundo/compartilhada), o modo dele manda.
    padrao = {"modo_padrao": "compartilhada", "fundo": "hud-topo"}
    corte = {
        "modo_padrao": "full",
        "fundo": "hud-forte",
        "compartilhada": {"crop_tela": {"x": 0, "y": 0, "w": 100, "h": 100}},
    }
    layout = normalizar_layout_youtube(corte, fallback_layout=padrao)

    assert layout["modo_padrao"] == MODO_FULL


def test_sem_padrao_corte_intocado_continua_full():
    layout = normalizar_layout_youtube({"modo_padrao": "full", "regioes": []})

    assert layout["modo_padrao"] == MODO_FULL


def test_padrao_sem_modo_nao_forca_compartilhada():
    # Padrao salvo pelo botao ANTIGO (sem modo_padrao) nao deve mudar o modo.
    padrao = {"fundo": "hud-topo", "placa": {"nome": "X", "papel": "y"}}
    layout = normalizar_layout_youtube(
        {"modo_padrao": "full", "regioes": []}, fallback_layout=padrao
    )

    assert layout["modo_padrao"] == MODO_FULL
    assert layout["fundo"] == "hud-topo"


# -----------------------------------------------------------------------------
# F-048: override de compartilhada por segmento + presets de layout.
# -----------------------------------------------------------------------------


class TestOverrideCompartilhadaPorSegmento:
    def test_regiao_sem_override_herda_compartilhada_do_corte(self):
        layout = normalizar_layout_youtube(
            {
                "modo_padrao": "full",
                "compartilhada": {
                    "telas": 2,
                    "slot_tela": {"x": 500, "y": 150, "w": 1325, "h": 720},
                },
                "regioes": [{"inicio": 10, "fim": 20, "modo": "compartilhada"}],
            }
        )
        regioes = regioes_compartilhadas(layout, duracao_seg=60)

        assert len(regioes) == 1
        assert regioes[0]["telas"] == 2
        assert regioes[0]["slot_tela"] == {"x": 500, "y": 150, "w": 1325, "h": 720}

    def test_override_parcial_aplica_so_chave_informada(self):
        layout = normalizar_layout_youtube(
            {
                "modo_padrao": "full",
                "compartilhada": {"telas": 2},
                "regioes": [
                    {
                        "inicio": 10,
                        "fim": 20,
                        "modo": "compartilhada",
                        "compartilhada": {
                            "slot_tela": {"x": 700, "y": 150, "w": 1100, "h": 720},
                        },
                    }
                ],
            }
        )
        regioes = regioes_compartilhadas(layout, duracao_seg=60)

        # slot_tela vem do override; demais campos herdam do corte.
        assert regioes[0]["slot_tela"] == {"x": 700, "y": 150, "w": 1100, "h": 720}
        assert regioes[0]["slot_facecam"] == layout["compartilhada"]["slot_facecam"]
        assert regioes[0]["telas"] == 2

    def test_override_telas_unica_apenas_no_segmento(self):
        layout = normalizar_layout_youtube(
            {
                "modo_padrao": "compartilhada",
                "compartilhada": {"telas": 2},
                "regioes": [
                    {
                        "inicio": 5,
                        "fim": 10,
                        "modo": "compartilhada",
                        "compartilhada": {"telas": 1},
                    }
                ],
            }
        )
        regioes = regioes_compartilhadas(layout, duracao_seg=60)
        por_intervalo = {(r["inicio"], r["fim"]): r["telas"] for r in regioes}

        # Segmento [5,10] usa 1 tela; restante (0-5 e 10-60) herda 2.
        assert por_intervalo[(5.0, 10.0)] == 1
        assert por_intervalo[(0.0, 5.0)] == 2
        assert por_intervalo[(10.0, 60.0)] == 2

    def test_override_ignora_campos_invalidos_e_so_normaliza_validos(self):
        layout = normalizar_layout_youtube(
            {
                "modo_padrao": "full",
                "regioes": [
                    {
                        "inicio": 0,
                        "fim": 5,
                        "modo": "compartilhada",
                        "compartilhada": {"telas": 99, "crop_tela": "lixo"},
                    }
                ],
            }
        )
        # telas invalido cai no default 2; crop_tela invalido cai no default.
        regiao = layout["regioes"][0]
        assert regiao["compartilhada"]["telas"] == 2

    def test_normalizar_remove_override_vazio(self):
        layout = normalizar_layout_youtube(
            {
                "modo_padrao": "full",
                "regioes": [
                    {"inicio": 0, "fim": 5, "modo": "compartilhada", "compartilhada": {}},
                ],
            }
        )
        assert "compartilhada" not in layout["regioes"][0]


class TestMergeCompartilhada:
    def test_override_vazio_devolve_copia_do_base(self):
        base = {
            "telas": 2,
            "crop_facecam": {"x": 0, "y": 0, "w": 100, "h": 100},
            "crop_tela": {"x": 0, "y": 0, "w": 100, "h": 100},
            "slot_facecam": {"x": 0, "y": 0, "w": 100, "h": 100},
            "slot_tela": {"x": 0, "y": 0, "w": 100, "h": 100},
        }
        resultado = merge_compartilhada(base, None)
        assert resultado == base
        # Garantia de não-mutação: alterar o resultado não afeta o base.
        resultado["crop_facecam"]["x"] = 999
        assert base["crop_facecam"]["x"] == 0

    def test_override_substitui_so_chaves_presentes(self):
        base = {
            "telas": 2,
            "crop_facecam": {"x": 0, "y": 0, "w": 100, "h": 100},
            "crop_tela": {"x": 0, "y": 0, "w": 100, "h": 100},
            "slot_facecam": {"x": 0, "y": 0, "w": 100, "h": 100},
            "slot_tela": {"x": 0, "y": 0, "w": 100, "h": 100},
        }
        resultado = merge_compartilhada(
            base, {"telas": 1, "slot_tela": {"x": 50, "y": 50, "w": 200, "h": 200}}
        )
        assert resultado["telas"] == 1
        assert resultado["slot_tela"] == {"x": 50, "y": 50, "w": 200, "h": 200}
        assert resultado["slot_facecam"] == base["slot_facecam"]


class TestCascadeLazy:
    def test_corte_vazio_herda_global_quando_projeto_ausente(self):
        resolvido = resolver_layout_em_cascata(
            corte_layout=None,
            global_padrao={"fundo": "cosmograph", "compartilhada": {"telas": 1}},
        )
        assert resolvido["fundo"] == "cosmograph"
        assert resolvido["compartilhada"]["telas"] == 1

    def test_projeto_sobrescreve_global(self):
        resolvido = resolver_layout_em_cascata(
            corte_layout=None,
            projeto_padrao={"fundo": "hud-topo"},
            global_padrao={"fundo": "cosmograph"},
        )
        assert resolvido["fundo"] == "hud-topo"

    def test_corte_sobrescreve_projeto_e_global(self):
        resolvido = resolver_layout_em_cascata(
            corte_layout={"fundo": "topographic"},
            projeto_padrao={"fundo": "hud-topo"},
            global_padrao={"fundo": "cosmograph"},
        )
        assert resolvido["fundo"] == "topographic"

    def test_compartilhada_segue_cascade_quando_corte_intocado(self):
        global_padrao = {
            "compartilhada": {
                "telas": 1,
                "slot_tela": {"x": 700, "y": 150, "w": 1100, "h": 720},
            }
        }
        resolvido = resolver_layout_em_cascata(
            corte_layout={"modo_padrao": "full", "regioes": []},
            global_padrao=global_padrao,
        )
        assert resolvido["compartilhada"]["telas"] == 1
        # crop/slot vem do global
        assert resolvido["compartilhada"]["slot_tela"]["x"] == 700

    def test_projeto_padrao_string_serializada_e_respeitado(self):
        # I-025: projeto.layout_youtube_padrao chega como string (Text no DB).
        # Antes o isinstance(payload, dict) descartava silenciosamente o
        # cascade, e todo corte intocado nascia em 'full' mesmo com projeto
        # configurado como 'compartilhada'.
        projeto_json = json.dumps({"modo_padrao": "compartilhada", "fundo": "cosmograph"})
        resolvido = resolver_layout_em_cascata(
            corte_layout={"modo_padrao": "full", "regioes": []},
            projeto_padrao=projeto_json,
        )
        assert resolvido["modo_padrao"] == MODO_COMPARTILHADA
        assert resolvido["fundo"] == "cosmograph"

    def test_global_padrao_string_serializada_e_respeitado(self):
        # Mesmo cenário, mas no nível global (appSettings).
        global_json = json.dumps({"modo_padrao": "compartilhada"})
        resolvido = resolver_layout_em_cascata(
            corte_layout=None,
            global_padrao=global_json,
        )
        assert resolvido["modo_padrao"] == MODO_COMPARTILHADA

    def test_regioes_compartilhadas_consome_global_padrao(self):
        # Corte sem compartilhada explicito; segmento herda do global.
        regioes = regioes_compartilhadas(
            layout_youtube={
                "modo_padrao": "full",
                "regioes": [{"inicio": 10, "fim": 20, "modo": "compartilhada"}],
            },
            duracao_seg=60,
            global_padrao={"compartilhada": {"telas": 1}},
        )
        assert len(regioes) == 1
        assert regioes[0]["telas"] == 1


class TestPalcoCacheKeyOverride:
    def test_chave_por_config_distinta_do_base(self):
        layout = normalizar_layout_youtube(
            {
                "fundo": "hud-forte",
                "compartilhada": {
                    "telas": 2,
                    "slot_tela": {"x": 500, "y": 150, "w": 1325, "h": 720},
                },
            }
        )
        base = palco_cache_key(layout)
        override = palco_cache_key_para_config(
            {
                "telas": 1,
                "crop_facecam": layout["compartilhada"]["crop_facecam"],
                "crop_tela": layout["compartilhada"]["crop_tela"],
                "slot_facecam": layout["compartilhada"]["slot_facecam"],
                "slot_tela": {"x": 700, "y": 150, "w": 1100, "h": 720},
            },
            fundo="hud-forte",
            placa=PLACA_PADRAO,
        )
        assert base != override

    def test_mesmo_config_gera_mesma_chave(self):
        config = {
            "telas": 2,
            "crop_facecam": {"x": 24, "y": 410, "w": 340, "h": 260},
            "crop_tela": {"x": 365, "y": 180, "w": 1325, "h": 720},
            "slot_facecam": {"x": 54, "y": 405, "w": 340, "h": 260},
            "slot_tela": {"x": 500, "y": 150, "w": 1325, "h": 720},
        }
        a = palco_cache_key_para_config(config, fundo="hud-forte", placa=PLACA_PADRAO)
        b = palco_cache_key_para_config(dict(config), fundo="hud-forte", placa=dict(PLACA_PADRAO))
        assert a == b
