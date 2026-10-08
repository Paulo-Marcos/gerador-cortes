"""O robô do YouTube Studio: monetização e vídeo relacionado do short (D-895).

Pedido → teste:
  - monetizar todo vídeo que o app sobe → `test_monetiza_*`, `test_upload_do_corte_*`,
    `test_upload_do_short_*`
  - o short aponta para o corte de onde saiu → `test_relaciona_*`, `test_upload_do_short_*`
  - depois do lote, numa visita só → `test_a_fila_junta_*`
  - interruptor por canal, na tela (ADR-0012) → `test_interruptor_*`, `test_a_tela_*`
"""

import json
import types

import pytest
import pytest_asyncio
from app.core import channel_paths
from app.domain.compartilhado.erros import ServicoExternoFalhou
from app.domain.publicacao import studio_youtube as dominio
from app.domain.publicacao.publicacao import MetadadosBase, ModoPublicacao, Plataforma, adaptar
from app.domain.publicacao.studio_youtube import TarefaNoStudio
from app.services import studio_youtube

CORTE = "corteLongo1"
SHORT = "shortCurto1"
OUTRO = "outroVideo1"


@pytest.fixture
def canal(monkeypatch, tmp_path):
    """Banco e canal próprios: o interruptor gravado aqui não vaza para outro teste."""
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: tmp_path / "canal-a")


@pytest.fixture
def fila(monkeypatch):
    """A fila vazia e o trabalhador dublado: o que se confere é o que entrou."""
    disparos: list[str] = []

    def _disparar(coro, *, name):
        coro.close()
        disparos.append(name)

    monkeypatch.setattr(studio_youtube, "_pendentes", [])
    monkeypatch.setattr(studio_youtube, "_trabalhando", False)
    monkeypatch.setattr(studio_youtube, "fire_and_forget", _disparar)
    return disparos


class PaginaFalsa:
    """Dublê da página: grava o que o roteiro fez e responde o que o teste mandar."""

    def __init__(self, *, texto_monetizacao="Desativada", sem=(), login=False, salva=True):
        self.passos: list[tuple] = []
        self.texto_monetizacao = texto_monetizacao
        self.sem = set(sem)
        self.login = login
        self.salva = salva
        self.url = ""
        self.fechada = False

    def abrir(self, url, *, segundos):
        self.url = "https://accounts.google.com/x" if self.login else url
        self.passos.append(("abrir", url))

    def url_atual(self):
        return self.url

    def existe(self, alvo, *, segundos, visivel=True):
        return alvo not in self.sem

    def texto_de(self, alvo):
        return self.texto_monetizacao

    def clicar(self, alvo, *, segundos):
        self.passos.append(("clicar", alvo))

    def escrever(self, alvo, texto, *, segundos):
        self.passos.append(("escrever", alvo, texto))

    def clicar_cartao_do_video(self, alvo, video_id, *, segundos):
        if "cartao" in self.sem:
            raise RuntimeError("Timeout 30000ms exceeded")
        self.passos.append(("cartao", video_id))

    def habilitado(self, alvo):
        return not self.salva

    def fechar(self):
        self.fechada = True


@pytest.fixture(autouse=True)
def _sem_espera(monkeypatch):
    monkeypatch.setattr(studio_youtube, "PRAZO_PARA_SALVAR", 0.05)
    monkeypatch.setattr(studio_youtube, "INTERVALO_DE_CONFERENCIA", 0.01)
    monkeypatch.setattr(studio_youtube, "RESPIRO_ANTES_DE_COMECAR", 0)


# --------------------------------------------------------------------------- #
# Domínio
# --------------------------------------------------------------------------- #


def test_id_do_video_aceita_link_e_devolve_vazio_sem_ele():
    assert dominio.id_do_video(f"https://youtu.be/{CORTE}") == CORTE
    assert dominio.id_do_video(f"https://www.youtube.com/watch?v={CORTE}") == CORTE
    assert dominio.id_do_video("") == ""
    assert dominio.id_do_video("https://youtu.be/longo") == ""


@pytest.mark.parametrize(
    ("texto", "ligada"),
    [("Ativada", True), ("Desativada", False), ("Monetization On", True), ("Off", False)],
)
def test_le_o_estado_da_monetizacao_pelo_texto(texto, ligada):
    assert dominio.esta_monetizado(texto) is ligada


def test_o_short_nao_se_relaciona_consigo_mesmo_nem_sem_o_interruptor():
    assert dominio.tarefa_do_upload(SHORT, relacionado=SHORT, monetizar=True, relacionar=True) == (
        TarefaNoStudio(SHORT, monetizar=True)
    )
    sem = dominio.tarefa_do_upload(SHORT, relacionado=CORTE, monetizar=False, relacionar=False)
    assert sem.vazia


def test_juntar_faz_uma_visita_por_video():
    tarefas = [
        TarefaNoStudio(CORTE, monetizar=True),
        TarefaNoStudio(SHORT, relacionado=CORTE),
        TarefaNoStudio(SHORT, monetizar=True),
    ]
    assert dominio.juntar(tarefas) == [
        TarefaNoStudio(CORTE, monetizar=True),
        TarefaNoStudio(SHORT, monetizar=True, relacionado=CORTE),
    ]


# --------------------------------------------------------------------------- #
# Interruptor por canal
# --------------------------------------------------------------------------- #


def test_interruptor_nasce_desligado_e_grava_por_canal(canal):
    assert studio_youtube.ler_configuracao() == {"monetizar": False, "relacionar_short": False}

    gravado = studio_youtube.gravar_configuracao(monetizar=True, relacionar_short=False)

    assert gravado == {"monetizar": True, "relacionar_short": False}
    assert studio_youtube.ler_configuracao() == gravado


def test_a_tela_le_e_grava_o_interruptor_pela_api(canal):
    from app.routers import channels
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(channels.router, prefix="/api/channels")
    cliente = TestClient(app)
    rota = "/api/channels/ativo/robo-do-studio"

    assert cliente.get(rota).json() == {"monetizar": False, "relacionar_short": False}
    ligado = {"monetizar": True, "relacionar_short": True}
    assert cliente.put(rota, json=ligado).json() == ligado
    assert cliente.get(rota).json() == ligado


# --------------------------------------------------------------------------- #
# A fila
# --------------------------------------------------------------------------- #


def test_canal_desligado_nao_poe_nada_na_fila(canal, fila):
    studio_youtube.agendar(CORTE)

    assert studio_youtube._pendentes == []
    assert fila == []


def test_agendar_respeita_cada_interruptor(canal, fila):
    studio_youtube.gravar_configuracao(monetizar=True, relacionar_short=False)

    studio_youtube.agendar(SHORT, relacionado=CORTE)
    studio_youtube.agendar(CORTE)

    assert studio_youtube._pendentes == [
        TarefaNoStudio(SHORT, monetizar=True),
        TarefaNoStudio(CORTE, monetizar=True),
    ]
    assert len(fila) == 1, "um trabalhador só, por mais vídeos que entrem"


def test_agendar_nunca_derruba_o_upload(monkeypatch, fila):
    def _quebra():
        raise OSError("banco travado")

    monkeypatch.setattr(studio_youtube, "ler_configuracao", _quebra)

    studio_youtube.agendar(CORTE)

    assert fila == []


@pytest.mark.asyncio
async def test_a_fila_junta_o_lote_numa_visita_so(monkeypatch):
    visitas: list[list[TarefaNoStudio]] = []

    def _no_navegador(tarefas):
        visitas.append(tarefas)
        return []

    monkeypatch.setattr(studio_youtube, "_no_navegador", _no_navegador)
    monkeypatch.setattr(
        studio_youtube,
        "_pendentes",
        [TarefaNoStudio(v, monetizar=True) for v in (CORTE, OUTRO, CORTE)],
    )
    monkeypatch.setattr(studio_youtube, "_trabalhando", True)

    await studio_youtube._esvaziar()

    assert visitas == [
        [TarefaNoStudio(CORTE, monetizar=True), TarefaNoStudio(OUTRO, monetizar=True)]
    ]
    assert studio_youtube._trabalhando is False


# --------------------------------------------------------------------------- #
# O roteiro
# --------------------------------------------------------------------------- #


def test_monetiza_ativando_e_salvando():
    pagina = PaginaFalsa()

    falhas = studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(CORTE, monetizar=True)])

    assert falhas == []
    assert pagina.passos == [
        ("abrir", dominio.url_da_monetizacao(CORTE)),
        ("clicar", "seletor_de_monetizacao"),
        ("clicar", "opcao_ativada"),
        ("clicar", "concluido"),
        ("clicar", "salvar"),
    ]
    assert pagina.fechada, "deu tudo certo: a aba não serve mais"


def test_monetiza_nao_mexe_no_que_ja_esta_ativado():
    pagina = PaginaFalsa(texto_monetizacao="Ativada")

    studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(CORTE, monetizar=True)])

    assert ("clicar", "salvar") not in pagina.passos


def test_monetiza_sem_a_aba_explica_o_programa_de_parcerias():
    pagina = PaginaFalsa(sem={"seletor_de_monetizacao"})

    falhas = studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(CORTE, monetizar=True)])

    assert "Programa de Parcerias" in falhas[0]
    assert not pagina.fechada, "a aba fica: é nela que o operador vê o motivo"


def test_monetiza_que_o_studio_nao_salvou_e_falha():
    with pytest.raises(ServicoExternoFalhou, match="Salvar"):
        studio_youtube.monetizar(PaginaFalsa(salva=False), CORTE)


def test_relaciona_o_short_ao_corte_pela_miniatura():
    pagina = PaginaFalsa()

    falhas = studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(SHORT, relacionado=CORTE)])

    assert falhas == []
    assert pagina.passos == [
        ("abrir", dominio.url_da_edicao(SHORT)),
        ("clicar", "video_relacionado"),
        ("escrever", "busca_do_relacionado", CORTE),
        ("cartao", CORTE),
        ("clicar", "salvar"),
    ]


def test_relaciona_sem_o_corte_na_lista_diz_qual_faltou():
    falhas = studio_youtube.executar_roteiro(
        PaginaFalsa(sem={"cartao"}), [TarefaNoStudio(SHORT, relacionado=CORTE)]
    )

    assert CORTE in falhas[0]


def test_uma_falha_nao_para_os_outros_videos():
    pagina = PaginaFalsa(sem={"video_relacionado"})

    falhas = studio_youtube.executar_roteiro(
        pagina,
        [TarefaNoStudio(SHORT, relacionado=CORTE), TarefaNoStudio(OUTRO, monetizar=True)],
    )

    assert len(falhas) == 1
    assert ("abrir", dominio.url_da_monetizacao(OUTRO)) in pagina.passos


def test_sessao_caida_para_tudo_e_pede_login():
    pagina = PaginaFalsa(login=True)

    falhas = studio_youtube.executar_roteiro(
        pagina, [TarefaNoStudio(CORTE, monetizar=True), TarefaNoStudio(OUTRO, monetizar=True)]
    )

    assert len(falhas) == 1
    assert "login" in falhas[0]


def test_navegador_que_nao_abre_vira_falha_e_nao_excecao(canal, monkeypatch):
    from app.services import navegador_assistido

    def _sem_chrome(*a, **k):
        raise navegador_assistido.ChromeNaoAbriu("Chrome não encontrado")

    monkeypatch.setattr(navegador_assistido, "sessao_no_chrome", _sem_chrome)
    monkeypatch.setattr(studio_youtube.navegador_do_robo, "executavel_escolhido", lambda: None)

    falhas = studio_youtube._no_navegador([TarefaNoStudio(CORTE, monetizar=True)])

    assert "navegador do robô" in falhas[0]


# --------------------------------------------------------------------------- #
# Os ganchos nos uploads
# --------------------------------------------------------------------------- #


@pytest.fixture
def agendados(monkeypatch):
    chamadas: list[tuple[str, str]] = []
    monkeypatch.setattr(
        studio_youtube, "agendar", lambda vid, relacionado="": chamadas.append((vid, relacionado))
    )
    return chamadas


@pytest.mark.asyncio
async def test_upload_do_short_agenda_com_o_corte_de_origem(tmp_path, monkeypatch, agendados):
    from app.services import youtube as youtube_module
    from app.services.destinos_shorts import DestinoYouTubeShorts
    from app.services.publicacao_destinos import ContextoPublicacao

    async def _fake_enviar(self, creds, pacote):
        return SHORT

    monkeypatch.setattr(DestinoYouTubeShorts, "_enviar", _fake_enviar)
    monkeypatch.setattr(
        youtube_module.YouTubeService, "_get_credentials", staticmethod(lambda: ("creds", None))
    )
    video = tmp_path / "short.mp4"
    video.write_bytes(b"v")
    destino = DestinoYouTubeShorts()
    pacote = await destino.preparar(
        ContextoPublicacao(
            short_id="s1",
            arquivo=video,
            duracao_seg=30.0,
            vertical=True,
            base=MetadadosBase(
                titulo="t", descricao="d", hashtags=[], url_video_longo=f"https://youtu.be/{CORTE}"
            ),
        )
    )

    await destino.publicar(pacote)

    assert pacote.modo is ModoPublicacao.API
    assert agendados == [(SHORT, CORTE)]


@pytest.mark.asyncio
async def test_upload_do_short_sem_corte_publicado_agenda_sem_relacionado(
    tmp_path, monkeypatch, agendados
):
    from app.services import youtube as youtube_module
    from app.services.destinos_shorts import DestinoYouTubeShorts
    from app.services.publicacao_destinos import PacotePublicacao

    async def _fake_enviar(self, creds, pacote):
        return SHORT

    monkeypatch.setattr(DestinoYouTubeShorts, "_enviar", _fake_enviar)
    monkeypatch.setattr(
        youtube_module.YouTubeService, "_get_credentials", staticmethod(lambda: ("creds", None))
    )
    pacote = PacotePublicacao(
        plataforma=Plataforma.YOUTUBE_SHORTS,
        modo=ModoPublicacao.API,
        arquivo=tmp_path / "short.mp4",
        metadados=adaptar(MetadadosBase(titulo="t", descricao="d"), Plataforma.YOUTUBE_SHORTS),
    )

    await DestinoYouTubeShorts().publicar(pacote)

    assert agendados == [(SHORT, "")]


@pytest_asyncio.fixture
async def corte_no_banco(monkeypatch, tmp_path):
    from app.models import Base, Corte, Projeto
    from app.services import youtube as youtube_module
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(youtube_module, "AsyncSessionLocal", fabrica)
    async with fabrica() as db:
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw="[]"))
        db.add(Corte(id="c1", projeto_id="p1", numero=1, inicio_seg=0.0, fim_seg=60.0))
        await db.commit()
    yield fabrica
    await engine.dispose()


@pytest.mark.asyncio
async def test_upload_do_corte_agenda_a_monetizacao(
    corte_no_banco, monkeypatch, tmp_path, agendados
):
    """O gancho vale para o lote E para o upload avulso: os dois passam por aqui."""
    import asyncio

    from app.services import youtube as youtube_module

    pronto = tmp_path / "p1" / "cortes" / "c1" / "upload_ready"
    pronto.mkdir(parents=True)
    (pronto / "video.mp4").write_bytes(b"v")
    (pronto / "metadados.txt").write_text("=== TÍTULO ===\nT\n", encoding="utf-8")

    async def _valido(_corte_id):
        return {"bloqueado": False}

    class _Loop:
        async def run_in_executor(self, _executor, _fn):
            return {"status": "ok", "video_id": CORTE, "url": f"https://youtu.be/{CORTE}"}

    monkeypatch.setattr(youtube_module, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(youtube_module.ValidacaoPublicacaoService, "validar", staticmethod(_valido))
    monkeypatch.setattr(
        youtube_module.YouTubeService, "_get_credentials", staticmethod(lambda: ("creds", None))
    )
    monkeypatch.setattr(
        youtube_module.MediaRetentionService,
        "aplicar_apos_upload",
        staticmethod(lambda corte: types.SimpleNamespace(to_dict=lambda: {})),
    )
    monkeypatch.setattr(
        youtube_module,
        "asyncio",
        types.SimpleNamespace(to_thread=asyncio.to_thread, get_running_loop=_Loop),
    )

    resultado = await youtube_module.YouTubeService.upload_video("c1")

    assert resultado["status"] == "ok", json.dumps(resultado)
    assert agendados == [(CORTE, "")]


@pytest.mark.asyncio
async def test_corte_ja_publicado_nao_volta_para_a_fila(corte_no_banco, monkeypatch, agendados):
    from app.models import Corte
    from app.services import youtube as youtube_module

    async with corte_no_banco() as db:
        corte = await db.get(Corte, "c1")
        corte.youtube_video_id = CORTE
        await db.commit()
    monkeypatch.setattr(
        youtube_module.MediaRetentionService,
        "aplicar_apos_upload",
        staticmethod(lambda corte: types.SimpleNamespace(to_dict=lambda: {})),
    )

    await youtube_module.YouTubeService.upload_video("c1")

    assert agendados == []
