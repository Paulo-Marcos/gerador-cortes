"""D-303: diff puro entre a proposta da IA (snapshot) e o corte final editado.

Régua de acerto da análise: quanto o editor moveu as bordas, quais desvios da
IA sobreviveram, o que ele adicionou por conta própria e se o título proposto
virou o título final. Sem I/O — recebe dicts, devolve dicts; o service é quem
fala com o banco.
"""

import csv
import io

from app.domain.compartilhado.time_convert import hms_to_seg

# O editor pode ajustar finamente a borda de um desvio sem que isso signifique
# "rejeitou o desvio da IA": dentro desta tolerância (por borda) o desvio
# proposto e o final contam como o MESMO desvio (mantido).
TOLERANCIA_BORDA_DESVIO_SEG = 2.0

SITUACAO_COM_SNAPSHOT = "com_snapshot"
# Projeto TEM snapshots (telemetria ativa na análise) mas este corte não →
# o editor criou o corte na mão; a IA não propôs. Sinal, não erro.
SITUACAO_SEM_PROPOSTA_IA = "sem_proposta_ia"
# Projeto inteiro sem nenhum snapshot → análise anterior à telemetria (legado).
SITUACAO_SEM_SNAPSHOT = "sem_snapshot"

# Ordem canônica do CSV cross-projeto: uma linha por corte.
COLUNAS_CSV_TELEMETRIA = [
    "projeto_id",
    "projeto_titulo",
    "corte_id",
    "numero",
    "situacao",
    "origem_analise",
    "status_final",
    "titulo_proposto",
    "titulo_final",
    "titulo_mudou",
    "inicio_proposto_seg",
    "inicio_final_seg",
    "delta_inicio_seg",
    "fim_proposto_seg",
    "fim_final_seg",
    "delta_fim_seg",
    "duracao_proposta_seg",
    "duracao_final_seg",
    "delta_duracao_seg",
    "desvios_propostos",
    "desvios_mantidos",
    "desvios_removidos",
    "desvios_adicionados",
    "desvios_adicionados_claude",
    "desvios_adicionados_tecnico",
    "desvios_adicionados_manual",
    "desvios_adicionados_outros",
    "desvios_finais",
    "trechos_geracoes",
    "desvios_claude_por_geracao",
    # D-419: opinião humana sobre o corte, dada na 1ª geração do bruto. É a
    # única coluna subjetiva da tabela — as demais medem o que o editor FEZ,
    # esta diz o que ele ACHOU. Vazia enquanto o corte não foi avaliado.
    "voto_qualidade",
    "voto_qualidade_motivos",
    "voto_qualidade_comentario",
]


def diff_proposta_vs_final(
    snapshot: dict | None,
    corte: dict,
    *,
    projeto_tem_snapshots: bool = True,
) -> dict:
    """Compara a proposta congelada da IA com o estado final do corte.

    `corte` (estado final): id, numero, titulo_proposto, titulo_youtube,
    inicio_seg, fim_seg, status, desvios (lista de dicts).
    `snapshot` (proposta): mesmos campos de borda + tema_central, resumo,
    justificativa, origem_analise, desvios propostos.

    `snapshot=None` → corte sem proposta da IA: `sem_proposta_ia` quando o
    projeto tem outros snapshots (telemetria ativa ⇒ o editor criou na mão)
    ou `sem_snapshot` quando o projeto inteiro é anterior à telemetria.
    Heurística documentada — sem snapshot não há como distinguir com certeza.
    """
    desvios_finais = corte.get("desvios") or []
    titulo_final = (corte.get("titulo_youtube") or "").strip() or (
        corte.get("titulo_proposto") or ""
    ).strip()
    # D-334: quantas vezes a trechos-expert rodou neste corte — o total de
    # desvios origem='claude' sozinho não diz se veio de 1 clique ou de 4
    # (D-332 tornou a geração aditiva). Derivado só faz sentido com trechos
    # gerados; 0 gerações → 0.0 (não confundir com "1 desvio por geração").
    trechos_geracoes = int(corte.get("trechos_geracoes") or 0)
    desvios_claude_finais = _contar_por_origem(desvios_finais).get("claude", 0)
    desvios_claude_por_geracao = (
        round(desvios_claude_finais / trechos_geracoes, 2) if trechos_geracoes else 0.0
    )

    if snapshot is None:
        situacao = SITUACAO_SEM_PROPOSTA_IA if projeto_tem_snapshots else SITUACAO_SEM_SNAPSHOT
        return {
            "corte_id": corte.get("id", ""),
            "numero": corte.get("numero", 0),
            "situacao": situacao,
            "origem_analise": None,
            "status_final": corte.get("status", ""),
            "titulo": {"proposto": None, "final": titulo_final, "mudou": None},
            "bordas": _bordas(None, None, corte.get("inicio_seg"), corte.get("fim_seg")),
            "desvios": {
                "propostos": None,
                "mantidos": None,
                "removidos": None,
                "adicionados": None,
                "adicionados_por_origem": None,
                "finais": len(desvios_finais),
                "finais_por_origem": _contar_por_origem(desvios_finais),
            },
            "trechos_geracoes": trechos_geracoes,
            "desvios_claude_por_geracao": desvios_claude_por_geracao,
            "avaliacao": _avaliacao(corte),
        }

    desvios_propostos = snapshot.get("desvios") or []
    mantidos, removidos, adicionados = _classificar_desvios(desvios_propostos, desvios_finais)
    titulo_proposto = (snapshot.get("titulo_proposto") or "").strip()

    return {
        "corte_id": corte.get("id", ""),
        "numero": corte.get("numero", 0),
        "situacao": SITUACAO_COM_SNAPSHOT,
        "origem_analise": snapshot.get("origem_analise") or "",
        "status_final": corte.get("status", ""),
        "titulo": {
            "proposto": titulo_proposto,
            "final": titulo_final,
            "mudou": titulo_final != titulo_proposto,
        },
        "bordas": _bordas(
            snapshot.get("inicio_seg"),
            snapshot.get("fim_seg"),
            corte.get("inicio_seg"),
            corte.get("fim_seg"),
        ),
        "desvios": {
            "propostos": len(desvios_propostos),
            "mantidos": mantidos,
            "removidos": removidos,
            "adicionados": adicionados,
            "adicionados_por_origem": _contar_por_origem(adicionados),
            "finais": len(desvios_finais),
            "finais_por_origem": _contar_por_origem(desvios_finais),
        },
        "trechos_geracoes": trechos_geracoes,
        "desvios_claude_por_geracao": desvios_claude_por_geracao,
        "avaliacao": _avaliacao(corte),
    }


def telemetria_csv(linhas: list[dict]) -> str:
    """Serializa os diffs (já com projeto_id/projeto_titulo) em CSV — uma
    linha por corte, colunas fixas de `COLUNAS_CSV_TELEMETRIA`."""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=COLUNAS_CSV_TELEMETRIA, lineterminator="\n")
    writer.writeheader()
    for linha in linhas:
        writer.writerow(_achatar_para_csv(linha))
    return buffer.getvalue()


# ── internos ────────────────────────────────────────────────────────────────


def _bordas(
    inicio_proposto: float | None,
    fim_proposto: float | None,
    inicio_final: float | None,
    fim_final: float | None,
) -> dict:
    inicio_final = float(inicio_final or 0.0)
    fim_final = float(fim_final or 0.0)
    duracao_final = round(max(0.0, fim_final - inicio_final), 3)

    if inicio_proposto is None or fim_proposto is None:
        return {
            "inicio_proposto_seg": None,
            "inicio_final_seg": inicio_final,
            "delta_inicio_seg": None,
            "fim_proposto_seg": None,
            "fim_final_seg": fim_final,
            "delta_fim_seg": None,
            "duracao_proposta_seg": None,
            "duracao_final_seg": duracao_final,
            "delta_duracao_seg": None,
        }

    inicio_proposto = float(inicio_proposto)
    fim_proposto = float(fim_proposto)
    duracao_proposta = round(max(0.0, fim_proposto - inicio_proposto), 3)
    return {
        "inicio_proposto_seg": inicio_proposto,
        "inicio_final_seg": inicio_final,
        "delta_inicio_seg": round(inicio_final - inicio_proposto, 3),
        "fim_proposto_seg": fim_proposto,
        "fim_final_seg": fim_final,
        "delta_fim_seg": round(fim_final - fim_proposto, 3),
        "duracao_proposta_seg": duracao_proposta,
        "duracao_final_seg": duracao_final,
        "delta_duracao_seg": round(duracao_final - duracao_proposta, 3),
    }


def _borda_desvio_seg(desvio: dict, campo: str) -> float:
    """Borda do desvio em segundos, tolerante a variações de campo/legado."""
    for chave in (f"{campo}_seg", campo, f"{campo}_hms"):
        bruto = desvio.get(chave)
        if bruto in (None, ""):
            continue
        if isinstance(bruto, (int, float)):
            return float(bruto)
        try:
            return float(bruto)
        except ValueError:
            try:
                return hms_to_seg(str(bruto))
            except (ValueError, TypeError):
                continue
    return 0.0


def _mesmo_desvio(a: dict, b: dict) -> bool:
    return (
        abs(_borda_desvio_seg(a, "inicio") - _borda_desvio_seg(b, "inicio"))
        <= TOLERANCIA_BORDA_DESVIO_SEG
        and abs(_borda_desvio_seg(a, "fim") - _borda_desvio_seg(b, "fim"))
        <= TOLERANCIA_BORDA_DESVIO_SEG
    )


def _classificar_desvios(
    propostos: list[dict], finais: list[dict]
) -> tuple[list[dict], list[dict], list[dict]]:
    """Casa cada desvio proposto com no máximo UM desvio final (greedy).

    mantidos = propostos que sobreviveram; removidos = propostos que o editor
    rejeitou; adicionados = finais sem correspondente na proposta (o editor —
    ou outra ferramenta, ver `origem` — colocou por conta própria).
    """
    mantidos: list[dict] = []
    removidos: list[dict] = []
    finais_restantes = list(finais)
    for proposto in propostos:
        par = next((f for f in finais_restantes if _mesmo_desvio(proposto, f)), None)
        if par is None:
            removidos.append(proposto)
        else:
            mantidos.append(proposto)
            finais_restantes.remove(par)
    return mantidos, removidos, finais_restantes


def _avaliacao(corte: dict) -> dict:
    """Avaliação humana do corte (D-419), normalizada para o diff e o CSV.

    `voto=None` distingue "não avaliado" de qualquer nota — o levantamento
    precisa saber quantos cortes ficaram sem opinião, não tratá-los como zero.
    """
    voto = corte.get("voto_qualidade")
    return {
        "voto": int(voto) if voto is not None else None,
        "motivos": list(corte.get("voto_qualidade_motivos") or []),
        "comentario": (corte.get("voto_qualidade_comentario") or "").strip(),
    }


def _contar_por_origem(desvios: list[dict]) -> dict[str, int]:
    """Agrupa por `origem` do trecho ("claude"/"tecnico"/"gemini"/...);
    trecho sem origem conta como "manual" (editor na timeline)."""
    contagem: dict[str, int] = {}
    for desvio in desvios:
        origem = desvio.get("origem") or "manual"
        contagem[origem] = contagem.get(origem, 0) + 1
    return contagem


def _achatar_para_csv(diff: dict) -> dict:
    titulo = diff.get("titulo") or {}
    bordas = diff.get("bordas") or {}
    desvios = diff.get("desvios") or {}
    avaliacao = diff.get("avaliacao") or {}
    # None = sem snapshot (colunas vazias); {} = com snapshot e zero adições (0).
    tem_diff_desvios = desvios.get("adicionados_por_origem") is not None
    por_origem = desvios.get("adicionados_por_origem") or {}
    outros = sum(
        qtd for origem, qtd in por_origem.items() if origem not in ("claude", "tecnico", "manual")
    )

    def _num(valor):
        return "" if valor is None else valor

    def _contagem(valor):
        if valor is None:
            return ""
        return len(valor) if isinstance(valor, list) else valor

    return {
        "projeto_id": diff.get("projeto_id", ""),
        "projeto_titulo": diff.get("projeto_titulo", ""),
        "corte_id": diff.get("corte_id", ""),
        "numero": diff.get("numero", 0),
        "situacao": diff.get("situacao", ""),
        "origem_analise": diff.get("origem_analise") or "",
        "status_final": diff.get("status_final", ""),
        "titulo_proposto": titulo.get("proposto") or "",
        "titulo_final": titulo.get("final", ""),
        "titulo_mudou": _num(titulo.get("mudou")),
        "inicio_proposto_seg": _num(bordas.get("inicio_proposto_seg")),
        "inicio_final_seg": _num(bordas.get("inicio_final_seg")),
        "delta_inicio_seg": _num(bordas.get("delta_inicio_seg")),
        "fim_proposto_seg": _num(bordas.get("fim_proposto_seg")),
        "fim_final_seg": _num(bordas.get("fim_final_seg")),
        "delta_fim_seg": _num(bordas.get("delta_fim_seg")),
        "duracao_proposta_seg": _num(bordas.get("duracao_proposta_seg")),
        "duracao_final_seg": _num(bordas.get("duracao_final_seg")),
        "delta_duracao_seg": _num(bordas.get("delta_duracao_seg")),
        "desvios_propostos": _num(desvios.get("propostos")),
        "desvios_mantidos": _contagem(desvios.get("mantidos")),
        "desvios_removidos": _contagem(desvios.get("removidos")),
        "desvios_adicionados": _contagem(desvios.get("adicionados")),
        "desvios_adicionados_claude": por_origem.get("claude", 0) if tem_diff_desvios else "",
        "desvios_adicionados_tecnico": por_origem.get("tecnico", 0) if tem_diff_desvios else "",
        "desvios_adicionados_manual": por_origem.get("manual", 0) if tem_diff_desvios else "",
        "desvios_adicionados_outros": outros if tem_diff_desvios else "",
        "desvios_finais": _num(desvios.get("finais")),
        "trechos_geracoes": diff.get("trechos_geracoes", 0),
        "desvios_claude_por_geracao": diff.get("desvios_claude_por_geracao", 0.0),
        "voto_qualidade": _num(avaliacao.get("voto")),
        # Um só campo com os slugs separados por "|": o CSV é plano e a
        # quantidade de motivos varia; uma coluna por slug inflaria a tabela.
        "voto_qualidade_motivos": "|".join(avaliacao.get("motivos") or []),
        "voto_qualidade_comentario": avaliacao.get("comentario") or "",
    }
