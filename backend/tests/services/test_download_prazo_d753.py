"""O yt-dlp da ingestão tem prazo — de silêncio, não de duração (D-753).

Rodava sem prazo nenhum: um download pendurado prendia a ingestão para sempre,
sem erro na tela. Como uma live grande leva horas, o critério é INATIVIDADE:
nenhuma linha nova por um tempo. Os fakes abaixo fazem o papel do yt-dlp.
"""

import asyncio
import sys
import time

import psutil
import pytest
from app.services import ingestao
from app.services.ingestao import DownloadSemSinal, _rodar_ytdlp_lendo_saida

# Escreve uma linha de progresso e fica mudo para sempre — o travamento.
_MUDO_DEPOIS_DE_COMECAR = (
    "import sys, time\n"
    "print('[download]  12.0% of 1.00GiB'); sys.stdout.flush()\n"
    "time.sleep(3600)\n"
)

# Fala a cada 0,3 s por 2 s: mais tempo total que o prazo, mas nunca mudo.
_LENTO_MAS_VIVO = (
    "import sys, time\n"
    "for i in range(7):\n"
    "    print(f'[download]  {i * 10}.0% of 1.00GiB'); sys.stdout.flush()\n"
    "    time.sleep(0.3)\n"
)

pytestmark = pytest.mark.integration  # sobe processos reais (D-751)


def _pid_de_quem_rodou(monkeypatch) -> list[int]:
    """Guarda o PID que o vigia mandou encerrar."""
    encerrados: list[int] = []
    original = ingestao.encerrar_arvore

    def encerrar(pid: int) -> None:
        encerrados.append(pid)
        original(pid)

    monkeypatch.setattr(ingestao, "encerrar_arvore", encerrar)
    return encerrados


class TestNaThread:
    def test_silencio_alem_do_prazo_encerra_o_processo(self, monkeypatch):
        encerrados = _pid_de_quem_rodou(monkeypatch)
        inicio = time.monotonic()

        with pytest.raises(DownloadSemSinal, match="sem dar sinal"):
            _rodar_ytdlp_lendo_saida(
                [sys.executable, "-c", _MUDO_DEPOIS_DE_COMECAR], lambda _p: None, inatividade_s=1
            )

        assert time.monotonic() - inicio < 30, "o vigia não disparou"
        assert encerrados and not psutil.pid_exists(encerrados[0])

    def test_quem_continua_falando_termina_mesmo_passando_do_prazo_total(self):
        vistos: list[float] = []

        codigo = _rodar_ytdlp_lendo_saida(
            [sys.executable, "-c", _LENTO_MAS_VIVO], vistos.append, inatividade_s=1
        )

        assert codigo == 0
        assert vistos[-1] == 60.0


class TestNoCaminhoAssincrono:
    """O caminho de sempre da ingestão (`create_subprocess_exec`)."""

    @staticmethod
    def _trocar_ytdlp_por(monkeypatch, tmp_path, script: str) -> None:
        original = asyncio.create_subprocess_exec

        async def falso(*_cmd, **kwargs):
            return await original(sys.executable, "-c", script, **kwargs)

        monkeypatch.setattr(ingestao.asyncio, "create_subprocess_exec", falso)
        monkeypatch.setattr(ingestao, "projetos_dir", lambda: tmp_path)
        monkeypatch.setattr(ingestao, "_INATIVIDADE_DO_DOWNLOAD_S", 1)

        async def sem_banco(*_a, **_k):
            return None

        monkeypatch.setattr(ingestao.IngestaoService, "_salvar_progresso", sem_banco)

    def test_silencio_alem_do_prazo_vira_erro_dito(self, monkeypatch, tmp_path):
        self._trocar_ytdlp_por(monkeypatch, tmp_path, _MUDO_DEPOIS_DE_COMECAR)
        encerrados = _pid_de_quem_rodou(monkeypatch)
        fila: asyncio.Queue = asyncio.Queue()

        with pytest.raises(DownloadSemSinal, match="sem dar sinal"):
            asyncio.run(ingestao.IngestaoService._baixar_video("p1", "https://youtu.be/x", fila))

        assert encerrados and not psutil.pid_exists(encerrados[0])

    def test_quem_continua_falando_segue_ate_o_fim(self, monkeypatch, tmp_path):
        self._trocar_ytdlp_por(monkeypatch, tmp_path, _LENTO_MAS_VIVO)
        (tmp_path / "p1").mkdir()
        (tmp_path / "p1" / "video.mkv").write_bytes(b"x")
        fila: asyncio.Queue = asyncio.Queue()

        caminho = asyncio.run(
            ingestao.IngestaoService._baixar_video("p1", "https://youtu.be/x", fila)
        )

        assert caminho.endswith("video.mkv")
        assert fila.qsize() == 7, "cada linha de progresso chegou à tela"
