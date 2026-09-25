"""Inventário dos jobs pesados em andamento — fonte da fila global (D-417).

Reúne num único formato as quatro operações longas do pipeline: geração de
bruto, pós-produção em lote, render final e publicação no YouTube. Cada uma já
tinha o próprio store em memória; aqui elas viram uma lista homogênea para a UI
mostrar tudo o que roda, seja qual for a tela que disparou.

**Retenção.** Os stores de origem não combinam: `_tarefas_corte` e
`RenderProgressStore` guardam o estado final para sempre, enquanto as filas de
lote se limpam sozinhas ~5 min depois. Publicar tudo despejaria meses de cortes
concluídos na fila a cada boot. Por isso o coletor observa *transições*: carimba
o instante em que a assinatura de um job muda e só publica jobs terminais dentro
de `RETENCAO_TERMINAL_SEG`. Um job já terminal na primeira observação nasce
expirado — ou seja, o que acabou antes deste processo existir nunca aparece.

A UI é dona da lista visível: ela congela o job quando ele sai daqui e só remove
no comando do usuário. A janela de retenção existe apenas para o cliente não
perder a transição final entre dois polls.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal

from app.core.tarefas_ativas import TIPO_DESCONHECIDO, TIPOS, TarefasAtivas
from app.models import Corte, Projeto
from app.services.bruto_progress import BrutoProgress
from app.services.render.render_progress import RenderProgressStore
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

TipoJob = str
EstadoJob = Literal["aguardando", "rodando", "concluido", "erro", "cancelado"]

ESTADOS_ATIVOS: frozenset[str] = frozenset({"aguardando", "rodando"})

# Tempo que um job terminal continua sendo publicado depois de terminar. É o
# mesmo prazo que a UI usa para sumir com o item (D-425): publicar por menos
# tempo do que a fila exibe deixaria a lista com jobs que o backend já esqueceu
# e que voltariam a aparecer se o operador recarregasse a página.
RETENCAO_TERMINAL_SEG = 3600.0


@dataclass(frozen=True)
class JobGlobal:
    """Um job pesado em andamento (ou recém-terminado), já normalizado."""

    id: str
    tipo: TipoJob
    corte_id: str
    estado: EstadoJob
    progresso: int
    etapa: str
    erro: str = ""
    projeto_id: str = ""
    # Preenchidos quando a origem só conhece os 8 primeiros chars do id (nome de
    # background task); resolvidos contra o banco em `coletar_descritos`.
    corte_prefixo: str = ""
    projeto_prefixo: str = ""

    @property
    def ativo(self) -> bool:
        return self.estado in ESTADOS_ATIVOS

    @property
    def familia(self) -> str:
        """Agrupamento da UI (ia/mídia/publicação) — cor por família, não por tipo."""
        return TIPOS.get(self.tipo, (TIPO_DESCONHECIDO[0], self.tipo))[0]

    @property
    def rotulo_tipo(self) -> str:
        """Nome do tipo em português, para a UI montar o rótulo sem conhecê-lo."""
        return TIPOS.get(self.tipo, ("", self.tipo))[1]

    def assinatura(self) -> str:
        """Identidade do *momento* do job: muda a cada avanço observável."""
        return f"{self.estado}|{self.progresso}|{self.etapa}|{self.erro}"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "tipo": self.tipo,
            "familia": self.familia,
            "rotulo_tipo": self.rotulo_tipo,
            "corte_id": self.corte_id,
            "projeto_id": self.projeto_id,
            "estado": self.estado,
            "progresso": self.progresso,
            "etapa": self.etapa,
            "erro": self.erro,
        }


# ── Geração de bruto ────────────────────────────────────────────────────────
# `_tarefas_corte` dá o estado grosso ("cortando"/"pronto"/"erro: …") e
# `BrutoProgress` dá os passos. Os dois se completam: as cenas (Claude) rodam
# DEPOIS de o status virar "pronto", então o passo rodando é que manda.

_PREFIXO_ERRO = "erro:"


def _estado_bruto(status: str, passos: list[dict]) -> EstadoJob | None:
    if status.startswith(_PREFIXO_ERRO):
        return "erro"
    if any(passo["status"] == "erro" for passo in passos):
        return "erro"
    if status == "cortando" or any(passo["status"] == "rodando" for passo in passos):
        return "rodando"
    if status == "pronto":
        return "concluido"
    return None


def _progresso_bruto(passos: list[dict], estado: EstadoJob) -> int:
    if estado == "concluido":
        return 100
    if not passos:
        return 0
    concluidos = sum(1 for passo in passos if passo["status"] == "concluido")
    return round(concluidos / len(passos) * 100)


def _etapa_bruto(passos: list[dict], estado: EstadoJob) -> str:
    rodando = next((passo for passo in passos if passo["status"] == "rodando"), None)
    if rodando:
        return rodando["label"]
    if estado == "concluido":
        return "Bruto pronto"
    if estado == "erro":
        return "Falha ao gerar bruto"
    return "Gerando bruto"


def _jobs_bruto() -> list[JobGlobal]:
    from app.services.export import ExportService

    jobs: list[JobGlobal] = []
    for corte_id, status in ExportService.get_tarefas_corte().items():
        passos = BrutoProgress.get(corte_id)
        estado = _estado_bruto(status, passos)
        if estado is None:
            continue
        jobs.append(
            JobGlobal(
                id=f"bruto:{corte_id}",
                tipo="bruto",
                corte_id=corte_id,
                estado=estado,
                progresso=_progresso_bruto(passos, estado),
                etapa=_etapa_bruto(passos, estado),
                erro=status[len(_PREFIXO_ERRO) :].strip()
                if status.startswith(_PREFIXO_ERRO)
                else "",
            )
        )
    return jobs


# ── Pós-produção em lote ────────────────────────────────────────────────────
# `_fila_processamento` roda com concorrência 1 (D-364): um "processando" e o
# resto "aguardando". Sem progresso fino por corte — o estado textual é o que há.

_POS_ESTADO: dict[str, EstadoJob] = {
    "aguardando": "aguardando",
    "processando": "rodando",
    "concluido": "concluido",
    "erro": "erro",
    "cancelado": "cancelado",
}
_POS_PROGRESSO = {
    "aguardando": 0,
    "processando": 50,
    "concluido": 100,
    "erro": 0,
    "cancelado": 0,
}
_POS_ETAPA = {
    "aguardando": "Na fila da pós",
    "processando": "Processando clipe",
    "concluido": "Clipe processado",
    "erro": "Falha no processamento",
    "cancelado": "Cancelado",
}


def _jobs_pos() -> list[JobGlobal]:
    from app.services.export import ExportService

    jobs: list[JobGlobal] = []
    for projeto_id, fila in ExportService.get_fila_processamento().items():
        for corte_id, status in fila.items():
            estado = _POS_ESTADO.get(status)
            if estado is None:
                continue
            jobs.append(
                JobGlobal(
                    id=f"pos:{corte_id}",
                    tipo="pos",
                    corte_id=corte_id,
                    projeto_id=projeto_id,
                    estado=estado,
                    progresso=_POS_PROGRESSO[status],
                    etapa=_POS_ETAPA[status],
                    erro="Falha ao processar o clipe." if estado == "erro" else "",
                )
            )
    return jobs


# ── Render final ────────────────────────────────────────────────────────────

_RENDER_ESTADO: dict[str, EstadoJob] = {
    "running": "rodando",
    "done": "concluido",
    "error": "erro",
    "cancelled": "cancelado",
}


def _jobs_render() -> list[JobGlobal]:
    jobs: list[JobGlobal] = []
    for corte_id, progresso in RenderProgressStore.todos().items():
        estado = _RENDER_ESTADO.get(progresso.state)
        if estado is None:
            continue
        jobs.append(
            JobGlobal(
                id=f"render:{corte_id}",
                tipo="render",
                corte_id=corte_id,
                estado=estado,
                progresso=progresso.progress,
                etapa=progresso.stage,
                erro=progresso.error,
            )
        )
    return jobs


# ── Publicação no YouTube ───────────────────────────────────────────────────

_YOUTUBE_ESTADO: dict[str, EstadoJob] = {
    "aguardando": "aguardando",
    "enviando": "rodando",
    "concluido": "concluido",
    "erro": "erro",
    "cota_excedida": "erro",
}
_YOUTUBE_PROGRESSO = {
    "aguardando": 0,
    "enviando": 50,
    "concluido": 100,
    "erro": 0,
    "cota_excedida": 0,
}
_YOUTUBE_ETAPA = {
    "aguardando": "Na fila de publicação",
    "enviando": "Enviando ao YouTube",
    "concluido": "Publicado",
    "erro": "Falha na publicação",
    "cota_excedida": "Cota do YouTube excedida",
}
_YOUTUBE_ERRO = {
    "erro": "Falha ao enviar o vídeo ao YouTube.",
    "cota_excedida": "Cota diária do YouTube excedida — reset ~04h de Brasília.",
}


def _jobs_youtube() -> list[JobGlobal]:
    from app.services.export import ExportService

    jobs: list[JobGlobal] = []
    for projeto_id, fila in ExportService.get_fila_youtube().items():
        for corte_id, status in fila.items():
            estado = _YOUTUBE_ESTADO.get(status)
            if estado is None:
                continue
            jobs.append(
                JobGlobal(
                    id=f"youtube:{corte_id}",
                    tipo="youtube",
                    corte_id=corte_id,
                    projeto_id=projeto_id,
                    estado=estado,
                    progresso=_YOUTUBE_PROGRESSO[status],
                    etapa=_YOUTUBE_ETAPA[status],
                    erro=_YOUTUBE_ERRO.get(status, ""),
                )
            )
    return jobs


# ── IA e demais tarefas pesadas ─────────────────────────────────────────────
# `TarefasAtivas` cobre o que não tem store próprio: as consultas de IA (que
# rodam síncronas no request) e as background tasks mapeadas (ingestão, render
# multi-versão, palco). Sem progresso numérico — o estado é binário.

_TAREFA_PROGRESSO = {"rodando": 50, "concluido": 100, "erro": 0, "cancelado": 0}


def _jobs_tarefas() -> list[JobGlobal]:
    jobs: list[JobGlobal] = []
    for tarefa in TarefasAtivas.listar():
        jobs.append(
            JobGlobal(
                id=tarefa.chave,
                tipo=tarefa.tipo,
                corte_id=tarefa.corte_id,
                projeto_id=tarefa.projeto_id,
                corte_prefixo=tarefa.corte_prefixo,
                projeto_prefixo=tarefa.projeto_prefixo,
                estado=tarefa.estado,  # type: ignore[arg-type]
                progresso=_TAREFA_PROGRESSO.get(tarefa.estado, 0),
                etapa=tarefa.etapa,
                erro=tarefa.erro,
            )
        )
    return jobs


class JobsGlobais:
    """Coletor com memória das transições (ver retenção no topo do módulo)."""

    # corte→(assinatura, instante em que essa assinatura foi vista pela 1ª vez)
    _transicoes: dict[str, tuple[str, float]] = {}

    @classmethod
    def coletar(cls, agora: float | None = None) -> list[JobGlobal]:
        instante = time.time() if agora is None else agora
        candidatos = (
            _jobs_bruto() + _jobs_pos() + _jobs_render() + _jobs_youtube() + _jobs_tarefas()
        )
        publicaveis = [job for job in candidatos if cls._publicavel(job, instante)]
        cls._esquecer_ausentes({job.id for job in candidatos})
        return publicaveis

    @classmethod
    def _publicavel(cls, job: JobGlobal, agora: float) -> bool:
        momento = cls._carimbar(job, agora)
        return job.ativo or agora - momento < RETENCAO_TERMINAL_SEG

    @classmethod
    def _carimbar(cls, job: JobGlobal, agora: float) -> float:
        """Instante da transição atual do job, registrando-a se for nova."""
        assinatura = job.assinatura()
        anterior = cls._transicoes.get(job.id)
        if anterior is None:
            # Nunca visto: se já chega terminal, terminou antes de estarmos
            # observando — nasce expirado para não poluir a fila no boot.
            momento = agora if job.ativo else agora - RETENCAO_TERMINAL_SEG
        elif anterior[0] != assinatura:
            momento = agora
        else:
            momento = anterior[1]
        cls._transicoes[job.id] = (assinatura, momento)
        return momento

    @classmethod
    def _esquecer_ausentes(cls, ids_vivos: set[str]) -> None:
        for job_id in [job_id for job_id in cls._transicoes if job_id not in ids_vivos]:
            del cls._transicoes[job_id]

    @classmethod
    async def coletar_descritos(cls, db: AsyncSession) -> list[dict]:
        """Jobs prontos para a UI: com projeto, número do corte e rótulo do tipo.

        Job cujo corte/projeto não existe mais é descartado — sem contexto não há
        o que mostrar na fila.
        """
        jobs = cls.coletar()
        if not jobs:
            return []

        cortes = await _resolver_cortes(db, jobs)
        projetos = await _resolver_projetos(db, jobs)

        descritos: list[dict] = []
        for job in jobs:
            contexto = cortes.get(_chave_corte(job)) or projetos.get(_chave_projeto(job))
            if contexto is None:
                continue
            descritos.append({**job.to_dict(), **contexto})
        return descritos

    @classmethod
    def resetar(cls) -> None:
        """Limpa a memória de transições (usado em teste)."""
        cls._transicoes.clear()


def _chave_corte(job: JobGlobal) -> str:
    return job.corte_id or job.corte_prefixo


def _chave_projeto(job: JobGlobal) -> str:
    return job.projeto_id or job.projeto_prefixo


def _indexar(contextos: dict[str, dict], chaves: set[str]) -> dict[str, dict]:
    """Mapeia cada chave pedida (id completo OU prefixo de 8 chars) ao contexto."""
    indexado: dict[str, dict] = {}
    for chave in chaves:
        for id_completo, contexto in contextos.items():
            if id_completo.startswith(chave):
                indexado[chave] = contexto
                break
    return indexado


async def _resolver_cortes(db: AsyncSession, jobs: list[JobGlobal]) -> dict[str, dict]:
    chaves = {chave for chave in (_chave_corte(job) for job in jobs) if chave}
    if not chaves:
        return {}
    linhas = (
        await db.execute(
            select(Corte.id, Corte.numero, Corte.projeto_id, Projeto.titulo_live)
            .join(Projeto, Projeto.id == Corte.projeto_id)
            .where(or_(*(Corte.id.like(f"{chave}%") for chave in chaves)))
        )
    ).all()
    contextos = {
        corte_id: {
            "corte_id": corte_id,
            "corte_numero": numero,
            "projeto_id": projeto_id,
            "projeto_titulo": titulo_live,
        }
        for corte_id, numero, projeto_id, titulo_live in linhas
    }
    return _indexar(contextos, chaves)


async def _resolver_projetos(db: AsyncSession, jobs: list[JobGlobal]) -> dict[str, dict]:
    chaves = {chave for chave in (_chave_projeto(job) for job in jobs) if chave}
    if not chaves:
        return {}
    linhas = (
        await db.execute(
            select(Projeto.id, Projeto.titulo_live).where(
                or_(*(Projeto.id.like(f"{chave}%") for chave in chaves))
            )
        )
    ).all()
    contextos = {
        projeto_id: {
            "corte_id": "",
            "corte_numero": None,
            "projeto_id": projeto_id,
            "projeto_titulo": titulo_live,
        }
        for projeto_id, titulo_live in linhas
    }
    return _indexar(contextos, chaves)
