import subprocess

from app.domain.video_encoder import VideoEncoder
from app.infrastructure.encoder_detector import escolher_encoder


class _Executor:
    def __init__(self, retorno=0, erro: Exception | None = None):
        self.retorno = retorno
        self.erro = erro
        self.chamadas: list[list[str]] = []

    def __call__(self, cmd: list[str]) -> int:
        self.chamadas.append(cmd)
        if self.erro is not None:
            raise self.erro
        return self.retorno


def test_auto_usa_qsv_quando_o_encode_de_teste_funciona():
    executor = _Executor(retorno=0)
    assert escolher_encoder("auto", executor) is VideoEncoder.QSV
    assert "h264_qsv" in executor.chamadas[0]


def test_auto_cai_para_libx264_sem_intel():
    assert escolher_encoder(None, _Executor(retorno=1)) is VideoEncoder.LIBX264


def test_auto_cai_para_libx264_se_o_ffmpeg_nao_roda():
    assert (
        escolher_encoder("auto", _Executor(erro=FileNotFoundError("ffmpeg")))
        is VideoEncoder.LIBX264
    )


def test_auto_cai_para_libx264_se_o_teste_trava():
    erro = subprocess.TimeoutExpired(cmd="ffmpeg", timeout=30)
    assert escolher_encoder("auto", _Executor(erro=erro)) is VideoEncoder.LIBX264


def test_preferencia_explicita_nao_roda_teste():
    executor = _Executor(retorno=1)
    assert escolher_encoder("qsv", executor) is VideoEncoder.QSV
    assert escolher_encoder("LIBX264", executor) is VideoEncoder.LIBX264
    assert executor.chamadas == []


def test_valor_desconhecido_vira_auto():
    assert escolher_encoder("nvenc", _Executor(retorno=0)) is VideoEncoder.QSV
