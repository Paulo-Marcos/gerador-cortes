from types import SimpleNamespace

from app.services.media_proxy import MediaProxyService, _KeyedLocks


def test_calcular_janela_proxy_clampa_fim_no_fim_do_video():
    corte = SimpleNamespace(inicio_seg=5325.694159, fim_seg=6495.0)
    projeto = SimpleNamespace(duracao_segundos=6647)

    start_sec, end_sec = MediaProxyService._calcular_janela_proxy(corte, projeto)

    assert start_sec == 5265.694159
    assert end_sec == 6647.0
    assert round(end_sec - start_sec, 3) == 1381.306


def test_calcular_janela_proxy_preserva_buffer_quando_cabe_no_video():
    corte = SimpleNamespace(inicio_seg=120.0, fim_seg=240.0)
    projeto = SimpleNamespace(duracao_segundos=1000)

    start_sec, end_sec = MediaProxyService._calcular_janela_proxy(corte, projeto)

    assert start_sec == 60.0
    assert end_sec == 540.0


def _seek_pairs(cmd: list[str]) -> tuple[float, float]:
    """Extrai (seek_pre antes do -i, fine_seek depois do -i) de um cmd ffmpeg."""
    i_index = cmd.index("-i")
    pre = next(float(cmd[k + 1]) for k in range(i_index) if cmd[k] == "-ss")
    fine = next(float(cmd[k + 1]) for k in range(i_index, len(cmd)) if cmd[k] == "-ss")
    return pre, fine


def test_build_proxy_cmd_usa_seek_hibrido_para_corte_tardio():
    # start tardio: fast-seek até start-30 e trim preciso dos 30s restantes,
    # preservando a invariante seek_pre + fine_seek == start_sec.
    cmd = MediaProxyService._build_proxy_cmd(
        "video.mkv", start_sec=5000.0, duration=120.0, dest="out.flac"
    )

    pre, fine = _seek_pairs(cmd)
    assert pre == 4970.0
    assert fine == 30.0
    assert round(pre + fine, 3) == 5000.0
    assert cmd[-1] == "out.flac"
    assert "-t" in cmd and cmd[cmd.index("-t") + 1] == "120.0"


def test_build_proxy_cmd_nao_retrocede_antes_do_zero():
    # start menor que a janela de rewind: fast-seek em 0 e trim preciso = start.
    cmd = MediaProxyService._build_proxy_cmd(
        "video.mkv", start_sec=10.0, duration=60.0, dest="out.flac"
    )

    pre, fine = _seek_pairs(cmd)
    assert pre == 0.0
    assert fine == 10.0


def test_keyed_locks_reusa_lock_por_chave():
    locks = _KeyedLocks()
    assert locks.get("corte-a") is locks.get("corte-a")
    assert locks.get("corte-a") is not locks.get("corte-b")
