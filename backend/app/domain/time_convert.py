"""Conversões de tempo puras — sem I/O."""

from datetime import datetime, timedelta


def hms_to_seg(hms: str) -> float:
    """Converte HH:MM:SS(.mmm) ou MM:SS para segundos float.

    Exemplo:
        >>> hms_to_seg("01:02:03.500")
        3723.5
    """
    if not hms:
        return 0.0
    partes = hms.strip().split(":")
    if len(partes) == 3:
        return float(partes[0]) * 3600 + float(partes[1]) * 60 + float(partes[2])
    if len(partes) == 2:
        return float(partes[0]) * 60 + float(partes[1])
    return float(hms)


def seg_to_hms(seg: float) -> str:
    """Converte segundos para HH:MM:SS.mmm (formato FFmpeg -ss).

    Exemplo:
        >>> seg_to_hms(3723.5)
        '01:02:03.500'
    """
    h = int(seg // 3600)
    m = int((seg % 3600) // 60)
    s = seg % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def seg_to_hms_short(seconds: float) -> str:
    """Converte segundos para HH:MM:SS (sem milissegundos, zero-padded).

    Exemplo:
        >>> seg_to_hms_short(3723.7)
        '01:02:03'
    """
    return str(timedelta(seconds=seconds)).split(".")[0].zfill(8)


def to_seg(val) -> float:
    """Helper universal para converter tempos (float, int ou HH:MM:SS) em segundos.

    Exemplos:
        >>> to_seg(120.5)
        120.5
        >>> to_seg("01:02:03")
        3723.0
    """
    if isinstance(val, (int, float)):
        return float(val)
    if not val:
        return 0.0
    s = str(val).strip()
    try:
        # Tenta converter direto (ex: "123.45")
        return float(s)
    except ValueError:
        # Se falhar, tenta como HH:MM:SS
        return hms_to_seg(s)


def hms_to_srt(hms: str) -> str:
    """Normaliza HH:MM:SS para HH:MM:SS.000 (formato LosslessCut).

    Exemplo:
        >>> hms_to_srt("01:02:03")
        '01:02:03.000'
    """
    if "." not in hms:
        return f"{hms}.000"
    return hms


def epoch_to_hora_local(epoch: float) -> str:
    """Converte um timestamp epoch (segundos) para a HORA LOCAL HH:MM:SS.

    Usado nos logs do render para registrar a hora de relógio em que cada
    fase começou/terminou — não a duração, mas o horário real do dia.

    Exemplo:
        >>> from datetime import datetime
        >>> epoch = datetime(2020, 1, 1, 14, 32, 1).timestamp()
        >>> epoch_to_hora_local(epoch)
        '14:32:01'
    """
    return datetime.fromtimestamp(epoch).strftime("%H:%M:%S")


def seg_to_duracao_humana(seg: float) -> str:
    """Converte uma duração em segundos para uma forma legível em log.

    Mostra apenas as unidades relevantes: ``45s``, ``16m 19s``,
    ``1h 02m 03s``. Valores negativos ou nulos viram ``0s``. Truncamento
    (não arredonda) — coerente com `seg_to_hms_short`.

    Exemplo:
        >>> seg_to_duracao_humana(979)
        '16m 19s'
        >>> seg_to_duracao_humana(3723)
        '1h 02m 03s'
        >>> seg_to_duracao_humana(45)
        '45s'
    """
    if seg <= 0:
        return "0s"
    total = int(seg)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    if h > 0:
        return f"{h}h {m:02d}m {s:02d}s"
    if m > 0:
        return f"{m}m {s:02d}s"
    return f"{s}s"
