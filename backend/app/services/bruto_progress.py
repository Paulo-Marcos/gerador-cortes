"""Acompanhamento (em memória) dos passos do 'gerar/regerar bruto', por corte.

Permite à UI mostrar, num dropdown ao lado do botão, quais etapas já rodaram,
qual está rodando e quais faltam — em vez de só um spinner opaco.

In-memory (mesmo padrão de `ExportService.tarefa_corte_status`): vale para o
processo do backend local. Reload do uvicorn limpa o store (a UI então mostra o
status do botão como fonte de verdade).
"""

# Ordem canônica dos passos do pipeline de bruto (backend). Metadados é
# acompanhado pelo próprio mutation do front (roda em paralelo), fora daqui.
PASSOS_BRUTO: list[tuple[str, str]] = [
    ("silencios", "Detectar silêncios"),
    ("render", "Renderizar vídeo bruto"),
    ("transcricao", "Sincronizar transcrição"),
    ("cenas", "Gerar cenas (Claude)"),
]

# D-455: só o corte marcado com Fire vira fábrica de shorts, então o passo é
# CONDICIONAL. Listá-lo sempre deixaria um "pendente" eterno na tela dos cortes
# comuns — a UI mostraria uma etapa que nunca vai rodar.
PASSO_SHORTS: tuple[str, str] = ("shorts", "Propor shorts (Claude)")

# status possíveis por passo: "pendente" | "rodando" | "concluido" | "erro"


class BrutoProgress:
    """Store por corte dos passos do gerar-bruto."""

    _store: dict[str, list[dict]] = {}

    @classmethod
    def iniciar(cls, corte_id: str, *, incluir_shorts: bool = False) -> None:
        """Reseta os passos do corte para 'pendente' (início de uma geração).

        `incluir_shorts` acrescenta a etapa da fábrica de shorts ao fim da lista
        — só faz sentido em corte marcado com Fire (D-455).
        """
        passos = [*PASSOS_BRUTO, PASSO_SHORTS] if incluir_shorts else list(PASSOS_BRUTO)
        cls._store[corte_id] = [
            {"chave": chave, "label": label, "status": "pendente"} for chave, label in passos
        ]

    @classmethod
    def marcar(cls, corte_id: str, chave: str, status: str) -> None:
        """Atualiza o status de um passo. No-op se o corte não tem sessão ativa."""
        for passo in cls._store.get(corte_id, []):
            if passo["chave"] == chave:
                passo["status"] = status
                return

    @classmethod
    def get(cls, corte_id: str) -> list[dict]:
        """Retorna os passos do corte (lista vazia se não há sessão)."""
        return cls._store.get(corte_id, [])
