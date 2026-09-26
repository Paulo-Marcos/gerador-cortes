"""Análise aditiva: reanalisar uma live soma cortes, nunca apaga (D-298).

Um corte novo cujo início cai na mesma janela de 30 s de um corte que já existe é
tratado como duplicata; os descartados da IA se somam à auditoria anterior sem
repetir tema. As regras moravam no claude_ia, que as usa no modo em lote; a
análise as usa entre gerações (D-696).
"""

from app.domain.compartilhado.time_convert import to_seg_estrito


def bucket_de_30s(inicio_seg) -> int:
    """Bucket de 30s do início — mesma granularidade que o modo lote usa
    para tratar cortes que começam quase no mesmo ponto como duplicados."""
    return int(to_seg_estrito(inicio_seg or 0) // 30)


def mesclar_descartados(existentes: list, novos: list) -> list:
    """Acrescenta `novos` aos `existentes` deduplicando por `tema`
    (case-insensitive); preserva todos os existentes e ignora entradas de
    tema vazio (ruído sem chave de dedup). Mesma regra que o modo lote usa
    entre as janelas da mesma geração."""
    mesclados = list(existentes)
    temas_vistos = {
        (d.get("tema") or "").strip().lower() for d in existentes if (d.get("tema") or "").strip()
    }
    for desc in novos or []:
        tema_norm = (desc.get("tema") or "").strip().lower()
        if not tema_norm or tema_norm in temas_vistos:
            continue
        temas_vistos.add(tema_norm)
        mesclados.append(desc)
    return mesclados
