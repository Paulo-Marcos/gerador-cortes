"""Os arquivos do render: tamanho mínimo, vídeo completo (síncrono e
assíncrono) e qual bruto o render usa.

Parte do antigo test_pipeline_render.py (1927 linhas), dividido por assunto
no D-719. Os testes são os mesmos; só mudaram de arquivo.
"""

import asyncio
import time
from pathlib import Path

from app.services.render.pipeline_render import (
    _arquivo_minimo,
    _find_clip_raw,
    _validar_video_completo,
    _validar_video_completo_sync,
)

# ─────────────────────────────────────────────────────────────
# _arquivo_minimo
# ─────────────────────────────────────────────────────────────


class TestArquivoMinimo:
    def test_arquivo_inexistente_retorna_false(self, tmp_path):
        assert _arquivo_minimo(tmp_path / "nao_existe.mp4", 100) is False

    def test_arquivo_abaixo_do_minimo_retorna_false(self, tmp_path):
        f = tmp_path / "pequeno.mp4"
        f.write_bytes(b"x" * 50)
        assert _arquivo_minimo(f, 100) is False

    def test_arquivo_exatamente_no_minimo_retorna_true(self, tmp_path):
        f = tmp_path / "exato.mp4"
        f.write_bytes(b"x" * 100)
        assert _arquivo_minimo(f, 100) is True

    def test_arquivo_acima_do_minimo_retorna_true(self, tmp_path):
        f = tmp_path / "grande.mp4"
        f.write_bytes(b"x" * 200)
        assert _arquivo_minimo(f, 100) is True

    def test_arquivo_vazio_retorna_false(self, tmp_path):
        f = tmp_path / "vazio.mp4"
        f.write_bytes(b"")
        assert _arquivo_minimo(f, 1) is False


# ─────────────────────────────────────────────────────────────
# _validar_video_completo_sync — implementação síncrona
# ─────────────────────────────────────────────────────────────


class TestValidarVideoCompletoSync:
    """Cobre o caminho síncrono (executado em thread via to_thread).
    Mockamos `subprocess.run` para evitar depender do ffprobe no CI."""

    @staticmethod
    def _arquivo_grande(tmp_path: Path) -> Path:
        f = tmp_path / "video.mp4"
        f.write_bytes(b"x" * (2 * 1024 * 1024))  # 2 MB
        return f

    def test_arquivo_inexistente_retorna_false(self, tmp_path):
        assert _validar_video_completo_sync(tmp_path / "nao_existe.mp4") is False

    def test_arquivo_menor_que_1mb_retorna_false(self, tmp_path):
        f = tmp_path / "minusculo.mp4"
        f.write_bytes(b"x" * 1024)
        assert _validar_video_completo_sync(f) is False

    def test_ffprobe_sucesso_retorna_true(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = self._arquivo_grande(tmp_path)
        fake_run = MagicMock(return_value=MagicMock(returncode=0, stderr=""))
        monkeypatch.setattr(sp, "run", fake_run)
        assert _validar_video_completo_sync(f) is True

    def test_ffprobe_moov_atom_not_found_retorna_false(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = self._arquivo_grande(tmp_path)
        fake_run = MagicMock(return_value=MagicMock(returncode=1, stderr="moov atom not found"))
        monkeypatch.setattr(sp, "run", fake_run)
        assert _validar_video_completo_sync(f) is False

    def test_ffprobe_invalid_data_retorna_false(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = self._arquivo_grande(tmp_path)
        fake_run = MagicMock(return_value=MagicMock(returncode=1, stderr="Invalid data found"))
        monkeypatch.setattr(sp, "run", fake_run)
        assert _validar_video_completo_sync(f) is False

    def test_ffprobe_erro_desconhecido_aceita_por_tamanho(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = self._arquivo_grande(tmp_path)
        fake_run = MagicMock(return_value=MagicMock(returncode=42, stderr="estranho"))
        monkeypatch.setattr(sp, "run", fake_run)
        # Arquivo é grande (2 MB) e o erro não é diagnóstico — aceita
        assert _validar_video_completo_sync(f) is True

    def test_ffprobe_nao_instalado_aceita_por_tamanho(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = self._arquivo_grande(tmp_path)
        fake_run = MagicMock(side_effect=FileNotFoundError("ffprobe"))
        monkeypatch.setattr(sp, "run", fake_run)
        assert _validar_video_completo_sync(f) is True


class TestValidarVideoCompletoAsync:
    """A versão async deve apenas delegar à versão síncrona via thread,
    sem bloquear o event loop. Cobertura: o event loop continua livre
    para outras tarefas enquanto a validação roda."""

    def test_wrapper_async_retorna_mesmo_resultado_que_sync(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = tmp_path / "video.mp4"
        f.write_bytes(b"x" * (2 * 1024 * 1024))
        monkeypatch.setattr(sp, "run", MagicMock(return_value=MagicMock(returncode=0, stderr="")))

        assert asyncio.run(_validar_video_completo(f)) is True

    def test_event_loop_nao_bloqueia(self, tmp_path, monkeypatch):
        """Enquanto a validação roda em thread, o event loop deve
        continuar processando outras coroutines."""
        import subprocess as sp
        from unittest.mock import MagicMock

        f = tmp_path / "video.mp4"
        f.write_bytes(b"x" * (2 * 1024 * 1024))

        def lento(*args, **kwargs):
            time.sleep(0.2)
            return MagicMock(returncode=0, stderr="")

        monkeypatch.setattr(sp, "run", lento)

        async def cenario():
            ticks = {"n": 0}

            async def heartbeat():
                for _ in range(10):
                    ticks["n"] += 1
                    await asyncio.sleep(0.03)

            beat_task = asyncio.create_task(heartbeat())
            ok = await _validar_video_completo(f)
            await beat_task
            return ok, ticks["n"]

        ok, batimentos = asyncio.run(cenario())
        assert ok is True
        # Se o event loop estivesse bloqueado pelos 200ms, batimentos seria ~0
        assert batimentos >= 5


# ─────────────────────────────────────────────────────────────
# _find_clip_raw — deteccao robusta do bruto (D-157)
# ─────────────────────────────────────────────────────────────


def _tocar(dir_: Path, nome: str) -> Path:
    """Cria um arquivo falso (o worktree nao tem os brutos reais de 70GB)."""
    p = dir_ / nome
    p.write_bytes(b"x")
    return p


def test_find_clip_raw_prefere_canonico(tmp_path):
    # Canonico ganha mesmo com um nome-com-timestamp presente na pasta.
    _tocar(tmp_path, "clip_raw_1782788554946.mkv")
    canonico = _tocar(tmp_path, "clip_raw_base.mkv")

    assert _find_clip_raw(tmp_path) == canonico


def test_find_clip_raw_glob_por_timestamp(tmp_path):
    # Caso que falhava: so ha um bruto com timestamp, sem nome canonico.
    bruto = _tocar(tmp_path, "clip_raw_1782788554946.mkv")

    assert _find_clip_raw(tmp_path) == bruto


def test_find_clip_raw_deprioriza_backup(tmp_path):
    # Backup com silencios e ultimo recurso: perde para qualquer outro clip_raw*.
    bruto = _tocar(tmp_path, "clip_raw_123.mkv")
    _tocar(tmp_path, "clip_raw_backup_com_silencios.mkv")

    assert _find_clip_raw(tmp_path) == bruto


def test_find_clip_raw_backup_como_ultimo_recurso(tmp_path):
    # Se so ha backup, ele e devolvido (melhor que nada).
    backup = _tocar(tmp_path, "clip_raw_backup_com_silencios.mkv")

    assert _find_clip_raw(tmp_path) == backup


def test_find_clip_raw_pasta_vazia_retorna_none(tmp_path):
    assert _find_clip_raw(tmp_path) is None
