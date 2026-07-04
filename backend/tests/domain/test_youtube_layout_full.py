"""Testes do posicionamento FULL no contrato de layout YouTube (F-060)."""

from pathlib import Path

from app.domain.ffmpeg_commands import build_cinematic_grade_cmd
from app.domain.youtube_layout import (
    DEFAULT_FULL_CROP,
    DEFAULT_FULL_SLOT,
    config_compartilhada_para_full,
    full_config_e_default,
    merge_full,
    normalizar_layout_youtube,
    regioes_full_posicionadas,
)

CROP_PESSOA = {"x": 200, "y": 100, "w": 960, "h": 540}
SLOT_CENTRO = {"x": 480, "y": 270, "w": 960, "h": 540}


class TestNormalizacaoFull:
    def test_layout_sem_full_recebe_default(self):
        layout = normalizar_layout_youtube({"modo_padrao": "full"})
        assert layout["full"] == {"crop": DEFAULT_FULL_CROP, "slot": DEFAULT_FULL_SLOT}

    def test_full_custom_preservado_com_slot_proporcional(self):
        layout = normalizar_layout_youtube(
            {"modo_padrao": "full", "full": {"crop": CROP_PESSOA, "slot": SLOT_CENTRO}}
        )
        assert layout["full"]["crop"] == CROP_PESSOA
        assert layout["full"]["slot"] == SLOT_CENTRO

    def test_slot_e_corrigido_para_proporcao_do_crop(self):
        layout = normalizar_layout_youtube(
            {
                "modo_padrao": "full",
                # slot 16:9 com crop 4:3 — o slot encolhe na largura.
                "full": {
                    "crop": {"x": 0, "y": 0, "w": 800, "h": 600},
                    "slot": {"x": 0, "y": 0, "w": 1920, "h": 1080},
                },
            }
        )
        slot = layout["full"]["slot"]
        assert slot["h"] == 1080
        assert slot["w"] == 1440  # 800 * (1080/600)

    def test_full_marca_corte_como_configurado(self):
        # Corte com so o full custom NAO herda modo do fallback.
        layout = normalizar_layout_youtube(
            {"modo_padrao": "full", "full": {"crop": CROP_PESSOA}},
            fallback_layout={"modo_padrao": "compartilhada"},
        )
        assert layout["modo_padrao"] == "full"

    def test_cascade_herda_full_do_projeto(self):
        projeto = {"modo_padrao": "full", "full": {"crop": CROP_PESSOA, "slot": SLOT_CENTRO}}
        layout = normalizar_layout_youtube(
            {"modo_padrao": "full", "regioes": []}, fallback_layout=projeto
        )
        assert layout["full"]["crop"] == CROP_PESSOA

    def test_segmento_padrao_preservado_no_roundtrip(self):
        # routers/cortes.py normaliza antes de gravar — sem preservacao aqui,
        # os padroes de segmento sumiam no save (bug latente do I-029).
        payload = {
            "modo_padrao": "full",
            "full_segmento": {"crop": CROP_PESSOA, "slot": SLOT_CENTRO},
            "compartilhada_segmento": {"telas": 1},
        }
        layout = normalizar_layout_youtube(payload)
        assert layout["full_segmento"]["crop"] == CROP_PESSOA
        assert layout["compartilhada_segmento"]["telas"] == 1

    def test_regiao_full_com_override_normalizada(self):
        layout = normalizar_layout_youtube(
            {
                "modo_padrao": "compartilhada",
                "regioes": [
                    {"inicio": 10, "fim": 20, "modo": "full", "full": {"crop": CROP_PESSOA}},
                ],
            }
        )
        assert layout["regioes"][0]["full"]["crop"] == CROP_PESSOA
        assert "slot" not in layout["regioes"][0]["full"]


class TestHelpersFull:
    def test_merge_full_override_parcial(self):
        base = {"crop": dict(DEFAULT_FULL_CROP), "slot": dict(DEFAULT_FULL_SLOT)}
        merged = merge_full(base, {"crop": CROP_PESSOA})
        assert merged["crop"] == CROP_PESSOA
        assert merged["slot"] == DEFAULT_FULL_SLOT

    def test_full_config_e_default(self):
        assert full_config_e_default(
            {"crop": dict(DEFAULT_FULL_CROP), "slot": dict(DEFAULT_FULL_SLOT)}
        )
        assert not full_config_e_default({"crop": CROP_PESSOA, "slot": dict(DEFAULT_FULL_SLOT)})

    def test_config_compartilhada_para_full(self):
        config = config_compartilhada_para_full({"crop": CROP_PESSOA, "slot": SLOT_CENTRO})
        assert config["telas"] == 1
        assert config["crop_tela"] == CROP_PESSOA
        assert config["slot_tela"] == SLOT_CENTRO


class TestRegioesFullPosicionadas:
    def test_full_default_nao_gera_regioes(self):
        layout = normalizar_layout_youtube({"modo_padrao": "full"})
        assert regioes_full_posicionadas(layout, 60.0) == []

    def test_full_custom_cobre_o_corte_inteiro(self):
        layout = {"modo_padrao": "full", "full": {"crop": CROP_PESSOA, "slot": SLOT_CENTRO}}
        regioes = regioes_full_posicionadas(layout, 60.0)
        assert len(regioes) == 1
        assert regioes[0]["inicio"] == 0.0
        assert regioes[0]["fim"] == 60.0
        assert regioes[0]["crop"] == CROP_PESSOA

    def test_full_e_complemento_das_regioes_compartilhadas(self):
        layout = {
            "modo_padrao": "full",
            "full": {"crop": CROP_PESSOA, "slot": SLOT_CENTRO},
            "regioes": [{"inicio": 10, "fim": 20, "modo": "compartilhada"}],
        }
        regioes = regioes_full_posicionadas(layout, 60.0)
        intervalos = [(r["inicio"], r["fim"]) for r in regioes]
        assert intervalos == [(0.0, 10.0), (20.0, 60.0)]

    def test_override_de_segmento_full(self):
        outro_crop = {"x": 0, "y": 0, "w": 1280, "h": 720}
        layout = {
            "modo_padrao": "full",
            "full": {"crop": CROP_PESSOA, "slot": SLOT_CENTRO},
            "regioes": [
                {"inicio": 30, "fim": 40, "modo": "full", "full": {"crop": outro_crop}},
            ],
        }
        regioes = regioes_full_posicionadas(layout, 60.0)
        fatia_override = next(r for r in regioes if r["inicio"] == 30.0)
        assert fatia_override["crop"] == outro_crop
        # Slot herda da base do corte.
        assert fatia_override["slot"] == SLOT_CENTRO


class TestRenderFullPosicionado:
    def test_filtergraph_inclui_crop_do_full(self):
        layout = {"modo_padrao": "full", "full": {"crop": CROP_PESSOA, "slot": SLOT_CENTRO}}
        cmd = build_cinematic_grade_cmd(
            Path("raw.mkv"), Path("out.mp4"), layout_youtube=layout, duracao_seg=60.0
        )
        filtro = " ".join(cmd)
        assert "crop=960:540:200:100" in filtro

    def test_full_default_mantem_caminho_legado(self):
        cmd = build_cinematic_grade_cmd(
            Path("raw.mkv"),
            Path("out.mp4"),
            layout_youtube={"modo_padrao": "full"},
            duracao_seg=60.0,
        )
        assert "crop=" not in " ".join(cmd)
