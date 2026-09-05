"""D-527: trazer de volta o vídeo de uma live já limpa.

A limpeza era mão única: liberado o disco, o projeto perdia a matéria-prima de
qualquer bruto novo e não havia como reaver. Este endpoint é a volta.

O que os testes guardam é a diferença para `reiniciar-download`, que existe ao
lado e é DESTRUTIVO — ele zera transcrição, título e duração. Confundir os dois
custaria a análise inteira de uma live já processada, e o sintoma apareceria
tarde: os cortes apontam para tempos de uma transcrição que não existe mais.
"""

import pytest
from app.routers import projetos as projetos_router
from fastapi import HTTPException


class _FakeDb:
    def __init__(self, projeto=None):
        self._projeto = projeto
        self.commits = 0

    async def get(self, _modelo, _id):
        return self._projeto

    async def commit(self):
        self.commits += 1


class _FakeProjeto:
    def __init__(self, **campos):
        self.youtube_url = "https://youtu.be/abc"
        self.arquivo_video_path = ""
        self.rebaixando_video = 0
        self.progresso_download = 100
        self.arquivos_limpos = 1
        self.status = "analisado"
        self.transcricao_raw = "a transcricao inteira"
        self.titulo_live = "Live de teste"
        self.duracao_segundos = 7200
        self.__dict__.update(campos)


@pytest.fixture
def sem_background(monkeypatch):
    """Não dispara o download de verdade nos testes."""
    disparos = []
    monkeypatch.setattr(
        projetos_router, "fire_and_forget", lambda coro, name=None: disparos.append(name)
    )
    monkeypatch.setattr(projetos_router.IngestaoService, "rebaixar_video", lambda projeto_id: None)
    return disparos


@pytest.mark.asyncio
async def test_marca_o_projeto_e_dispara_o_download(sem_background):
    projeto = _FakeProjeto()
    db = _FakeDb(projeto)

    resposta = await projetos_router.rebaixar_video("p1", db=db)

    assert projeto.rebaixando_video == 1
    assert projeto.progresso_download == 0
    assert sem_background == ["rebaixar-p1"]
    assert resposta["projeto_id"] == "p1"


@pytest.mark.asyncio
async def test_nao_toca_na_transcricao_nem_no_titulo(sem_background):
    """A diferença para `reiniciar-download`, que apaga os três.

    Os cortes apontam para tempos daquela transcrição. Uma transcrição nova — o
    YouTube reprocessa legendas — deslocaria todos eles.
    """
    projeto = _FakeProjeto()
    db = _FakeDb(projeto)

    await projetos_router.rebaixar_video("p1", db=db)

    assert projeto.transcricao_raw == "a transcricao inteira"
    assert projeto.titulo_live == "Live de teste"
    assert projeto.duracao_segundos == 7200
    assert projeto.status == "analisado"


@pytest.mark.asyncio
async def test_recusa_quando_o_video_ja_esta_no_disco(monkeypatch, sem_background):
    """Rebaixar por cima gastaria uma live inteira de banda por engano."""
    projeto = _FakeProjeto(arquivo_video_path="video.mkv")
    monkeypatch.setattr(projetos_router, "resolver_do_projeto", lambda *_: _CaminhoQueExiste())

    with pytest.raises(HTTPException) as erro:
        await projetos_router.rebaixar_video("p1", db=_FakeDb(projeto))

    assert erro.value.status_code == 400
    assert sem_background == []


@pytest.mark.asyncio
async def test_recusa_download_concorrente(sem_background):
    """Dois cliques baixariam a mesma live duas vezes, sobre o mesmo arquivo."""
    projeto = _FakeProjeto(rebaixando_video=1)

    with pytest.raises(HTTPException) as erro:
        await projetos_router.rebaixar_video("p1", db=_FakeDb(projeto))

    assert erro.value.status_code == 409


@pytest.mark.asyncio
async def test_recusa_projeto_sem_url_de_origem(sem_background):
    """Sem URL não há de onde baixar — e o erro precisa dizer isso, não estourar."""
    projeto = _FakeProjeto(youtube_url="")

    with pytest.raises(HTTPException) as erro:
        await projetos_router.rebaixar_video("p1", db=_FakeDb(projeto))

    assert erro.value.status_code == 400


@pytest.mark.asyncio
async def test_projeto_inexistente_da_404(sem_background):
    with pytest.raises(HTTPException) as erro:
        await projetos_router.rebaixar_video("nao-existe", db=_FakeDb(None))

    assert erro.value.status_code == 404


class _CaminhoQueExiste:
    def exists(self):
        return True
