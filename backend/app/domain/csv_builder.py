"""Geração de arquivos do LosslessCut (CSV e LLC) — sem I/O."""

import json
from typing import Protocol

from app.domain.time_convert import hms_to_seg, hms_to_srt, seg_to_hms


class _CorteProtocol(Protocol):
    numero: int
    titulo_proposto: str
    inicio_hms: str
    fim_hms: str
    inicio_seg: float
    fim_seg: float
    desvios: str | None


def build_losslesscut_csv(cortes: list[_CorteProtocol]) -> str:
    """Constrói o CSV compatível com LosslessCut para um projeto inteiro."""
    linhas = ["start,end,name"]
    for corte in cortes:
        nome = f"Tema{corte.numero}_{corte.titulo_proposto[:40].replace(' ', '_')}"
        linhas.append(f"{hms_to_srt(corte.inicio_hms)},{hms_to_srt(corte.fim_hms)},{nome}")

        desvios = sorted(
            json.loads(corte.desvios or "[]"),
            key=lambda d: d.get("inicio_seg") or hms_to_seg(d.get("inicio_hms", "0")),
        )
        for i, desvio in enumerate(desvios):
            motivo = desvio.get("motivo", "")[:30].replace(" ", "_").replace(",", "")
            nome_desvio = f"DESVIO_{corte.numero}_{i + 1}_{motivo}"
            linhas.append(
                f"{hms_to_srt(desvio['inicio_hms'])},{hms_to_srt(desvio['fim_hms'])},{nome_desvio}"
            )

    return "\n".join(linhas)


def build_single_cut_desvios_llc(corte: _CorteProtocol, stem: str) -> tuple[str, str]:
    """Constrói CSV e LLC (JSON) para um único corte com seus desvios.

    Returns:
        (csv_content, llc_json_content)
    """
    linhas = ["start,end,name"]
    from app.domain.time_convert import to_seg

    # O bruto não tem mais padding: as coordenadas relativas começam em 0.
    inicio_real_video = to_seg(corte.inicio_seg)

    limite_i_relativo = 0.0
    limite_f_relativo = to_seg(corte.fim_seg) - to_seg(corte.inicio_seg)
    nome_limite = f"LIMITE_CORTE__{corte.titulo_proposto[:30].replace(' ', '_')}"

    linhas.append(
        f"{hms_to_srt(seg_to_hms(limite_i_relativo))},{hms_to_srt(seg_to_hms(limite_f_relativo))},{nome_limite}"
    )

    llc_segments = [{"start": limite_i_relativo, "end": limite_f_relativo, "name": nome_limite}]

    desvios = sorted(
        json.loads(corte.desvios or "[]"),
        key=lambda d: to_seg(d.get("inicio_seg", 0)) or hms_to_seg(d.get("inicio_hms", "0")),
    )
    for i, desvio in enumerate(desvios):
        motivo = desvio.get("motivo", "")[:40].replace(" ", "_").replace(",", "")
        nome_desvio = f"REMOVER_DESVIO_{i + 1}_{motivo}"

        d_inicio = to_seg(desvio.get("inicio_seg", desvio.get("inicio_hms", 0)))
        d_fim = to_seg(desvio.get("fim_seg", desvio.get("fim_hms", 0)))

        d_i_relativo = max(0.0, d_inicio - inicio_real_video)
        d_f_relativo = max(0.0, d_fim - inicio_real_video)

        linhas.append(
            f"{hms_to_srt(seg_to_hms(d_i_relativo))},"
            f"{hms_to_srt(seg_to_hms(d_f_relativo))},"
            f"{nome_desvio}"
        )

        llc_segments.append({"start": d_i_relativo, "end": d_f_relativo, "name": nome_desvio})

    llc_data = {"version": 1, "mediaFileName": f"{stem}.mkv", "cutSegments": llc_segments}

    return "\n".join(linhas), json.dumps(llc_data, indent=2, ensure_ascii=False)
