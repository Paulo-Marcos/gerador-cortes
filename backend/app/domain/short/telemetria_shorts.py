"""D-995: diff puro entre a proposta da IA para um short e o short final.

A régua do shorts-expert, no molde da do corte (`domain/corte/telemetria_cortes.py`):
quanto o operador moveu as bordas, quanto a duração mudou e se o short sobreviveu.
Na D-989 esta conta saiu do `llm_calls`, casando título: 43 de 65 shorts aceitos
tinham sido esticados, mediana de +13 s. Agora sai do `ShortSnapshot`.

Sem I/O: recebe dicts, devolve dicts; o service é quem fala com o banco.
"""

from __future__ import annotations

from statistics import median

# Abaixo disto a duração "não mudou": é o ajuste fino de borda numa palavra.
TOLERANCIA_DURACAO_SEG = 1.0

# Os estágios em que o operador já disse sim ao short (StatusShort).
STATUS_ACEITOS = frozenset({"aprovado", "renderizado"})

SITUACAO_VIVO = "vivo"
SITUACAO_APAGADO = "apagado"


def diff_proposta_vs_final(proposta: dict, final: dict | None) -> dict:
    """Uma linha por proposta. `final` é None quando o short não existe mais."""
    duracao_proposta = _arredondar(proposta["fim_seg"] - proposta["inicio_seg"])
    linha = {
        "short_id": proposta["short_id"],
        "numero": proposta["numero"],
        "provedor": proposta["provedor"],
        "modelo": proposta["modelo"],
        "score_proposto": proposta["score"],
        "titulo_proposto": proposta["titulo"],
        "gancho_proposto": proposta["gancho"],
        "inicio_proposto_seg": proposta["inicio_seg"],
        "fim_proposto_seg": proposta["fim_seg"],
        "duracao_proposta_seg": duracao_proposta,
    }
    if final is None:
        return {**linha, **_sem_final()}
    return {
        **linha,
        "situacao": SITUACAO_VIVO,
        "status_final": final["status"],
        "inicio_final_seg": final["inicio_seg"],
        "fim_final_seg": final["fim_seg"],
        "duracao_final_seg": final["duracao_seg"],
        "delta_inicio_seg": _arredondar(final["inicio_seg"] - proposta["inicio_seg"]),
        "delta_fim_seg": _arredondar(final["fim_seg"] - proposta["fim_seg"]),
        "delta_duracao_seg": _arredondar(final["duracao_seg"] - duracao_proposta),
        "gancho_mudou": final["gancho"].strip() != proposta["gancho"].strip(),
    }


def resumir(linhas: list[dict]) -> dict:
    """A conta da D-989: dos shorts aceitos, quantos o operador esticou, e quanto."""
    aceitos = [linha for linha in linhas if linha["status_final"] in STATUS_ACEITOS]
    deltas = [linha["delta_duracao_seg"] for linha in aceitos]
    return {
        "total": len(linhas),
        "apagados": sum(1 for linha in linhas if linha["situacao"] == SITUACAO_APAGADO),
        "aceitos": len(aceitos),
        "esticados": sum(1 for delta in deltas if delta > TOLERANCIA_DURACAO_SEG),
        "encurtados": sum(1 for delta in deltas if delta < -TOLERANCIA_DURACAO_SEG),
        "mediana_delta_duracao_aceitos_seg": _arredondar(median(deltas)) if deltas else None,
    }


def _sem_final() -> dict:
    return {
        "situacao": SITUACAO_APAGADO,
        "status_final": "",
        "inicio_final_seg": None,
        "fim_final_seg": None,
        "duracao_final_seg": None,
        "delta_inicio_seg": None,
        "delta_fim_seg": None,
        "delta_duracao_seg": None,
        "gancho_mudou": None,
    }


def _arredondar(valor: float) -> float:
    return round(valor, 3)
