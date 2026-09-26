"""Ressincronizar em lote e não segurar transação enquanto a IA pensa (D-652).

Dois desperdícios diferentes, com a mesma origem — pedir de novo o que já se tem:

1. ressincronizar corte a corte relia e re-parseava a transcrição INTEIRA da
   live a cada corte. Numa live com 30 cortes, trinta vezes o mesmo trabalho.
2. as rotas de IA abriam uma transação de leitura para validar e a deixavam
   aberta durante os MINUTOS da geração. No SQLite, transação aberta é a porta
   da geladeira aberta: quem precisa escrever espera ("database is locked").
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.routers import claude_ia
from app.services import corte as corte_module
from app.services.corte import CorteService
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Formato real da transcrição gravada: inicio/fim/texto. A leitura aceita
# start/end também, mas o texto sai sempre da chave "texto".
FALAS = [{"inicio": float(i), "fim": float(i) + 1.0, "texto": f"fala {i}"} for i in range(0, 600)]


async def _montar(engine, projeto_id: str, quantos_cortes: int):
    Sessao = async_sessionmaker(engine, expire_on_commit=False)
    async with Sessao() as db:
        db.add(
            Projeto(
                id=projeto_id,
                youtube_url=f"https://youtu.be/{projeto_id}",
                titulo_live="Live",
                transcricao_raw=json.dumps(FALAS),
            )
        )
        for i in range(quantos_cortes):
            db.add(
                Corte(
                    id=f"{projeto_id}-c{i}",
                    projeto_id=projeto_id,
                    numero=i + 1,
                    titulo_proposto=f"Corte {i}",
                    inicio_hms="00:00:10",
                    fim_hms="00:01:00",
                    inicio_seg=10.0 + i,
                    fim_seg=60.0 + i,
                )
            )
        await db.commit()
    return Sessao


@pytest_asyncio.fixture
async def engine(tmp_path):
    motor = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'p.db').as_posix()}")
    async with motor.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield motor
    await motor.dispose()


@pytest.mark.asyncio
async def test_lote_le_a_transcricao_da_live_uma_vez_so(engine, monkeypatch):
    Sessao = await _montar(engine, "proj-lote", quantos_cortes=5)

    parses_da_live = 0
    loads_original = corte_module.json.loads

    def contando(texto, *args, **kwargs):
        nonlocal parses_da_live
        if isinstance(texto, str) and texto.startswith('[{"inicio"'):
            parses_da_live += 1
        return loads_original(texto, *args, **kwargs)

    monkeypatch.setattr(corte_module.json, "loads", contando)

    async with Sessao() as db:
        total = await CorteService.sincronizar_transcricao_do_projeto("proj-lote", db)

    assert total == 5
    assert parses_da_live == 1, f"a live foi parseada {parses_da_live} vezes para 5 cortes"


@pytest.mark.asyncio
async def test_lote_produz_o_mesmo_resultado_de_corte_a_corte(engine):
    """Equivalência: o atalho não pode mudar uma vírgula do que é gravado."""
    Sessao = await _montar(engine, "proj-lote", quantos_cortes=3)
    await _montar(engine, "proj-um-a-um", quantos_cortes=3)

    async with Sessao() as db:
        await CorteService.sincronizar_transcricao_do_projeto("proj-lote", db)
        for i in range(3):
            await CorteService.sincronizar_transcricao_corte(f"proj-um-a-um-c{i}", db=db)

    async with Sessao() as db:
        for i in range(3):
            em_lote = await db.get(Corte, f"proj-lote-c{i}")
            um_a_um = await db.get(Corte, f"proj-um-a-um-c{i}")
            assert em_lote.transcricao_corte == um_a_um.transcricao_corte
            assert em_lote.transcricao_final == um_a_um.transcricao_final
            assert em_lote.transcricao_final_texto == um_a_um.transcricao_final_texto
            assert em_lote.transcricao_final_texto, "a sincronia precisa ter produzido algo"


@pytest.mark.asyncio
async def test_projeto_sem_transcricao_nao_sincroniza_nada(engine):
    Sessao = async_sessionmaker(engine, expire_on_commit=False)
    async with Sessao() as db:
        db.add(Projeto(id="vazio", youtube_url="https://youtu.be/vazio", titulo_live="Live"))
        await db.commit()

    async with Sessao() as db:
        assert await CorteService.sincronizar_transcricao_do_projeto("vazio", db) == 0


class _SessaoFalsa:
    """Só o suficiente para ver a ordem: validar, soltar, então chamar a IA."""

    def __init__(self, entidade):
        self.entidade = entidade
        self.eventos: list[str] = []

    async def get(self, _modelo, _id):
        self.eventos.append("leu")
        return self.entidade

    async def rollback(self):
        self.eventos.append("soltou a transação")


@pytest.mark.asyncio
async def test_rota_de_ia_solta_a_transacao_antes_de_chamar_o_modelo(monkeypatch):
    db = _SessaoFalsa(Corte(id="c1", projeto_id="p1", numero=1))

    async def gerar(corte_id, provider="claude"):
        db.eventos.append("chamou a IA")
        return {"ok": True}

    monkeypatch.setattr(claude_ia.CenasRemotionService, "gerar_cenas_via_claude", gerar)

    await claude_ia.gerar_cenas_via_claude("c1", db=db)

    assert db.eventos == ["leu", "soltou a transação", "chamou a IA"]
