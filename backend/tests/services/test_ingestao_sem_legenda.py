"""D-444: sem legenda, a ingestão falha explicando — não declara "pronto".

Antes, quando o yt-dlp não achava json3 nem vtt (live recém-encerrada, ASR do
YouTube ainda não publicado), a ingestão gravava um aviso no lugar da fala e
marcava o projeto como PRONTO. O operador só descobria ao rodar a análise.
"""

import asyncio

import pytest
from app.domain.transcricao_utils import TranscricaoIndisponivelError
from app.models import StatusProjeto
from app.services import ingestao as ingestao_module
from app.services.ingestao import IngestaoService


class _ProcessoFake:
    """Substitui o yt-dlp: roda, não escreve legenda nenhuma, sai com 0."""

    returncode = 0

    async def wait(self):
        return 0

    async def communicate(self):
        # D-653: a ingestão passou a DRENAR a saída (com o cano aberto e ninguém
        # lendo, o processo real trava quando o buffer enche).
        return b"", b""


@pytest.fixture
def yt_dlp_sem_legenda(monkeypatch, tmp_path):
    async def _sem_saida(*_args, **_kwargs):
        return _ProcessoFake()

    monkeypatch.setattr(ingestao_module, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", _sem_saida)
    return tmp_path


class TestExtrairLegenda:
    @pytest.mark.asyncio
    async def test_sem_json3_nem_vtt_levanta_erro_de_dominio(self, yt_dlp_sem_legenda):
        with pytest.raises(TranscricaoIndisponivelError) as exc:
            await IngestaoService._extrair_legenda("proj-1", "https://youtu.be/abc12345678")

        mensagem = str(exc.value)
        assert "legendas automáticas" in mensagem
        assert "Refazer transcrição" in mensagem

    @pytest.mark.asyncio
    async def test_nao_grava_mais_placeholder_no_lugar_da_fala(self, yt_dlp_sem_legenda):
        """A regressão original: retornar um segmento de aviso como se fosse
        transcrição — não-vazio, logo indistinguível de material bom."""
        with pytest.raises(TranscricaoIndisponivelError):
            await IngestaoService._extrair_legenda("proj-1", "https://youtu.be/abc12345678")


class TestProcessarProjeto:
    @pytest.mark.asyncio
    async def test_falha_de_legenda_preserva_o_video_e_marca_erro(self, monkeypatch):
        """O vídeo baixado é o ativo caro: precisa estar gravado no projeto para
        que 'Refazer transcrição' conclua depois sem baixar de novo."""
        salvos: list[tuple] = []
        status: list[tuple] = []

        async def _baixar(*_a, **_kw):
            return "C:/canal/projetos/proj-1/video.mkv"

        async def _extrair(*_a, **_kw):
            raise TranscricaoIndisponivelError("YouTube ainda não publicou as legendas.")

        async def _salvar(projeto_id, transcricao, video_path):
            salvos.append((projeto_id, transcricao, video_path))

        async def _status(projeto_id, st, erro=""):
            status.append((st, erro))

        monkeypatch.setattr(IngestaoService, "_baixar_video", _baixar)
        monkeypatch.setattr(IngestaoService, "_extrair_legenda", _extrair)
        monkeypatch.setattr(IngestaoService, "_salvar_transcricao", _salvar)
        monkeypatch.setattr(IngestaoService, "_atualizar_status", _status)

        await IngestaoService.processar_projeto("proj-1", "https://youtu.be/abc12345678")

        assert salvos == [("proj-1", [], "C:/canal/projetos/proj-1/video.mkv")]

        status_final, erro_final = status[-1]
        assert status_final == StatusProjeto.ERRO
        assert "legendas" in erro_final
        assert StatusProjeto.PRONTO not in [st for st, _ in status]
