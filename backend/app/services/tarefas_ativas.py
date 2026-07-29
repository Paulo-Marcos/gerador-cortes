"""Registro em memória do trabalho pesado sem store próprio (D-417).

Duas famílias de trabalho não apareciam em lugar nenhum:

1. **Consultas de IA.** Rodam SÍNCRONAS dentro do request (`/api/claude/...`
   devolve só quando o Claude termina), então não passam por `fire_and_forget`
   nem têm store de progresso. A análise da transcrição é o caso mais visível:
   minutos de espera sem nada na fila.
2. **Tasks de background genéricas** — ingestão, render multi-versão, palco.

Este módulo é o ponto único onde ambas se anunciam. Escrevem nele
`claude_cli_client`/`gemini_client` (IA) e `services.tasks` (background); lê
`jobs_globais`, que o publica na fila global junto com bruto, pós, render final
e YouTube.

Uma etapa de IA desconhecida NÃO é ignorada: cai no rótulo genérico "Consultando
IA". Assim uma skill nova aparece na fila sem ninguém precisar registrá-la aqui.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

# Famílias de trabalho — a UI colore por família, então tipos novos entram sem
# precisar de cor própria.
FAMILIA_IA = "ia"
FAMILIA_MIDIA = "midia"
FAMILIA_PUBLICACAO = "publicacao"

# Tipo → (família, rótulo humano). O rótulo vai para a UI montar "corte 7 →
# análise" sem conhecer os tipos.
TIPOS: dict[str, tuple[str, str]] = {
    "ingestao": (FAMILIA_MIDIA, "ingestão"),
    "bruto": (FAMILIA_MIDIA, "bruto"),
    "pos": (FAMILIA_MIDIA, "pós"),
    "render": (FAMILIA_MIDIA, "render"),
    "youtube": (FAMILIA_PUBLICACAO, "youtube"),
    "analise": (FAMILIA_IA, "análise"),
    "trechos": (FAMILIA_IA, "trechos"),
    "cenas": (FAMILIA_IA, "cenas"),
    "metadados": (FAMILIA_IA, "metadados"),
    "thumbnail": (FAMILIA_IA, "capa"),
    "ranking": (FAMILIA_IA, "ranking"),
    "ia": (FAMILIA_IA, "IA"),
}

TIPO_DESCONHECIDO = ("ia", "Consultando IA")

# Etapa da telemetria (`LlmCallContext.etapa`, normalmente a skill_key) → tipo e
# texto exibido enquanto roda.
ETAPAS_IA: dict[str, tuple[str, str]] = {
    "cortador-expert": ("analise", "Analisando transcrição"),
    "trechos-expert": ("trechos", "Gerando trechos a remover"),
    "cenas-expert": ("cenas", "Gerando cenas"),
    "metadados-expert": ("metadados", "Gerando metadados"),
    "thumbnail-prompt-expert": ("thumbnail", "Montando prompt da capa"),
    "resumo": ("metadados", "Regerando resumo"),
    "padroes-thumbnail": ("thumbnail", "Analisando padrões de capa"),
    "sentimento-ranking": ("ranking", "Avaliando sentimento das lives"),
    "desvios": ("trechos", "Detectando desvios"),
    "thumbnail-imagem": ("thumbnail", "Gerando imagem da capa"),
    "cenas-gemini": ("cenas", "Gerando cenas"),
}

# Nome da background task → (tipo, escopo do sufixo, etapa). A ORDEM importa:
# vence o primeiro prefixo que casar, então o mais específico vem antes.
#
# Ficam de fora de propósito: `render-final-`, `gerar-bruto-`, `processar-todos-`
# e `yt-upload-` (já têm store com progresso fino), `grade_`/`bundle_overlay_`
# (sub-fases do render final) e o que não é IA nem mídia (`youtube-stats-sync`,
# `youtube-oauth-flow`).
TAREFAS_BACKGROUND: tuple[tuple[str, str, str, str], ...] = (
    ("ingestao-retry-", "ingestao", "projeto", "Baixando e transcrevendo"),
    ("ingestao-", "ingestao", "projeto", "Baixando e transcrevendo"),
    ("reanalise-", "analise", "projeto", "Reanalisando transcrição"),
    ("desvios-todos-", "trechos", "projeto", "Gerando trechos de todos os cortes"),
    ("prompt-thumb-", "thumbnail", "corte", "Montando prompt da capa"),
    ("thumbnail-", "thumbnail", "corte", "Gerando imagem da capa"),
    ("metadados-", "metadados", "corte", "Gerando metadados"),
    ("multiversion-", "render", "corte", "Render multi-versão"),
    ("palco-png-", "render", "projeto", "Renderizando palco"),
    ("deteccao-seg-", "bruto", "corte", "Detectando silêncios"),
)

# Tarefa terminal é descartada daqui depois disto. Precisa cobrir a janela de
# `jobs_globais.RETENCAO_TERMINAL_SEG` (1 h, D-425): expirar antes faria o job
# sumir da fila mais cedo do que o combinado. Duplicado em vez de importado
# para não inverter a dependência — é `jobs_globais` que lê este módulo.
RETENCAO_SEG = 3600.0


@dataclass
class TarefaAtiva:
    """Uma unidade de trabalho pesado anunciada por quem a executa."""

    chave: str
    tipo: str
    etapa: str
    estado: str = "rodando"
    erro: str = ""
    # Ids completos quando o chamador os conhece (IA); prefixos de 8 chars quando
    # só o nome da task os carrega (background).
    projeto_id: str = ""
    corte_id: str = ""
    projeto_prefixo: str = ""
    corte_prefixo: str = ""
    atualizado_em: float = field(default_factory=time.time)

    @property
    def ativa(self) -> bool:
        return self.estado == "rodando"


def classificar_ia(etapa: str | None) -> tuple[str, str]:
    """Tipo e texto de uma chamada de IA. Etapa desconhecida vira IA genérica."""
    if not etapa:
        return TIPO_DESCONHECIDO
    return ETAPAS_IA.get(etapa, TIPO_DESCONHECIDO)


def classificar_background(nome: str | None) -> tuple[str, str, str, str] | None:
    """(tipo, escopo, etapa, prefixo_do_id) da task, ou None se ela não vai à fila."""
    if not nome:
        return None
    for prefixo, tipo, escopo, etapa in TAREFAS_BACKGROUND:
        if nome.startswith(prefixo):
            return tipo, escopo, etapa, nome[len(prefixo) :]
    return None


class TarefasAtivas:
    _tarefas: dict[str, TarefaAtiva] = {}

    @classmethod
    def iniciar(
        cls,
        chave: str,
        *,
        tipo: str,
        etapa: str,
        projeto_id: str = "",
        corte_id: str = "",
        projeto_prefixo: str = "",
        corte_prefixo: str = "",
    ) -> None:
        cls._expirar()
        cls._tarefas[chave] = TarefaAtiva(
            chave=chave,
            tipo=tipo,
            etapa=etapa,
            projeto_id=projeto_id,
            corte_id=corte_id,
            projeto_prefixo=projeto_prefixo,
            corte_prefixo=corte_prefixo,
            atualizado_em=time.time(),
        )

    @classmethod
    def encerrar(cls, chave: str, *, sucesso: bool, erro: str = "") -> None:
        """Marca o desfecho. No-op se a tarefa não foi iniciada (ou já expirou)."""
        tarefa = cls._tarefas.get(chave)
        if tarefa is None:
            return
        tarefa.estado = "concluido" if sucesso else "erro"
        tarefa.erro = "" if sucesso else erro
        tarefa.atualizado_em = time.time()

    @classmethod
    def cancelar(cls, chave: str) -> None:
        """Desfecho de quem o operador mandou parar (D-426).

        Estado próprio, não `erro`: a fila precisa distinguir interrupção
        deliberada de falha, senão todo cancelamento vira alarme vermelho.
        """
        tarefa = cls._tarefas.get(chave)
        if tarefa is None:
            return
        tarefa.estado = "cancelado"
        tarefa.erro = ""
        tarefa.atualizado_em = time.time()

    @classmethod
    def listar(cls) -> list[TarefaAtiva]:
        cls._expirar()
        return list(cls._tarefas.values())

    @classmethod
    def _expirar(cls) -> None:
        limite = time.time() - RETENCAO_SEG
        for chave in [
            chave
            for chave, tarefa in cls._tarefas.items()
            if not tarefa.ativa and tarefa.atualizado_em < limite
        ]:
            del cls._tarefas[chave]

    @classmethod
    def limpar(cls) -> None:
        """Zera o registro (usado em teste)."""
        cls._tarefas.clear()
