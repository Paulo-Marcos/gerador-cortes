"""As fases do render: o que pular, os apelidos de fase e o que limpar ao
recomeçar de uma fase.

Parte do antigo test_pipeline_render.py (1927 linhas), dividido por assunto
no D-719. Os testes são os mesmos; só mudaram de arquivo.
"""

import pytest
from app.services.render.pipeline_render import (
    _deve_limpar_artefatos,
    _deve_pular_fase,
    _limpar_a_partir_de,
    _normalizar_fase_alias,
)

# ─────────────────────────────────────────────────────────────
# _deve_pular_fase
# ─────────────────────────────────────────────────────────────


class TestDevePularFase:
    def test_artefato_invalido_nunca_pula(self):
        assert _deve_pular_fase("grade", "auto", continuar=True, artefato_valido=False) is False

    def test_start_from_auto_continuar_true_pula_se_valido(self):
        assert _deve_pular_fase("grade", "auto", continuar=True, artefato_valido=True) is True

    def test_start_from_auto_continuar_false_nao_pula(self):
        assert _deve_pular_fase("grade", "auto", continuar=False, artefato_valido=True) is False

    def test_fase_anterior_ao_start_from_pula(self):
        # grade (1) < overlays (2) → deve pular grade quando start_from=overlays
        assert _deve_pular_fase("grade", "overlays", continuar=True, artefato_valido=True) is True

    def test_mesma_fase_que_start_from_nao_pula(self):
        # grade (1) não é menor que grade (1)
        assert _deve_pular_fase("grade", "grade", continuar=True, artefato_valido=True) is False

    def test_fase_posterior_ao_start_from_nao_pula(self):
        # render_final (3) > overlays (2) → não pula render_final ao retomar de overlays
        assert (
            _deve_pular_fase("render_final", "overlays", continuar=True, artefato_valido=True)
            is False
        )

    def test_render_final_pula_grade_e_overlays(self):
        assert (
            _deve_pular_fase("grade", "render_final", continuar=True, artefato_valido=True) is True
        )
        assert (
            _deve_pular_fase("overlays", "render_final", continuar=True, artefato_valido=True)
            is True
        )

    def test_render_final_nao_pula_render_final_em_si(self):
        assert (
            _deve_pular_fase("render_final", "render_final", continuar=True, artefato_valido=True)
            is False
        )

    def test_alias_compose_e_encode_apontam_para_render_final(self):
        """Retrocompatibilidade: o pipeline antigo expunha `compose` e
        `encode` como fases distintas. Hoje são a mesma fase fundida —
        aliases para `render_final`."""
        # Pedir start_from=encode pula grade e overlays
        assert _deve_pular_fase("grade", "encode", continuar=True, artefato_valido=True) is True
        assert _deve_pular_fase("overlays", "encode", continuar=True, artefato_valido=True) is True
        # E não pula a fase final (que é o destino do retomar)
        assert (
            _deve_pular_fase("render_final", "encode", continuar=True, artefato_valido=True)
            is False
        )
        # Mesma coisa via alias `compose`
        assert _deve_pular_fase("grade", "compose", continuar=True, artefato_valido=True) is True
        assert (
            _deve_pular_fase("render_final", "compose", continuar=True, artefato_valido=True)
            is False
        )
        # Aliases entre si: como mapeiam pra mesma fase canônica, não pula
        assert _deve_pular_fase("compose", "encode", continuar=True, artefato_valido=True) is False
        assert _deve_pular_fase("encode", "compose", continuar=True, artefato_valido=True) is False

    def test_fase_desconhecida_pula_silenciosamente(self):
        # AVISO: fase desconhecida recebe ordem 0, que é menor que qualquer fase real.
        # Resultado: typos como "gread" passam silenciosamente como "pular esta fase".
        # Isso NÃO é um erro intencional — é um risco de design a monitorar.
        assert (
            _deve_pular_fase("fase_estranha", "grade", continuar=True, artefato_valido=True) is True
        )


# ─────────────────────────────────────────────────────────────
# _normalizar_fase_alias
# ─────────────────────────────────────────────────────────────


class TestNormalizarFaseAlias:
    def test_compose_vira_render_final(self):
        assert _normalizar_fase_alias("compose") == "render_final"

    def test_encode_vira_render_final(self):
        assert _normalizar_fase_alias("encode") == "render_final"

    @pytest.mark.parametrize("fase_canonica", ["grade", "overlays", "render_final", "auto"])
    def test_fases_canonicas_passam_intactas(self, fase_canonica):
        assert _normalizar_fase_alias(fase_canonica) == fase_canonica

    def test_fase_desconhecida_passa_intacta(self):
        assert _normalizar_fase_alias("xpto") == "xpto"


# ─────────────────────────────────────────────────────────────
# _deve_limpar_artefatos
# ─────────────────────────────────────────────────────────────


class TestDeveLimparArtefatos:
    def test_continuar_false_sempre_limpa(self):
        assert _deve_limpar_artefatos(continuar=False, start_from="auto") is True
        assert _deve_limpar_artefatos(continuar=False, start_from="grade") is True
        assert _deve_limpar_artefatos(continuar=False, start_from="overlays") is True

    def test_auto_com_continuar_nao_limpa(self):
        assert _deve_limpar_artefatos(continuar=True, start_from="auto") is False

    def test_overlays_com_continuar_nao_limpa(self):
        """Modo Continuar Fase 2: preserva chunks renderizados."""
        assert _deve_limpar_artefatos(continuar=True, start_from="overlays") is False

    def test_grade_com_continuar_limpa(self):
        """Reinício explícito em 'grade' apaga intermediários adiante."""
        assert _deve_limpar_artefatos(continuar=True, start_from="grade") is True

    def test_render_final_com_continuar_limpa(self):
        assert _deve_limpar_artefatos(continuar=True, start_from="render_final") is True

    def test_aliases_compose_encode_seguem_render_final(self):
        assert _deve_limpar_artefatos(continuar=True, start_from="compose") is True
        assert _deve_limpar_artefatos(continuar=True, start_from="encode") is True


# ─────────────────────────────────────────────────────────────
# _limpar_a_partir_de
# ─────────────────────────────────────────────────────────────


class TestLimparAPartirDe:
    """`_limpar_a_partir_de` remove artefatos intermediários por fase
    mas PRESERVA o `video_final.mp4` publicado (somente o arquivo
    temporário `video.rendering.mp4` é apagado). Isso protege contra
    perda do output já entregue ao usuário se o pipeline reinicia.
    """

    @staticmethod
    def _setup(tmp_path):
        graded = tmp_path / "graded"
        overlays = tmp_path / "overlays"
        upload = tmp_path / "upload_ready"
        graded.mkdir()
        overlays.mkdir()
        upload.mkdir()
        (graded / "clip_graded.mp4").write_bytes(b"g" * 100)
        (overlays / "chunk_001.mov").write_bytes(b"o" * 100)
        video_final = upload / "video.mp4"
        video_final.write_bytes(b"f" * 100)
        # Temporário "rendering" — esse SIM deve ser limpo
        video_rendering = upload / "video.rendering.mp4"
        video_rendering.write_bytes(b"t" * 100)
        return graded, overlays, video_final, video_rendering

    def test_grade_limpa_graded_e_overlays(self, tmp_path):
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("grade", graded, overlays, video_final)
        assert not (graded / "clip_graded.mp4").exists()
        assert not (overlays / "chunk_001.mov").exists()
        # video_final publicado é preservado; apenas o .rendering temp é apagado
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_overlays_preserva_graded(self, tmp_path):
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("overlays", graded, overlays, video_final)
        assert (graded / "clip_graded.mp4").exists()
        assert not (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_render_final_preserva_graded_e_overlays(self, tmp_path):
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("render_final", graded, overlays, video_final)
        assert (graded / "clip_graded.mp4").exists()
        assert (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_alias_compose_se_comporta_como_render_final(self, tmp_path):
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("compose", graded, overlays, video_final)
        assert (graded / "clip_graded.mp4").exists()
        assert (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_alias_encode_se_comporta_como_render_final(self, tmp_path):
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("encode", graded, overlays, video_final)
        assert (graded / "clip_graded.mp4").exists()
        assert (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_fase_desconhecida_cai_em_grade(self, tmp_path):
        graded, overlays, video_final, _ = self._setup(tmp_path)
        _limpar_a_partir_de("xpto", graded, overlays, video_final)
        # Comportamento defensivo: typo → limpeza total de intermediários
        assert not (graded / "clip_graded.mp4").exists()

    def test_so_grade_preserva_overlays(self, tmp_path):
        # D-064: render parcial "só a grade" (start_from=grade, parar_em=grade)
        # apaga apenas o graded e PRESERVA os overlays já renderizados —
        # corrigir a grade não deve custar uma nova rodada de overlays.
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("grade", graded, overlays, video_final, parar_em="grade")
        assert not (graded / "clip_graded.mp4").exists()
        assert (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_grade_ate_overlays_limpa_ambos(self, tmp_path):
        # parar_em='overlays' inclui overlays no alcance → limpa os dois.
        graded, overlays, video_final, _ = self._setup(tmp_path)
        _limpar_a_partir_de("grade", graded, overlays, video_final, parar_em="overlays")
        assert not (graded / "clip_graded.mp4").exists()
        assert not (overlays / "chunk_001.mov").exists()

    def test_grade_com_continuar_preserva_overlays(self, tmp_path):
        # D-064: "deu problema na grade, mas os overlays já terminaram" →
        # refaz a grade até o final reaproveitando (continuar=True) os overlays
        # prontos. Sem parar_em (roda até o render final), mas continuar manda
        # preservar os overlays — eles independem do conteúdo da grade.
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("grade", graded, overlays, video_final, parar_em=None, continuar=True)
        assert not (graded / "clip_graded.mp4").exists()
        assert (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_grade_refazer_do_zero_limpa_overlays(self, tmp_path):
        # "Reprocessar tudo" (continuar=False) reinicia pela grade e apaga
        # também os overlays — comportamento histórico do "começar do zero".
        graded, overlays, video_final, _ = self._setup(tmp_path)
        _limpar_a_partir_de("grade", graded, overlays, video_final, parar_em=None, continuar=False)
        assert not (graded / "clip_graded.mp4").exists()
        assert not (overlays / "chunk_001.mov").exists()
