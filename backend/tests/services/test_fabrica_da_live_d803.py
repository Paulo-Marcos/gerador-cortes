"""D-803: a IA soma candidatos, e a fábrica atende a live inteira de uma vez.

Três regras moram aqui:

- gerar shorts de novo NÃO apaga candidato nenhum — nem o palpite pendente da
  IA. O que a nova rodada propõe sobre um trecho que já é candidato cai (RN-26);
- a regeração do bruto de um Fire já propõe os shorts (D-455), então o caminho
  manual não paga a mesma chamada de IA duas vezes;
- a fábrica da live baixa o vídeo UMA vez e passa por todos os Fires pendentes
  dela, sem que a falha de um pare os outros.
"""

import asyncio
from datetime import datetime

import pytest
import pytest_asyncio
from app.domain.short.shorts import ResultadoSugestoes, SugestaoShort, sem_repetir_existentes
from app.models import Base, Corte, Projeto, Short, StatusShort
from app.services import fabrica_de_shorts
from app.services import shorts as servico
from app.services.bruto_progress import BrutoProgress
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def _sugestao(titulo: str, inicio: float, fim: float) -> SugestaoShort:
    return SugestaoShort(titulo, "gancho", inicio, fim, 7.0, "porque sim")


class TestSemRepetirExistentes:
    def test_o_trecho_que_ja_e_candidato_cai_com_motivo(self):
        resultado = ResultadoSugestoes(
            sugestoes=[_sugestao("repetido", 20.0, 50.0), _sugestao("novo", 100.0, 130.0)],
            descartes=["velho: sobrepõe um candidato de nota maior"],
        )

        filtrado = sem_repetir_existentes(resultado, [(10.0, 40.0)])

        assert [s.titulo for s in filtrado.sugestoes] == ["novo"]
        assert filtrado.descartes[0].startswith("velho")
        assert "repetido" in filtrado.descartes[1]

    def test_encostar_na_borda_nao_e_repetir(self):
        resultado = ResultadoSugestoes(sugestoes=[_sugestao("vizinho", 40.0, 70.0)])

        assert sem_repetir_existentes(resultado, [(10.0, 40.0)]).sugestoes


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    from app.core import channel_paths

    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", factory)
    monkeypatch.setattr(fabrica_de_shorts, "AsyncSessionLocal", factory)
    fabrica_de_shorts._andamento.clear()

    async with factory() as db:
        db.add(
            Projeto(
                id="p1",
                youtube_url="https://yt/x",
                titulo_live="Live",
                # O ponteiro fica; a live so "existe" quando o arquivo esta no disco.
                arquivo_video_path="video.mkv",
            )
        )
        for numero, cid in enumerate(("c1", "c2", "c3"), start=1):
            db.add(
                Corte(
                    id=cid,
                    projeto_id="p1",
                    numero=numero,
                    titulo_proposto=f"Corte {numero}",
                    inicio_seg=0.0,
                    fim_seg=600.0,
                    inicio_hms="00:00:00.000",
                    fim_hms="00:10:00.000",
                    duracao_clip_seg=600.0,
                    transcricao_final='[{"start": 0.0, "end": 5.0, "texto": "oi"}]',
                    is_fire=True,
                )
            )
        await db.commit()

    yield factory, tmp_path
    await engine.dispose()


def _por_a_live_no_disco(raiz):
    (raiz / "p1").mkdir(parents=True, exist_ok=True)
    (raiz / "p1" / "video.mkv").write_bytes(b"live")


def _por_o_bruto_no_disco(raiz, corte_id):
    pasta = raiz / "p1" / "cortes" / corte_id
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "clip_raw_1.mkv").write_bytes(b"x" * 2048)


class TestIaSomaSemApagar:
    @pytest.mark.asyncio
    async def test_o_palpite_pendente_da_ia_sobrevive_a_nova_rodada(self, ambiente):
        contexto = await servico.montar_contexto("c1")
        await servico.registrar_sugestoes(
            contexto, ResultadoSugestoes(sugestoes=[_sugestao("primeiro", 10.0, 40.0)])
        )

        await servico.registrar_sugestoes(
            contexto,
            ResultadoSugestoes(
                sugestoes=[_sugestao("repete", 20.0, 45.0), _sugestao("segundo", 100.0, 140.0)]
            ),
        )

        factory, _ = ambiente
        async with factory() as db:
            shorts = (await db.scalars(select(Short).order_by(Short.numero))).all()
        assert [(s.titulo_sugerido, s.numero) for s in shorts] == [("primeiro", 1), ("segundo", 2)]

    @pytest.mark.asyncio
    async def test_a_numeracao_continua_depois_de_todos(self, ambiente):
        """Com nada apagado, o próximo número é o maior de TODOS, não só dos curados."""
        factory, _ = ambiente
        async with factory() as db:
            db.add(Short(id="p", corte_id="c1", numero=7, status=StatusShort.SUGERIDO, origem="ia"))
            await db.commit()

        contexto = await servico.montar_contexto("c1")
        gravados = await servico.registrar_sugestoes(
            contexto, ResultadoSugestoes(sugestoes=[_sugestao("novo", 100.0, 140.0)])
        )

        assert gravados[0]["numero"] == 8


class TestSemChamadaDupla:
    @pytest.mark.asyncio
    async def test_regeracao_que_ja_propos_nao_chama_a_ia_de_novo(self, ambiente, monkeypatch):
        _, raiz = ambiente
        _por_a_live_no_disco(raiz)
        chamadas: list[str] = []

        async def _bruto_de_um_fire(corte_id, *, refazer_transcricao, refazer_cenas):
            # O que o export faz com um Fire: o passo de shorts roda no fim.
            BrutoProgress.iniciar(corte_id, incluir_shorts=True)
            BrutoProgress.marcar(corte_id, "shorts", "concluido")
            return {"status": "pronto"}

        async def _sugerir(corte_id):
            chamadas.append(corte_id)
            return {"shorts": [], "descartes": []}

        from app.services.export import ExportService

        monkeypatch.setattr(
            ExportService, "gerar_bruto_via_worker", staticmethod(_bruto_de_um_fire)
        )
        monkeypatch.setattr(servico, "sugerir_shorts", _sugerir)

        resultado = await fabrica_de_shorts.gerar_shorts_do_corte("c1")

        assert chamadas == []
        assert resultado["bruto_regerado"] is True

    @pytest.mark.asyncio
    async def test_se_o_passo_automatico_falhou_a_ia_roda_aqui(self, ambiente, monkeypatch):
        _, raiz = ambiente
        _por_a_live_no_disco(raiz)
        chamadas: list[str] = []

        async def _bruto_com_ia_falha(corte_id, *, refazer_transcricao, refazer_cenas):
            BrutoProgress.iniciar(corte_id, incluir_shorts=True)
            BrutoProgress.marcar(corte_id, "shorts", "erro")
            return {"status": "pronto"}

        async def _sugerir(corte_id):
            chamadas.append(corte_id)
            return {"shorts": [], "descartes": []}

        from app.services.export import ExportService

        monkeypatch.setattr(
            ExportService, "gerar_bruto_via_worker", staticmethod(_bruto_com_ia_falha)
        )
        monkeypatch.setattr(servico, "sugerir_shorts", _sugerir)

        await fabrica_de_shorts.gerar_shorts_do_corte("c1")

        assert chamadas == ["c1"]


@pytest.fixture
def espioes_da_live(monkeypatch):
    """Troca o download e a fábrica do corte por espiões que só anotam a ordem."""
    passos: list[str] = []

    async def _rebaixar(projeto_id, raiz):
        passos.append(f"rebaixar:{projeto_id}")
        _por_a_live_no_disco(raiz)

    async def _gerar_do_corte(corte_id):
        passos.append(f"gerar:{corte_id}")
        if corte_id == "c2":
            raise RuntimeError("a IA caiu")
        return {"shorts": [], "descartes": [], "bruto_regerado": True}

    monkeypatch.setattr(fabrica_de_shorts, "gerar_shorts_do_corte", _gerar_do_corte)
    return passos, _rebaixar


async def _esperar_a_live(projeto_id: str) -> dict:
    for _ in range(200):
        andamento = fabrica_de_shorts.andamento_das_lives()
        estado = next((a for a in andamento if a["projeto_id"] == projeto_id), None)
        if estado and estado["etapa"] in ("concluido", "erro"):
            return estado
        await asyncio.sleep(0.01)
    raise AssertionError("a fábrica da live não terminou")


class TestFabricaDaLive:
    @pytest.mark.asyncio
    async def test_live_limpa_baixa_uma_vez_e_passa_por_todos_os_pendentes(
        self, ambiente, monkeypatch, espioes_da_live
    ):
        factory, raiz = ambiente
        passos, rebaixar = espioes_da_live
        monkeypatch.setattr(fabrica_de_shorts, "_rebaixar_a_live", lambda pid: rebaixar(pid, raiz))
        # c3 já fechou os shorts: não entra na execução.
        async with factory() as db:
            (await db.get(Corte, "c3")).shorts_finalizados_em = datetime(2026, 9, 1)
            await db.commit()

        disparo = await fabrica_de_shorts.disparar_fabrica_da_live("p1")
        estado = await _esperar_a_live("p1")

        assert disparo == {"projeto_id": "p1", "cortes": 2, "baixar_live": True}
        assert passos == ["rebaixar:p1", "gerar:c1", "gerar:c2"]
        # A falha do c2 não parou a live, mas não passou em silêncio.
        assert estado["etapa"] == "concluido"
        assert estado["feitos"] == 2
        assert estado["erros"] == ["Corte 2: a IA caiu"]

    @pytest.mark.asyncio
    async def test_live_no_disco_e_fire_completo_nao_entram(
        self, ambiente, monkeypatch, espioes_da_live
    ):
        factory, raiz = ambiente
        passos, _ = espioes_da_live
        _por_a_live_no_disco(raiz)
        # c1 tem bruto e candidato: nada a fazer nele.
        _por_o_bruto_no_disco(raiz, "c1")
        async with factory() as db:
            (await db.get(Corte, "c1")).arquivo_clip_path = "cortes/c1/clip_raw_1.mkv"
            db.add(Short(id="s1", corte_id="c1", numero=1, status=StatusShort.SUGERIDO))
            await db.commit()

        disparo = await fabrica_de_shorts.disparar_fabrica_da_live("p1")
        await _esperar_a_live("p1")

        assert disparo["baixar_live"] is False
        assert passos == ["gerar:c2", "gerar:c3"]

    @pytest.mark.asyncio
    async def test_segundo_clique_com_a_live_em_andamento_e_recusado(self, ambiente):
        fabrica_de_shorts._andamento["p1"] = {"projeto_id": "p1", "etapa": "gerando"}

        with pytest.raises(ValueError, match="andamento"):
            await fabrica_de_shorts.disparar_fabrica_da_live("p1")

    @pytest.mark.asyncio
    async def test_live_sem_pendencia_e_recusada_com_motivo(self, ambiente):
        factory, _ = ambiente
        async with factory() as db:
            for cid in ("c1", "c2", "c3"):
                (await db.get(Corte, cid)).is_fire = False
            await db.commit()

        with pytest.raises(ValueError, match="Nenhum"):
            await fabrica_de_shorts.disparar_fabrica_da_live("p1")

    @pytest.mark.asyncio
    async def test_live_inexistente(self, ambiente):
        with pytest.raises(LookupError):
            await fabrica_de_shorts.disparar_fabrica_da_live("nao-existe")
