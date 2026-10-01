"""Acompanhamento (em memória) do render de um short, por candidato (D-485).

O render do short nasceu reusando o worker, a fila e o gate de RAM do pipeline
horizontal — e NÃO reusou o instrumento que torna tudo isso legível. O resultado
foi cinco minutos e meio de silêncio absoluto entre o clique e o arquivo, com o
operador sem meio de distinguir "rodando" de "morto".

Por que o tempo decorrido está aqui e não só os passos: no bruto, cada etapa dura
segundos e a lista basta. No short, a camada do Remotion sozinha leva minutos —
saber QUAL passo roda não responde "há quanto tempo", que é a pergunta de quem
desconfia que travou.

In-memory, mesmo arranjo do `BrutoProgress`: vale para o processo do backend
local, e um reload do uvicorn limpa o store. A tela então cai no estado do banco
como fonte de verdade — tem prévia ou não tem.
"""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import NamedTuple

from app.core.channel_paths import projetos_dir
from app.database import AsyncSessionLocal
from app.models import Corte, Short

# Os três passos do `render_short._produzir`, na ordem em que ele os despacha.
PASSOS_RENDER: list[tuple[str, str]] = [
    ("recorte", "Recortar 9:16"),
    ("camada", "Desenhar legenda e cenas"),
    ("composicao", "Compor o vídeo final"),
]

# status por passo: "pendente" | "rodando" | "concluido" | "erro"

# D-844: como o estágio aparece na etapa da fila global ("Short 2 (prévia): …").
ROTULO_DO_ESTAGIO = {"previa": "prévia", "final": "final"}


class LugarDoShort(NamedTuple):
    """Onde o short mora, com os ids lidos do BANCO, nunca os da URL (D-811)."""

    projeto_id: str
    corte_id: str
    short_id: str
    numero: int


class ShortsProgress:
    """Store por short do render em curso."""

    _store: dict[str, dict] = {}

    @classmethod
    def iniciar(cls, short_id: str, *, estagio: str) -> None:
        """Zera os passos e liga o cronômetro. `estagio` é "previa" ou "final"."""
        cls._store[short_id] = {
            "estagio": estagio,
            "iniciado_em": time.monotonic(),
            # D-844: o cronômetro para no desfecho; sem isto o card cancelado
            # (ou com erro) seguia contando como se rodasse.
            "terminado_em": None,
            "concluido": False,
            "erro": None,
            # D-844: parado pela fila — desfecho pedido, não falha.
            "cancelado": False,
            # D-844: de que corte, para a fila global dizer "corte 7 → short",
            # e o número, porque dois shorts do mesmo corte teriam o mesmo rótulo.
            "corte_id": "",
            "numero": 0,
            # D-843: o motivo da espera no portão de render; None = já tem vaga.
            "fila": None,
            "passos": [
                {"chave": chave, "label": label, "status": "pendente"}
                for chave, label in PASSOS_RENDER
            ],
        }

    @classmethod
    def marcar(cls, short_id: str, chave: str, status: str) -> None:
        """Atualiza um passo. No-op quando não há render em curso para o short."""
        sessao = cls._store.get(short_id)
        if not sessao:
            return
        for passo in sessao["passos"]:
            if passo["chave"] == chave:
                passo["status"] = status
                return

    @classmethod
    def na_fila(cls, short_id: str, motivo: str | None) -> None:
        """Conta por que o render ainda não começou (vaga ou RAM); None ao entrar."""
        sessao = cls._store.get(short_id)
        if sessao:
            sessao["fila"] = motivo

    @classmethod
    def vincular(cls, short_id: str, lugar: LugarDoShort) -> None:
        """Anota o corte do short; sem ele a fila global não tem o que mostrar."""
        sessao = cls._store.get(short_id)
        if sessao:
            sessao["corte_id"] = lugar.corte_id
            sessao["numero"] = lugar.numero

    @classmethod
    def concluir(cls, short_id: str) -> None:
        sessao = cls._store.get(short_id)
        if sessao:
            _encerrar(sessao)

    @classmethod
    def falhar(cls, short_id: str, erro: str) -> None:
        """Guarda o erro NO STORE, porque ele não volta mais pela resposta HTTP.

        O render virou assíncrono: o POST responde na hora e a falha acontece
        depois. Sem isto, um render que morre no meio deixaria a tela em
        "rodando" para sempre — pior que o silêncio que esta demanda veio
        resolver.
        """
        sessao = cls._store.get(short_id)
        if not sessao:
            return
        sessao["erro"] = erro
        _encerrar(sessao)
        for passo in sessao["passos"]:
            if passo["status"] == "rodando":
                passo["status"] = "erro"

    @classmethod
    def cancelar(cls, short_id: str) -> None:
        """O operador parou o render pela fila (D-844).

        Sem isto o `CancelledError` (que não é `Exception`) passava reto pelo
        `except` do render e a tela ficava em "rodando" para sempre. O passo
        interrompido volta a pendente: ele não terminou, mas também não falhou.
        """
        sessao = cls._store.get(short_id)
        if not sessao:
            return
        sessao["cancelado"] = True
        _encerrar(sessao)
        sessao["fila"] = None
        for passo in sessao["passos"]:
            if passo["status"] == "rodando":
                passo["status"] = "pendente"

    @classmethod
    def em_curso(cls, short_id: str) -> bool:
        """Se há um render rodando agora — o que impede disparar outro em cima."""
        sessao = cls._store.get(short_id)
        return bool(sessao) and not sessao["concluido"]

    @classmethod
    def get(cls, short_id: str) -> dict | None:
        """O estado do render, com o tempo decorrido calculado na leitura.

        `None` quando nunca houve render deste short neste processo.
        """
        sessao = cls._store.get(short_id)
        if not sessao:
            return None
        return {
            "estagio": sessao["estagio"],
            "concluido": sessao["concluido"],
            "erro": sessao["erro"],
            "fila": sessao["fila"],
            "decorrido_seg": round(
                (sessao["terminado_em"] or time.monotonic()) - sessao["iniciado_em"], 1
            ),
            "passos": [dict(passo) for passo in sessao["passos"]],
        }

    @classmethod
    def listar_para_a_fila(cls) -> list[dict]:
        """Cada render conhecido no vocabulário da fila global (D-844).

        Short sem corte anotado fica de fora: a fila descartaria o job de
        qualquer jeito, sem projeto nem número de corte para mostrar.
        """
        return [
            {"short_id": short_id, "corte_id": sessao["corte_id"], **_descrever_situacao(sessao)}
            for short_id, sessao in cls._store.items()
            if sessao["corte_id"]
        ]


def _encerrar(sessao: dict) -> None:
    sessao["concluido"] = True
    sessao["terminado_em"] = time.monotonic()


def _descrever_situacao(sessao: dict) -> dict:
    """Estado, progresso, etapa e erro de um render, como a fila global os lê."""
    passos = sessao["passos"]
    feitos = sum(1 for passo in passos if passo["status"] == "concluido")
    rodando = next((passo["label"] for passo in passos if passo["status"] == "rodando"), "")
    if sessao["cancelado"]:
        estado, etapa = "cancelado", "Cancelado"
    elif sessao["erro"]:
        estado, etapa = "erro", "Falha no render"
    elif sessao["concluido"]:
        estado, etapa = "concluido", "Pronto"
    elif sessao["fila"]:
        estado, etapa = "aguardando", sessao["fila"]
    else:
        estado, etapa = "rodando", rodando or "Preparando o render"
    return {
        "estado": estado,
        "progresso": 100 if estado == "concluido" else round(feitos / len(passos) * 100),
        "etapa": f"Short {sessao['numero']} ({ROTULO_DO_ESTAGIO[sessao['estagio']]}): {etapa}",
        "erro": sessao["erro"] or "",
    }


# D-568: o log do worker, que ja existe e ninguem lia.
#
# O `native_worker` escreve um `worker_debug.log` no `cwd` de cada job — e o
# render do short passa o diretorio DELE como cwd, entao o arquivo ja nasce por
# short, com uma entrada por passo:
#
#   [iso] Job: <id>            CMD: ...            CWD: ...
#   [iso] Fim: <id> status=sucesso duration_ms=409048
#
# E o que o operador acompanha no horizontal ("vai atualizando o status de
# execucao, e no final mostra ate quanto tempo demorou"). Faltava so servir.
LINHAS_DO_LOG = 80
LARGURA_DA_LINHA = 400

_FIM = re.compile(r"Fim: \S+ status=(\w+) duration_ms=(\d+)")


def resumir_log(texto: str, *, linhas: int = LINHAS_DO_LOG) -> dict:
    """As ultimas linhas do log do worker, e quanto cada passo levou.

    A linha de CMD do ffmpeg tem varios kilobytes — um filtergraph inteiro numa
    linha so. Cortar em `LARGURA_DA_LINHA` mantem o log legivel numa caixa de
    tela sem esconder o que importa: o inicio dela ja diz qual binario rodou.

    >>> resumir_log("[t] Fim: j_1 status=sucesso duration_ms=1500")["duracoes_ms"]
    [1500]
    """
    todas = [linha.rstrip() for linha in texto.splitlines() if linha.strip()]
    recorte = todas[-linhas:]
    return {
        "linhas": [
            linha if len(linha) <= LARGURA_DA_LINHA else linha[:LARGURA_DA_LINHA] + " […]"
            for linha in recorte
        ],
        "truncado": len(todas) > len(recorte),
        # Uma duracao por passo concluido, na ordem em que sairam.
        "duracoes_ms": [int(m.group(2)) for m in _FIM.finditer(texto)],
    }


def diretorio_do_short(projeto_id: str, corte_id: str, short_id: str) -> Path:
    """Onde moram os artefatos deste short: MP4, props e o log do worker.

    D-568: escrito num lugar so porque o LOG depende de concordar com o RENDER.
    Enquanto eram duas expressoes iguais, o dia em que o render mudasse de pasta
    — e ele ja mudou uma vez, quando os shorts ganharam subdiretorio proprio —
    o log passaria a ler onde ninguem escreve, SEM ERRO NENHUM: `is_file()` da
    falso, a funcao devolve `existe: false`, e a tela diz educadamente que nao ha
    log ainda. Mentira plausivel, que e a pior categoria.
    """
    return projetos_dir() / projeto_id / "cortes" / corte_id / "shorts" / short_id


async def localizar_short(short_id: str) -> LugarDoShort:
    """Projeto, corte e número do short. Levanta `LookupError` se algum sumiu."""
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError("Corte do short nao encontrado")
        return LugarDoShort(corte.projeto_id, corte.id, short.id, short.numero)


async def log_do_render(short_id: str) -> dict:
    """O `worker_debug.log` deste short, resumido.

    Sem arquivo nao e erro: significa que nenhum passo chegou a ser despachado
    ainda. A tela mostra "ainda nao ha log" em vez de um 404 que pareceria
    defeito.
    """
    # O caminho sai dos ids do banco: um `..\` vindo da URL não acha short e
    # para no `LookupError`, antes de virar pasta (D-811).
    lugar = await localizar_short(short_id)
    pasta = diretorio_do_short(lugar.projeto_id, lugar.corte_id, lugar.short_id)
    arquivo = pasta / "worker_debug.log"
    if not arquivo.is_file():
        return {"linhas": [], "truncado": False, "duracoes_ms": [], "existe": False}

    # `errors="replace"`: o ffmpeg escreve caminho com acento em codepage do
    # Windows, e um byte invalido nao pode custar o log inteiro.
    texto = arquivo.read_text(encoding="utf-8", errors="replace")
    return {**resumir_log(texto), "existe": True}
