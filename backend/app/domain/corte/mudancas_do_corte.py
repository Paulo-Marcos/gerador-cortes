"""D-999: "o que você mudou" — o diff proposta × final contado em gestos.

O voto de qualidade (D-419) virou carimbo: 314 votos, 95% deles 4 ou 5,
motivo usado uma vez, correlação com views de 0,03. O que o editor FEZ no
corte diz mais do que o que ele ACHOU, e não custa clique: a telemetria
(D-303) já mede bordas, título e trechos contra a proposta congelada. Este
módulo só traduz esse diff em mudanças nomeadas e as soma por origem da
análise (o provedor que propôs), junto com os apagados e seus motivos (D-993).

Sem I/O — recebe os dicts de `telemetria_cortes.diff_proposta_vs_final`.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.domain.corte.motivo_apagado import contar_apagados_por_motivo

# Mexer menos de 1 s numa borda é acerto fino de respiração, não discordância
# da proposta: abaixo disso a borda conta como mantida.
TOLERANCIA_BORDA_SEG = 1.0

# Ordem = ordem de exibição. "Esticado" = o corte ganhou tempo naquela borda.
TIPOS_MUDANCA: tuple[str, ...] = (
    "inicio_esticado",
    "inicio_encurtado",
    "fim_esticado",
    "fim_encurtado",
    "titulo_trocado",
    "trechos_acrescentados",
    "trechos_desfeitos",
)

_SEGUNDOS_POR_MINUTO = 60

# Origem da proposta sem nome gravado (snapshot antigo).
ORIGEM_DESCONHECIDA = "desconhecida"


def mudancas_do_corte(diff: dict) -> list[dict]:
    """As mudanças do editor sobre a proposta, na ordem de `TIPOS_MUDANCA`.

    Cada mudança: `tipo`, `valor` (segundos nas bordas, quantidade nos
    trechos, 1 no título) e `descricao` pronta para a tela. Corte sem proposta
    da IA não tem contra o que comparar: lista vazia.
    """
    if diff.get("situacao") != "com_snapshot":
        return []
    bordas = diff.get("bordas") or {}
    desvios = diff.get("desvios") or {}
    mudancas = [
        *_mudanca_de_borda("inicio", -(bordas.get("delta_inicio_seg") or 0.0)),
        *_mudanca_de_borda("fim", bordas.get("delta_fim_seg") or 0.0),
    ]
    if (diff.get("titulo") or {}).get("mudou"):
        mudancas.append({"tipo": "titulo_trocado", "valor": 1, "descricao": "Título trocado"})
    for tipo, chave, verbo in (
        ("trechos_acrescentados", "adicionados", "acrescentado"),
        ("trechos_desfeitos", "removidos", "desfeito"),
    ):
        quantidade = len(desvios.get(chave) or [])
        if quantidade:
            mudancas.append(
                {"tipo": tipo, "valor": quantidade, "descricao": _trechos(quantidade, verbo)}
            )
    return mudancas


def mudancas_por_origem(
    diffs: Iterable[dict], apagados: Iterable[tuple[str | None, str | None]]
) -> list[dict]:
    """Soma, por origem da proposta, quantos cortes tiveram cada mudança.

    `diffs` já trazem `mudancas`; só os com proposta da IA entram. `apagados`
    são pares (origem, motivo) das propostas que o operador apagou. Todo tipo
    aparece, mesmo com zero, para comparar provedores sem chave ausente.
    """
    grupos: dict[str, dict] = {}
    for diff in diffs:
        if diff.get("situacao") != "com_snapshot":
            continue
        grupo = _grupo(grupos, diff.get("origem_analise"))
        grupo["cortes"] += 1
        tipos = {m["tipo"] for m in diff.get("mudancas") or []}
        if not tipos:
            grupo["sem_mudanca"] += 1
        for tipo in tipos:
            grupo["por_tipo"][tipo] += 1

    motivos_por_origem: dict[str, list[str | None]] = {}
    for origem, motivo in apagados:
        _grupo(grupos, origem)
        motivos_por_origem.setdefault(_nome_da_origem(origem), []).append(motivo)
    for origem, grupo in grupos.items():
        grupo["apagados"] = contar_apagados_por_motivo(motivos_por_origem.get(origem, []))
    return [grupos[origem] for origem in sorted(grupos)]


# ── internos ────────────────────────────────────────────────────────────────


def _mudanca_de_borda(borda: str, ganho_seg: float) -> list[dict]:
    """`ganho_seg` > 0: o corte ganhou tempo nesta borda (esticou)."""
    if abs(ganho_seg) < TOLERANCIA_BORDA_SEG:
        return []
    esticou = ganho_seg > 0
    nome = "Começo" if borda == "inicio" else "Fim"
    acao = "esticado" if esticou else "encurtado"
    segundos = round(abs(ganho_seg), 1)
    return [
        {
            "tipo": f"{borda}_{acao}",
            "valor": segundos,
            "descricao": f"{nome} {acao} em {_duracao(segundos)}",
        }
    ]


def _duracao(segundos: float) -> str:
    inteiros = round(segundos)
    if inteiros < _SEGUNDOS_POR_MINUTO:
        return f"{inteiros} s"
    minutos, resto = divmod(inteiros, _SEGUNDOS_POR_MINUTO)
    return f"{minutos} min {resto:02d} s"


def _trechos(quantidade: int, verbo: str) -> str:
    if quantidade == 1:
        return f"1 trecho {verbo}"
    return f"{quantidade} trechos {verbo}s"


def _nome_da_origem(origem: str | None) -> str:
    return (origem or "").strip() or ORIGEM_DESCONHECIDA


def _grupo(grupos: dict[str, dict], origem: str | None) -> dict:
    nome = _nome_da_origem(origem)
    if nome not in grupos:
        grupos[nome] = {
            "origem": nome,
            "cortes": 0,
            "sem_mudanca": 0,
            "por_tipo": dict.fromkeys(TIPOS_MUDANCA, 0),
        }
    return grupos[nome]
