"""Testes do composite pré-composto do palco (D-415).

Cobrem a geração dos assets derivados (bgpre opaco + chrome mascarado aos
slots), a estrutura do graph pré-composto (cadeia yuv420p, 1 overlay de chrome)
e o roteamento: full-cover e segmentos usam o graph novo quando há derivados;
kill-switch e falha de derivação caem no graph legado.
"""

from pathlib import Path

import app.infrastructure.render.ffmpeg_commands as fc
from app.infrastructure.render.ffmpeg_commands import build_grade_precomposto_filter
from app.infrastructure.render.palco_derivados import PalcoDerivados, ensure_derivados_palco
from PIL import Image

REGIAO = {
    "telas": 2,
    "inicio": 0.0,
    "fim": 30.0,
    "crop_tela": {"w": 1280, "h": 720, "x": 320, "y": 180},
    "slot_tela": {"w": 1200, "h": 600, "x": 560, "y": 220},
    "crop_facecam": {"w": 300, "h": 200, "x": 0, "y": 0},
    "slot_facecam": {"w": 210, "h": 140, "x": 120, "y": 470},
}


def _palco_sintetico(path: Path) -> Path:
    """Palco 1920x1080: chrome opaco cobrindo tudo, janelas transparentes nos
    slots (com uma borda de chrome invadindo 10px para dentro de cada slot)."""
    im = Image.new("RGBA", (1920, 1080), (40, 60, 50, 255))
    for slot in (REGIAO["slot_tela"], REGIAO["slot_facecam"]):
        x, y, w, h = slot["x"], slot["y"], slot["w"], slot["h"]
        furo = Image.new("RGBA", (w - 20, h - 20), (0, 0, 0, 0))
        im.paste(furo, (x + 10, y + 10))
    im.save(path)
    return path


class TestEnsureDerivados:
    def test_gera_bgpre_opaco_e_chrome_mascarado(self, tmp_path):
        palco = _palco_sintetico(tmp_path / "palco.png")
        d = ensure_derivados_palco(palco, REGIAO)
        assert d is not None

        bg = Image.open(d.bg_pre)
        assert bg.mode == "RGB"  # opaco: habilita a cadeia yuv420p
        assert bg.size == (1920, 1080)

        chrome = Image.open(d.chrome).convert("RGBA")
        # bbox-união dos slots: x 120..1760, y 220..820
        assert (d.chrome_x, d.chrome_y) == (120, 220)
        assert chrome.size == (1760 - 120, 820 - 220)
        # alpha mascarado: chrome só DENTRO dos slots (borda de 10px), zero no
        # gap entre os slots (evita double-blend com o bgpre).
        alpha = chrome.getchannel("A")
        assert alpha.getpixel((560 - 120 + 2, 220 - 220 + 2)) == 255  # borda no slot tela
        assert alpha.getpixel((560 - 120 + 50, 220 - 220 + 50)) == 0  # miolo transparente
        assert alpha.getpixel((450, 300)) == 0  # fora dos slots (baked no bgpre)

    def test_reusa_cache_e_invalida_por_mtime(self, tmp_path):
        palco = _palco_sintetico(tmp_path / "palco.png")
        d1 = ensure_derivados_palco(palco, REGIAO)
        m1 = Path(d1.bg_pre).stat().st_mtime_ns
        d2 = ensure_derivados_palco(palco, REGIAO)
        assert Path(d2.bg_pre).stat().st_mtime_ns == m1  # cache hit

        # Palco regenerado (mtime avança) → derivados regenerados.
        import os
        import time

        agora = time.time() + 10
        os.utime(palco, (agora, agora))
        d3 = ensure_derivados_palco(palco, REGIAO)
        assert Path(d3.bg_pre).stat().st_mtime_ns > m1

    def test_slot_degenerado_retorna_none(self, tmp_path):
        palco = _palco_sintetico(tmp_path / "palco.png")
        regiao = {**REGIAO, "slot_tela": {"w": 0, "h": 600, "x": 560, "y": 220}}
        assert ensure_derivados_palco(palco, regiao) is None


class TestGraphPrecomposto:
    def _derivado(self, tmp_path) -> PalcoDerivados:
        palco = _palco_sintetico(tmp_path / "palco.png")
        return ensure_derivados_palco(palco, REGIAO)

    def test_cadeia_principal_yuv_e_um_overlay_de_chrome(self, tmp_path):
        d = self._derivado(tmp_path)
        f = build_grade_precomposto_filter(None, REGIAO, d, duracao_seg=30)
        # Cadeia principal em yuv420p (o ganho medido no bench D-415)...
        assert "format=yuv420p" in f
        # ...sem as marcas do graph legado: color= base, palco full, rgba full.
        assert "color=c=black" not in f
        assert f.count("format=rgba") == 1  # só o chrome
        assert "[chrome0]overlay=x=120:y=220" in f
        # Âncora de duração finita (bgpre/chrome são fontes infinitas).
        assert "trim=end=30.000" in f
        assert f.rstrip().endswith("format=nv12[vout]")

    def test_telas_1_nao_faz_split(self, tmp_path):
        d = self._derivado(tmp_path)
        f = build_grade_precomposto_filter(None, {**REGIAO, "telas": 1}, d, duracao_seg=10)
        assert "split=" not in f
        assert "face0" not in f


class TestRoteamentoGrade:
    def _monkeypatch_resolvers(self, monkeypatch, tmp_path, derivado):
        palco = _palco_sintetico(tmp_path / "palco.png")
        monkeypatch.setattr(fc, "_resolve_shared_fg_png_para_config", lambda *a, **k: palco)
        monkeypatch.setattr(fc, "_resolve_palco_derivados", lambda *a, **k: derivado)
        return palco

    def _cmd(self):
        return fc.build_cinematic_grade_cmd(
            Path("in.mp4"),
            Path("out.mp4"),
            layout_youtube={"modo": "compartilhada"},
            duracao_seg=30.0,
            hwaccel_decode=False,
        )

    def _layout_full_cover(self, monkeypatch):
        monkeypatch.setattr(
            fc,
            "regioes_compartilhadas",
            lambda *a, **k: [dict(REGIAO)],
        )
        monkeypatch.setattr(fc, "regioes_full_posicionadas", lambda *a, **k: [])
        monkeypatch.setattr(
            fc,
            "resolver_layout_em_cascata",
            lambda **k: {"fundo": "f", "placa": {}},
        )

    def test_full_cover_usa_graph_precomposto(self, monkeypatch, tmp_path):
        self._layout_full_cover(monkeypatch)
        d = PalcoDerivados(tmp_path / "bg.png", tmp_path / "ch.png", 120, 220)
        self._monkeypatch_resolvers(monkeypatch, tmp_path, d)
        cmd = self._cmd()
        joined = " ".join(cmd)
        assert "bg.png" in joined and "ch.png" in joined
        filtro = cmd[cmd.index("-filter_complex") + 1]
        assert "[chrome0]" in filtro
        assert "color=c=black" not in filtro

    def test_falha_na_derivacao_cai_no_graph_legado(self, monkeypatch, tmp_path):
        self._layout_full_cover(monkeypatch)
        palco = self._monkeypatch_resolvers(monkeypatch, tmp_path, None)
        cmd = self._cmd()
        assert str(palco) in cmd  # input é o palco full-frame
        filtro = cmd[cmd.index("-filter_complex") + 1]
        assert "[chrome0]" not in filtro
        assert "color=c=black" in filtro

    def test_kill_switch_desliga_precomposto(self, monkeypatch, tmp_path):
        monkeypatch.setenv("GRADE_PALCO_PRECOMPOSTO", "0")
        self._layout_full_cover(monkeypatch)
        chamadas = []
        palco = _palco_sintetico(tmp_path / "palco.png")
        monkeypatch.setattr(fc, "_resolve_shared_fg_png_para_config", lambda *a, **k: palco)
        monkeypatch.setattr(
            fc,
            "_resolve_palco_derivados",
            lambda *a, **k: chamadas.append(1),
        )
        cmd = self._cmd()
        assert not chamadas  # nem tenta derivar
        filtro = cmd[cmd.index("-filter_complex") + 1]
        assert "[chrome0]" not in filtro

    def test_segmento_com_derivado_usa_graph_precomposto(self, tmp_path):
        from app.infrastructure.render.ffmpeg_commands import _build_grade_segment_cmd

        d = PalcoDerivados(tmp_path / "bg.png", tmp_path / "ch.png", 120, 220)
        cmd = _build_grade_segment_cmd(
            Path("in.mp4"),
            Path("seg.ts"),
            inicio=10.0,
            dur=15.0,
            filtro_vf=None,
            region_rel={**REGIAO, "inicio": 0.0, "fim": 15.0},
            fg_png=tmp_path / "palco.png",
            global_quality=27,
            derivado=d,
        )
        joined = " ".join(cmd)
        assert "bg.png" in joined and "ch.png" in joined
        filtro = cmd[cmd.index("-filter_complex") + 1]
        assert "[chrome0]overlay=x=120:y=220" in filtro
        assert "trim=end=15.000" in filtro
        assert "color=c=black" not in filtro
