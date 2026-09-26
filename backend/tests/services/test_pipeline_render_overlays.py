"""O render dos overlays no Remotion: o comando, o bundle e os assets que ele
serve, e a cascata de layout que chega a cada chunk.

Parte do antigo test_pipeline_render.py (1927 linhas), dividido por assunto
no D-719. Os testes são os mesmos; só mudaram de arquivo.
"""

import asyncio
import json
from pathlib import Path

from app.infrastructure.render.overlay_codec import OverlayCodec, overlay_codec_profile
from app.infrastructure.render.remotion_bundle import compute_src_fingerprint
from app.services.render.pipeline_render import (
    _assets_servidos_do_bundle,
    _build_overlay_render_cmd,
)

# ─────────────────────────────────────────────────────────────
# _build_overlay_render_cmd (configuração injetada)
# ─────────────────────────────────────────────────────────────


class TestBuildOverlayRenderCmd:
    def _cmd(self, *, codec: OverlayCodec = OverlayCodec.VP9, **overrides):
        defaults = dict(
            composition="OverlayTimeline",
            bundle_arg="/tmp/bundle",
            output_path=Path("/tmp/chunk_001.webm"),
            props_file=Path("/tmp/props_001.json"),
            concurrency=4,
            codec_profile=overlay_codec_profile(codec),
        )
        defaults.update(overrides)
        return _build_overlay_render_cmd(**defaults)

    def test_inicia_com_npx_remotion_render(self):
        cmd = self._cmd()
        assert cmd[:3] == ["npx", "remotion", "render"]

    def test_inclui_concurrency_configurada(self):
        cmd = self._cmd(concurrency=6)
        idx = cmd.index("--concurrency")
        assert cmd[idx + 1] == "6"

    def test_concurrency_1_quando_economico(self):
        cmd = self._cmd(concurrency=1)
        idx = cmd.index("--concurrency")
        assert cmd[idx + 1] == "1"

    def test_codec_vp9_por_padrao(self):
        cmd = self._cmd(codec=OverlayCodec.VP9)
        assert "--codec=vp9" in cmd
        assert "--pixel-format=yuva420p" in cmd

    def test_codec_prores_quando_solicitado(self):
        cmd = self._cmd(codec=OverlayCodec.PRORES_4444)
        assert "--codec=prores" in cmd
        assert "--prores-profile=4444" in cmd
        assert "--pixel-format=yuva444p10le" in cmd

    def test_overwrite_presente(self):
        assert "--overwrite" in self._cmd()

    def test_aceita_composicao_overlayscene(self):
        cmd = self._cmd(composition="OverlayScene")
        assert "OverlayScene" in cmd
        assert "OverlayTimeline" not in cmd

    def test_aceita_composicao_overlaytimeline(self):
        cmd = self._cmd(composition="OverlayTimeline")
        assert "OverlayTimeline" in cmd


# ─────────────────────────────────────────────────────────────
# _preparar_bundle_overlay — integração com cache
# ─────────────────────────────────────────────────────────────


class TestAssetsServidosDoBundle:
    """D-190: o fingerprint do bundle precisa incluir os assets que o
    `remotion bundle` embute (mascote em public/sapo + theme.config.json).
    Sem isso, re-materializar o mascote de um canal não invalidava o cache
    e a maioria dos overlays sumia (bundle antigo servido).
    """

    @staticmethod
    def _montar_renderer(root: Path) -> Path:
        renderer = root / "video-renderer"
        (renderer / "src").mkdir(parents=True)
        (renderer / "src" / "index.ts").write_text("export const x = 1;", encoding="utf-8")
        (renderer / "package.json").write_text('{"name":"vr"}', encoding="utf-8")
        (renderer / "public" / "sapo").mkdir(parents=True)
        (renderer / "public" / "sapo" / "sapo_serio.png").write_bytes(b"png-serio")
        (renderer / "public" / "sapo" / "sapo_animado.png").write_bytes(b"png-animado")
        (renderer / "theme.config.json").write_text('{"cor":"#fff"}', encoding="utf-8")
        return renderer

    def test_inclui_pngs_do_mascote_e_theme(self, tmp_path):
        renderer = self._montar_renderer(tmp_path)
        nomes = {p.name for p in _assets_servidos_do_bundle(renderer)}
        assert "sapo_serio.png" in nomes
        assert "sapo_animado.png" in nomes
        assert "theme.config.json" in nomes

    def test_renderer_sem_public_nem_theme_nao_quebra(self, tmp_path):
        renderer = tmp_path / "video-renderer"
        (renderer / "src").mkdir(parents=True)
        assert _assets_servidos_do_bundle(renderer) == []

    def test_trocar_imagem_do_mascote_muda_o_fingerprint(self, tmp_path):
        renderer = self._montar_renderer(tmp_path)
        src = renderer / "src"
        pkg = renderer / "package.json"

        fp_antes = compute_src_fingerprint(
            src, extra_files=[pkg, *_assets_servidos_do_bundle(renderer)]
        )
        # Re-materializa uma pose com conteúdo novo (sem tocar em src/).
        (renderer / "public" / "sapo" / "sapo_serio.png").write_bytes(b"png-serio-v2")
        fp_depois = compute_src_fingerprint(
            src, extra_files=[pkg, *_assets_servidos_do_bundle(renderer)]
        )
        assert fp_antes != fp_depois

    def test_mudanca_no_theme_muda_o_fingerprint(self, tmp_path):
        renderer = self._montar_renderer(tmp_path)
        src = renderer / "src"
        pkg = renderer / "package.json"

        fp_antes = compute_src_fingerprint(
            src, extra_files=[pkg, *_assets_servidos_do_bundle(renderer)]
        )
        (renderer / "theme.config.json").write_text('{"cor":"#000"}', encoding="utf-8")
        fp_depois = compute_src_fingerprint(
            src, extra_files=[pkg, *_assets_servidos_do_bundle(renderer)]
        )
        assert fp_antes != fp_depois


# Testes do watcher + polling vivem em
# `tests/infrastructure/test_worker_queue.py` (a lógica foi extraída para
# `app.infrastructure.worker_queue`). Aqui permanecem só os testes de
# orquestração do pipeline.


class TestPrepararBundleOverlay:
    """Garante que o bundle é reaproveitado quando `src/` não mudou.

    Mocka `_executar_via_worker` (subprocess) e `settings.video_renderer_dir`
    para apontar para um diretório controlado por `tmp_path`.
    """

    @staticmethod
    def _preparar_renderer(tmp_path: Path) -> Path:
        renderer_dir = tmp_path / "video-renderer"
        (renderer_dir / "src").mkdir(parents=True)
        (renderer_dir / "src" / "index.ts").write_text("export {};\n", encoding="utf-8")
        (renderer_dir / "package.json").write_text('{"name": "v"}\n', encoding="utf-8")
        return renderer_dir

    @staticmethod
    def _fake_worker_que_materializa_bundle():
        from unittest.mock import AsyncMock

        async def side_effect(fila_dir, job_id, cmd, cwd, timeout=600, **_):
            # Detecta o argumento --out-dir e cria index.html lá
            try:
                out_idx = cmd.index("--out-dir") + 1
            except ValueError:
                return
            target = Path(cmd[out_idx])
            target.mkdir(parents=True, exist_ok=True)
            (target / "index.html").write_text("<html/>", encoding="utf-8")

        return AsyncMock(side_effect=side_effect)

    def test_segunda_chamada_reaproveita_bundle(self, tmp_path: Path, monkeypatch):
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )
        from app.services.render import pipeline_render as pr

        renderer_dir = self._preparar_renderer(tmp_path)
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(RenderSettings(bundle_cache_enabled=True))

        worker_mock = self._fake_worker_que_materializa_bundle()
        monkeypatch.setattr(pr, "_executar_via_worker", worker_mock)

        try:
            output_dir_a = tmp_path / "projeto_a" / "overlays"
            output_dir_b = tmp_path / "projeto_b" / "overlays"
            output_dir_a.mkdir(parents=True)
            output_dir_b.mkdir(parents=True)

            first = asyncio.run(pr._preparar_bundle_overlay(output_dir_a))
            second = asyncio.run(pr._preparar_bundle_overlay(output_dir_b))

            assert first == second
            assert worker_mock.await_count == 1
        finally:
            AppSettingsService.set_settings_path_for_tests(None)

    def test_mudanca_em_src_invalida_cache(self, tmp_path: Path, monkeypatch):
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )
        from app.services.render import pipeline_render as pr

        renderer_dir = self._preparar_renderer(tmp_path)
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(RenderSettings(bundle_cache_enabled=True))

        worker_mock = self._fake_worker_que_materializa_bundle()
        monkeypatch.setattr(pr, "_executar_via_worker", worker_mock)

        try:
            output_dir = tmp_path / "projeto_a" / "overlays"
            output_dir.mkdir(parents=True)

            asyncio.run(pr._preparar_bundle_overlay(output_dir))
            # Mudou o conteúdo de src/ → fingerprint diferente → re-bundle
            (renderer_dir / "src" / "index.ts").write_text(
                "export const v = 2;\n", encoding="utf-8"
            )
            asyncio.run(pr._preparar_bundle_overlay(output_dir))

            assert worker_mock.await_count == 2
        finally:
            AppSettingsService.set_settings_path_for_tests(None)

    def test_cache_desligado_sempre_rebundle_dentro_do_output(self, tmp_path: Path, monkeypatch):
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )
        from app.services.render import pipeline_render as pr

        renderer_dir = self._preparar_renderer(tmp_path)
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(RenderSettings(bundle_cache_enabled=False))

        worker_mock = self._fake_worker_que_materializa_bundle()
        monkeypatch.setattr(pr, "_executar_via_worker", worker_mock)

        try:
            output_dir_a = tmp_path / "projeto_a" / "overlays"
            output_dir_b = tmp_path / "projeto_b" / "overlays"
            output_dir_a.mkdir(parents=True)
            output_dir_b.mkdir(parents=True)

            first = asyncio.run(pr._preparar_bundle_overlay(output_dir_a))
            second = asyncio.run(pr._preparar_bundle_overlay(output_dir_b))

            # Com cache desligado, bundle vai dentro do próprio output_dir
            assert first == output_dir_a / "_remotion_bundle"
            assert second == output_dir_b / "_remotion_bundle"
            assert worker_mock.await_count == 2
        finally:
            AppSettingsService.set_settings_path_for_tests(None)


# ─────────────────────────────────────────────────────────────────────
# I-036: cascade de layout nos overlays (paridade com o preview do pós)
# ─────────────────────────────────────────────────────────────────────


class TestPrepararOverlayChunksCascadeLayout:
    """REGRESSAO I-036: um corte intocado (sentinela full + regioes vazias)
    cujo PROJETO tem padrao compartilhada renderizava os cards em modo full
    (sem layout_card_zone), tampando as janelas do palco — divergindo do
    preview, que resolve a cascade corte → projeto → global no router.
    """

    PROJETO_PADRAO = {
        "modo_padrao": "compartilhada",
        "fundo": "hud-forte",
        "compartilhada": {
            "telas": 2,
            "crop_facecam": {"x": 27, "y": 271, "w": 643, "h": 460},
            "crop_tela": {"x": 716, "y": 151, "w": 1107, "h": 619},
            "slot_facecam": {"x": 124, "y": 645, "w": 386, "h": 276},
            "slot_tela": {"x": 570, "y": 210, "w": 1273, "h": 712},
        },
    }

    def _corte_intocado(self) -> dict:
        return {
            "id": "corte-i036",
            "layout_youtube": json.dumps({"modo_padrao": "full", "regioes": []}),
            "cenas_remotion": json.dumps(
                {
                    "cenas": [
                        {"tipo": "card_informacao", "inicio": 1.0, "fim": 6.0, "texto": "x"},
                    ],
                }
            ),
        }

    def _cenas_dos_chunks(self, chunks: list[dict]) -> list[dict]:
        return [entry.cena_dict for chunk in chunks for entry in chunk["entries"]]

    def test_corte_intocado_herda_compartilhada_do_projeto(self):
        from app.services.render.pipeline_render import _preparar_overlay_chunks

        chunks = asyncio.run(
            _preparar_overlay_chunks(
                self._corte_intocado(),
                "vertical",
                projeto_padrao=json.dumps(self.PROJETO_PADRAO),
            )
        )

        cenas = self._cenas_dos_chunks(chunks)
        assert cenas, "chunk sem cenas"
        for cena in cenas:
            assert cena.get("layout_youtube_modo") == "compartilhada"
            zone = cena.get("layout_card_zone")
            assert zone is not None, (
                "Cena sem layout_card_zone — o card renderiza em modo full "
                "por cima das janelas do palco (I-036)."
            )
            # Zona restrita: nunca o canvas inteiro.
            assert zone["w"] < 1920 and zone["h"] < 1080

    def test_sem_padrao_do_projeto_preserva_modo_full(self):
        from app.services.render.pipeline_render import _preparar_overlay_chunks

        chunks = asyncio.run(_preparar_overlay_chunks(self._corte_intocado(), "vertical"))

        for cena in self._cenas_dos_chunks(chunks):
            assert cena.get("layout_youtube_modo") != "compartilhada"
            assert cena.get("layout_card_zone") is None
