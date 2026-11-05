"""Cancelar a geração derruba o `claude -p`, com os filhos (D-1045).

Cancelar a task soltava só quem esperava: `asyncio.to_thread` não é cancelável, e a
thread seguia presa no `communicate` com a IA trabalhando, até o timeout. Um pedido
novo era aceito, e a geração saía paga em dobro.

A IA nunca é chamada: o `claude` daqui é um script Python. No Windows ele nasce como
o de verdade, `cmd` → pai → neto, e o neto herda os pipes de saída, como o `node`.
Em POSIX o app não roda (ADR-0008), então o neto fica de fora: lá o `kill` é só do
pai, e o neto prenderia o `communicate` do teste.
"""

from __future__ import annotations

import asyncio
import inspect
import os
import subprocess
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import psutil
import pytest
from app.core.tarefas_ativas import TarefasAtivas
from app.infrastructure import claude_cli_client as cli
from app.models import Base, Corte, Projeto
from app.services import cenas_remotion
from app.services.canal.editorial_skills import SkillResolvida
from app.services.cancelamento_jobs import TrabalhoEmVoo, cancelar_job
from app.services.cenas_remotion import CenasRemotionService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

_IMPORTAR_DE_VERDADE = inspect.getattr_static(CenasRemotionService, "importar_cenas")

_CLAUDE_FALSO = r"""
import json, os, subprocess, sys, time
from pathlib import Path

pasta, papel, segundos = Path(sys.argv[1]), sys.argv[2], float(sys.argv[3])

temporario = pasta / f"{papel}.{os.getpid()}.tmp"
temporario.write_text("", encoding="utf-8")
temporario.replace(pasta / f"{papel}.{os.getpid()}.pid")

if papel == "neto":
    time.sleep(segundos)
    sys.exit(0)

if os.name == "nt":
    subprocess.Popen(
        [sys.executable, __file__, str(pasta), "neto", str(segundos)],
        stdin=subprocess.DEVNULL,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
sys.stdin.buffer.read()
time.sleep(segundos)
resultado = json.dumps({"cenas": [{"tipo": "orfa"}]})
print(json.dumps({"type": "result", "is_error": False, "result": resultado}))
"""

# Longe de qualquer espera do teste: se o processo sobreviver, o teste vê.
_PENSANDO_SEG = 20.0
_PRAZO_SEG = 15.0
_QUEM_DEVE_MORRER = ("pai", "neto") if os.name == "nt" else ("pai",)
_CORTE = "c1"
_JOB = f"bruto:{_CORTE}"
_RESPOSTA = '{"cenas": [{"tipo": "orfa"}]}'
_SEM_CENAS = "[]"  # o valor do corte que nasce


class ClaudeFalso:
    def __init__(self, pasta: Path):
        self.pasta = pasta
        self.segundos = _PENSANDO_SEG
        self.script = pasta / "claude_falso.py"
        self.script.write_text(_CLAUDE_FALSO, encoding="utf-8")

    def argv(self, _modelo: str, _turnos: int) -> list[str]:
        comando = [sys.executable, str(self.script), str(self.pasta), "pai", str(self.segundos)]
        return ["cmd", "/c", *comando] if os.name == "nt" else comando

    def pids(self, papel: str = "*") -> list[int]:
        return [int(arquivo.stem.split(".")[1]) for arquivo in self.pasta.glob(f"{papel}.*.pid")]

    def execucoes(self) -> int:
        return len(self.pids("pai"))

    async def nascido(self) -> list[int]:
        """Os PIDs da árvore, assim que todos tiverem nascido."""
        await _ate(lambda: all(self.pids(papel) for papel in _QUEM_DEVE_MORRER))
        return self.pids()


async def _ate(condicao, prazo: float = _PRAZO_SEG) -> None:
    fim = asyncio.get_running_loop().time() + prazo
    while not condicao():
        assert asyncio.get_running_loop().time() < fim, "prazo estourado"
        await asyncio.sleep(0.05)


def _vivos(pids: list[int]) -> list[int]:
    return [pid for pid in pids if psutil.pid_exists(pid)]


@pytest.fixture
def claude(tmp_path, monkeypatch):
    falso = ClaudeFalso(tmp_path)
    monkeypatch.setattr(cli, "_montar_argv", falso.argv)
    monkeypatch.setattr(cli.settings, "claude_cli_enabled", True)
    monkeypatch.setattr(cli.settings, "claude_cli_max_concurrent", 1)
    monkeypatch.setattr(cli.settings, "claude_cli_retries", 2)
    monkeypatch.setattr(cli.settings, "ia_claude_transporte", "assinatura")
    TarefasAtivas.limpar()
    TrabalhoEmVoo.limpar()
    yield falso
    TarefasAtivas.limpar()
    TrabalhoEmVoo.limpar()
    # Pelo PID: com o teste reprovado, nada fica rodando na máquina.
    for pid in _vivos(falso.pids()):
        psutil.Process(pid).kill()


@pytest.fixture
def telemetria(monkeypatch):
    gravadas: list[dict] = []
    monkeypatch.setattr(cli, "_registrar_telemetria", lambda **dados: gravadas.append(dados))
    return gravadas


@pytest.fixture
def thread_saiu(monkeypatch):
    """Sinal de que a thread do `claude -p` voltou: o `communicate` soltou."""
    saiu = threading.Event()
    original = cli._run_sync

    def vigiado(*args, **kwargs):
        try:
            return original(*args, **kwargs)
        finally:
            saiu.set()

    monkeypatch.setattr(cli, "_run_sync", vigiado)
    return saiu


def _na_fila(corotina) -> asyncio.Task:
    """A geração em voo, como a fila global a enxerga."""
    task = asyncio.create_task(corotina)
    TrabalhoEmVoo.registrar(_JOB, task, owner=f"task:gerar-bruto-{_CORTE}")
    return task


async def _cancelar_pela_fila(task: asyncio.Task) -> None:
    cancelar_job(_JOB)
    with pytest.raises(asyncio.CancelledError):
        await task


@pytest.mark.asyncio
async def test_cancelar_encerra_o_processo_e_os_filhos(claude, telemetria, thread_saiu):
    task = _na_fila(cli.generate_text("prompt", model="sonnet"))
    pids = await claude.nascido()
    assert len(_vivos(pids)) == len(_QUEM_DEVE_MORRER)

    await _cancelar_pela_fila(task)

    await _ate(lambda: not _vivos(pids))
    assert await asyncio.to_thread(thread_saiu.wait, _PRAZO_SEG), "a thread ficou presa no pipe"


@pytest.mark.asyncio
async def test_o_processo_morto_pelo_cancelamento_nao_vira_nova_tentativa(
    claude, telemetria, thread_saiu
):
    """Morrer pelo cancelamento parece erro transitório, e cada tentativa nova é paga."""
    task = _na_fila(cli.generate_text("prompt", model="sonnet"))
    await claude.nascido()

    await _cancelar_pela_fila(task)

    assert await asyncio.to_thread(thread_saiu.wait, _PRAZO_SEG)
    await asyncio.sleep(0.2)
    assert claude.execucoes() == 1


@pytest.mark.asyncio
async def test_o_pedido_novo_nao_convive_com_o_cancelado(claude, telemetria, thread_saiu):
    task = _na_fila(cli.generate_text("prompt", model="sonnet"))
    pids = await claude.nascido()
    await _cancelar_pela_fila(task)

    await _ate(lambda: not _vivos(pids))
    assert await asyncio.to_thread(thread_saiu.wait, _PRAZO_SEG)

    claude.segundos = 0.0
    assert "orfa" in await cli.generate_text("prompt", model="sonnet")
    assert claude.execucoes() == 2


@pytest.mark.asyncio
async def test_cancelar_antes_de_o_processo_nascer_nao_o_abre(
    claude, telemetria, thread_saiu, monkeypatch
):
    """A thread já saiu da fila do pool, mas ainda não abriu o processo."""
    entrou, solta = threading.Event(), threading.Event()
    aberturas: list[list[str]] = []
    popen_de_verdade = subprocess.Popen

    def cwd_preso(_skill_mode: bool) -> str:
        entrou.set()
        solta.wait(_PRAZO_SEG)
        return str(claude.pasta)

    def popen_contado(argv, **kwargs):
        aberturas.append(argv)
        return popen_de_verdade(argv, **kwargs)

    monkeypatch.setattr(cli, "_cwd", cwd_preso)
    monkeypatch.setattr(subprocess, "Popen", popen_contado)
    task = _na_fila(cli.generate_text("prompt", model="sonnet"))
    assert await asyncio.to_thread(entrou.wait, _PRAZO_SEG)

    await _cancelar_pela_fila(task)
    solta.set()

    assert await asyncio.to_thread(thread_saiu.wait, _PRAZO_SEG)
    assert aberturas == []


def _geracao_de_cenas(monkeypatch) -> list[dict]:
    """A geração de verdade até a IA, sem banco: devolve o que ela grava."""
    gravado: list[dict] = []
    skill = SkillResolvida(
        key="cenas-expert", corpo="", modelo="sonnet", thinking_tokens=0, timeout=60.0, lentes=[]
    )

    async def montar_prompt(_corte_id):
        return {"prompts": [{"texto": "prompt"}]}

    async def importar_cenas(_corte_id, payload):
        # Como o de verdade, que espera o banco (`await db.get`) antes de gravar. Sem isto, um
        # dublê que nunca suspende faz a gravação caber no passo em que a resposta chega.
        await asyncio.sleep(0)
        gravado.append(payload)
        return {"total_cenas": len(payload["cenas"])}

    monkeypatch.setattr(CenasRemotionService, "montar_prompt", montar_prompt)
    monkeypatch.setattr(CenasRemotionService, "importar_cenas", importar_cenas)
    monkeypatch.setattr(cenas_remotion.editorial_skills, "resolver_skill", lambda _key: skill)
    monkeypatch.setattr(cenas_remotion, "registrar_skill_usada", lambda *_a: None)
    return gravado


@pytest.mark.asyncio
async def test_nada_e_gravado_depois_de_cancelar(claude, telemetria, thread_saiu, monkeypatch):
    gravado = _geracao_de_cenas(monkeypatch)
    # Curto: sobrevivendo ao cancelamento, ela responde com cenas válidas durante o teste.
    claude.segundos = 1.0
    task = _na_fila(CenasRemotionService.gerar_cenas_via_claude(_CORTE))
    await claude.nascido()

    await _cancelar_pela_fila(task)

    assert await asyncio.to_thread(thread_saiu.wait, _PRAZO_SEG)
    await asyncio.sleep(claude.segundos + 0.2)
    assert gravado == []
    assert telemetria == []


@pytest.mark.asyncio
async def test_a_resposta_que_chega_junto_do_cancelamento_nao_e_gravada(
    claude, telemetria, monkeypatch
):
    """O cancelamento e a resposta se cruzam: as cenas não entram.

    A telemetria fica de fora: se a resposta chegou, a chamada foi paga, e registrá-la é certo.
    """
    gravado = _geracao_de_cenas(monkeypatch)
    loop = asyncio.get_running_loop()
    tasks: list[asyncio.Task] = []

    def responde_cancelado(_prompt, **_kwargs):
        loop.call_soon_threadsafe(tasks[0].cancel)
        return {"is_error": False, "result": '{"cenas": [{"tipo": "orfa"}]}'}

    monkeypatch.setattr(cli, "_run_sync", responde_cancelado)
    tasks.append(_na_fila(CenasRemotionService.gerar_cenas_via_claude(_CORTE)))

    with pytest.raises(asyncio.CancelledError):
        await tasks[0]

    assert gravado == []


@asynccontextmanager
async def _corte_que_a_geracao_grava(pasta: Path, monkeypatch):
    """A gravação de verdade: com transcrição, o `importar_cenas` real grava neste corte."""
    # Em arquivo: cancelar a consulta descarta a conexão, e com ela um banco `:memory:`.
    engine = create_async_engine(f"sqlite+aiosqlite:///{pasta / 'banco.db'}")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with fabrica() as db:
            db.add(Projeto(id="p1", youtube_url="https://x/y"))
            db.add(
                Corte(
                    id=_CORTE,
                    projeto_id="p1",
                    numero=1,
                    status="aprovado",
                    inicio_seg=0,
                    fim_seg=60,
                    transcricao_final='[{"inicio": 0, "fim": 5, "texto": "ola"}]',
                )
            )
            await db.commit()
        monkeypatch.setattr(CenasRemotionService, "importar_cenas", _IMPORTAR_DE_VERDADE)
        monkeypatch.setattr(cenas_remotion, "AsyncSessionLocal", fabrica)
        yield fabrica
    finally:
        await engine.dispose()


async def _cenas_gravadas(fabrica) -> str:
    async with fabrica() as db:
        return (await db.get(Corte, _CORTE)).cenas_remotion


@pytest.mark.asyncio
async def test_sem_cancelar_a_resposta_chega_ao_banco(claude, telemetria, monkeypatch):
    """O controle do teste abaixo: o corte dele grava, então "não gravou" quer dizer algo."""
    _geracao_de_cenas(monkeypatch)

    async def responde(*_args, **_kwargs):
        return {"is_error": False, "result": _RESPOSTA}

    async with _corte_que_a_geracao_grava(claude.pasta, monkeypatch) as fabrica:
        monkeypatch.setattr(cli, "_run", responde)
        await CenasRemotionService.gerar_cenas_via_claude(_CORTE)

        assert await _cenas_gravadas(fabrica) != _SEM_CENAS


@pytest.mark.asyncio
async def test_a_resposta_ja_em_maos_nao_chega_ao_banco_com_o_cancelamento_atras(
    claude, telemetria, monkeypatch
):
    """A corrida que o CI achou, forçada em qualquer versão do Python.

    Desde a 3.13.12, a thread que termina antes do `wrap_future` faz o `await` voltar sem
    suspender, e o cancelamento fica na fila do loop, atrás da resposta. Quem segura é o
    `importar_cenas` de verdade: ele espera o banco antes de gravar, e é nessa espera que o
    cancelamento entra.
    """
    _geracao_de_cenas(monkeypatch)
    tasks: list[asyncio.Task] = []

    async def responde_sem_suspender(*_args, **_kwargs):
        asyncio.get_running_loop().call_soon(tasks[0].cancel)
        return {"is_error": False, "result": _RESPOSTA}

    async with _corte_que_a_geracao_grava(claude.pasta, monkeypatch) as fabrica:
        monkeypatch.setattr(cli, "_run", responde_sem_suspender)
        tasks.append(_na_fila(CenasRemotionService.gerar_cenas_via_claude(_CORTE)))

        with pytest.raises(asyncio.CancelledError):
            await tasks[0]

        # Tempo de uma gravação que tivesse sobrevivido ao cancelamento terminar.
        await asyncio.sleep(1)
        assert await _cenas_gravadas(fabrica) == _SEM_CENAS
        assert len(telemetria) == 1
