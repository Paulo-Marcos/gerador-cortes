"""Cada saída da geração do bruto (D-716).

Teste de caracterização, antes de fatiar `ExportService.gerar_bruto_via_worker`
(complexidade 37). A suíte provava a salvaguarda de silêncios, o offset do
áudio e a etapa de shorts, e deixava 32 ramos sem teste: os erros do worker, o
timeout, o arquivo pequeno, a duração divergente, o log detalhado e as etapas
derivadas que falham sem derrubar o bruto.

A esteira é a mesma do `test_gerar_bruto_salvaguarda_silencios`: a sessão é
dublê, e o `build_bruto_pipeline` falso escreve o clip e a resposta do worker —
o caminho inteiro sem FFmpeg nem fila real. As referências trocadas ficam no
topo.
"""

import json
import types
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services import corte as corte_module
from app.services import deteccao_segmentos as deteccao_module
from app.services import export as export_module
from app.services.bruto_progress import BrutoProgress
from app.services.export import ExportService

gerar = ExportService.gerar_bruto_via_worker

_SUCESSO = {"status": "sucesso"}


class Esteira:
    """Os colaboradores da geração, cada um com uma alavanca para o teste."""

    def __init__(self, monkeypatch, tmp_path):
        self.tmp_path = tmp_path
        self.corte = types.SimpleNamespace(
            id="c1",
            projeto_id="p1",
            inicio_seg=10.0,
            fim_seg=70.0,
            desvios="[]",
            arranjo_blocos=None,
            audio_offset_ms=0,
            status="proposto",
            metadado=None,
            arquivo_clip_path=None,
            duracao_clip_seg=None,
        )
        self.projeto = types.SimpleNamespace(
            id="p1", arquivo_video_path="video.mkv", duracao_segundos=None
        )
        self.video = Path("video.mkv")
        self.resposta: dict | str | None = _SUCESSO
        self.tamanho_do_clip = 2048
        self.duracao_medida: float | None = 60.0
        self.arquivos_do_pipeline: dict[str, str] = {}
        self.segmentos_pedidos: list | None = None

        self.session = AsyncMock()
        self.session.get = AsyncMock(side_effect=self._get)
        self.sincronizar = AsyncMock()
        self.cenas = AsyncMock()
        self.shorts = AsyncMock()
        self.deteccao = MagicMock()

        @asynccontextmanager
        async def fabrica():
            yield self.session

        monkeypatch.setattr(export_module, "AsyncSessionLocal", fabrica)
        monkeypatch.setattr(export_module, "projetos_dir", lambda: tmp_path)
        monkeypatch.setattr(export_module, "is_debug_enabled", lambda: False)
        monkeypatch.setattr(export_module.settings, "bruto_verbose_log", False)
        monkeypatch.setattr(export_module.settings, "claude_auto_cenas_no_bruto", False)
        monkeypatch.setattr(export_module.settings, "claude_auto_shorts_no_bruto", False)
        monkeypatch.setattr(
            ExportService, "_resolver_video_path", staticmethod(lambda *_a: self.video)
        )
        monkeypatch.setattr(
            ExportService, "_probe_duracao", AsyncMock(side_effect=lambda _p: self.duracao_medida)
        )
        monkeypatch.setattr(ExportService, "_aplicar_audio_offset", AsyncMock())
        monkeypatch.setattr(
            corte_module.CorteService,
            "detectar_silencios_tecnico",
            staticmethod(AsyncMock(return_value={"status": "sucesso"})),
        )
        monkeypatch.setattr(
            corte_module.CorteService, "sincronizar_transcricao_corte", self.sincronizar
        )
        monkeypatch.setattr(deteccao_module, "executar_deteccao_segmentos", MagicMock())
        monkeypatch.setattr(export_module, "fire_and_forget", self.deteccao)
        from app.services import shorts as shorts_module
        from app.services.cenas_remotion import CenasRemotionService

        monkeypatch.setattr(CenasRemotionService, "gerar_cenas_via_claude", self.cenas)
        monkeypatch.setattr(shorts_module, "sugerir_shorts", self.shorts)
        monkeypatch.setattr(export_module, "build_bruto_pipeline", self._pipeline)

        async def _sem_espera(_segundos):
            return None

        monkeypatch.setattr("asyncio.sleep", _sem_espera)

    async def _get(self, modelo, _id):
        return self.corte if modelo.__name__ == "Corte" else self.projeto

    @property
    def fila(self) -> Path:
        return self.tmp_path / "fila_remotion"

    @property
    def pasta_do_corte(self) -> Path:
        return self.tmp_path / "p1" / "cortes" / "c1"

    def _pipeline(self, *, video_path, out_path, work_dir, tmp_dir, segmentos):
        self.segmentos_pedidos = segmentos
        Path(out_path).write_bytes(b"x" * self.tamanho_do_clip)
        if self.resposta is not None:
            conteudo = (
                self.resposta if isinstance(self.resposta, str) else json.dumps(self.resposta)
            )
            (self.fila / "res_c1_bruto.json").write_text(conteudo, encoding="utf-8")
        arquivos = {str(Path(tmp_dir) / n): c for n, c in self.arquivos_do_pipeline.items()}
        return types.SimpleNamespace(files=arquivos, cmd=["ffmpeg", "-i"], tmp_dir=str(tmp_dir))


@pytest.fixture
def esteira(monkeypatch, tmp_path):
    return Esteira(monkeypatch, tmp_path)


def _passo(corte_id: str, chave: str) -> str:
    return next(p["status"] for p in BrutoProgress.get(corte_id) if p["chave"] == chave)


# ─── O caminho feliz e o que ele grava ──────────────────────────────────────


@pytest.mark.asyncio
async def test_o_bruto_pronto_grava_caminho_duracao_e_avanca_o_aprovado(esteira):
    esteira.corte.status = "aprovado"
    esteira.duracao_medida = 60.4

    resultado = await gerar("c1")

    assert resultado["status"] == "pronto"
    clip = Path(resultado["clip_path"])
    assert clip.parent == esteira.pasta_do_corte and clip.name.startswith("clip_raw_")
    assert esteira.corte.arquivo_clip_path == export_module.para_relativo_ao_projeto(
        str(clip), "p1"
    )
    assert esteira.corte.duracao_clip_seg == 60.4
    assert esteira.corte.status == export_module.StatusCorte.PROCESSADO
    esteira.session.commit.assert_awaited()
    esteira.sincronizar.assert_awaited_once_with("c1", db=esteira.session)
    esteira.deteccao.assert_called_once()
    assert _passo("c1", "render") == "concluido"
    assert _passo("c1", "transcricao") == "concluido"


@pytest.mark.asyncio
async def test_brutos_e_respostas_antigas_saem_antes_da_geracao(esteira):
    esteira.pasta_do_corte.mkdir(parents=True)
    antigo = esteira.pasta_do_corte / "clip_raw_1.mkv"
    antigo.write_bytes(b"velho")
    esteira.fila.mkdir(parents=True)
    (esteira.fila / "req_c1_bruto.json").write_text("{}", encoding="utf-8")
    (esteira.fila / "res_c1_bruto.json").write_text('{"status": "erro"}', encoding="utf-8")

    resultado = await gerar("c1")

    assert resultado["status"] == "pronto"
    assert not antigo.exists()
    assert not (esteira.fila / "res_c1_bruto.json").exists()
    pedido = json.loads((esteira.fila / "req_c1_bruto.json").read_text(encoding="utf-8"))
    assert pedido["id"] == "c1_bruto" and pedido["cmd"] == ["ffmpeg", "-i"]
    assert pedido["cwd"] == str(esteira.pasta_do_corte.absolute())
    # O core devolve o nível como texto; o `.value` quebrava sem as configurações.
    assert pedido["log_level"] == "disabled"


@pytest.mark.asyncio
async def test_o_pipeline_recebe_os_segmentos_sem_desvios_ate_o_fim_do_video(esteira):
    esteira.projeto.duracao_segundos = 50.0
    esteira.corte.desvios = json.dumps([{"inicio_seg": 20.0, "fim_seg": 30.0, "motivo": "x"}])
    esteira.duracao_medida = 30.0

    await gerar("c1")

    assert esteira.segmentos_pedidos == [(10.0, 20.0), (30.0, 50.0)]


@pytest.mark.asyncio
async def test_desvios_corrompidos_valem_como_nenhum_desvio(esteira):
    esteira.corte.desvios = "{nao e json"

    resultado = await gerar("c1")

    assert resultado["status"] == "pronto"
    assert esteira.segmentos_pedidos == [(10.0, 70.0)]


@pytest.mark.asyncio
async def test_sem_duracao_medida_a_duracao_gravada_fica_como_estava(esteira):
    esteira.duracao_medida = None

    resultado = await gerar("c1")

    assert resultado["status"] == "pronto" and esteira.corte.duracao_clip_seg is None


@pytest.mark.asyncio
async def test_os_arquivos_auxiliares_do_pipeline_sao_escritos(esteira):
    esteira.arquivos_do_pipeline = {"lista.txt": "file 'a.mkv'"}

    await gerar("c1")

    (auxiliar,) = esteira.pasta_do_corte.glob("tmp_rerender_c1_bruto_*/lista.txt")
    assert auxiliar.read_text(encoding="utf-8") == "file 'a.mkv'"


# ─── As recusas antes do worker ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_corte_inexistente(esteira):
    esteira.corte = None

    assert await gerar("c1") == {"status": "erro", "mensagem": "Corte não encontrado"}


@pytest.mark.asyncio
async def test_sem_video_de_origem(esteira):
    esteira.video = None

    assert await gerar("c1") == {
        "status": "erro",
        "mensagem": "Arquivo de vídeo original não encontrado.",
    }


@pytest.mark.asyncio
async def test_desvio_que_engole_tudo_nao_esvazia_o_bruto(esteira):
    # A rede de segurança de `segmentos_na_ordem` devolve o intervalo cheio; por
    # isso o "Nenhum segmento válido." da geração não tem entrada que o alcance.
    esteira.corte.desvios = json.dumps([{"inicio_seg": 0.0, "fim_seg": 100.0, "motivo": "x"}])

    assert (await gerar("c1"))["status"] == "pronto"
    assert esteira.segmentos_pedidos == [(10.0, 70.0)]


# ─── O que o worker devolve ──────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("resposta", "mensagem"),
    [
        (None, "Timeout: Native Worker não respondeu em 10 minutos."),
        ("{quebrado", "Falha ao ler resposta do Native Worker."),
        ({"status": "erro", "erro": "codec"}, "FFmpeg falhou: codec"),
        ({"status": "erro"}, "FFmpeg falhou: desconhecido"),
    ],
)
@pytest.mark.asyncio
async def test_resposta_do_worker_que_nao_serve(esteira, resposta, mensagem):
    esteira.resposta = resposta

    assert await gerar("c1") == {"status": "erro", "mensagem": mensagem}
    esteira.session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_clip_menor_que_um_kb_nao_foi_gerado(esteira):
    esteira.tamanho_do_clip = 100

    assert await gerar("c1") == {
        "status": "erro",
        "mensagem": "Arquivo bruto não foi gerado pelo worker.",
    }


@pytest.mark.asyncio
async def test_duracao_divergente_recusa_o_bruto(esteira):
    esteira.duracao_medida = 66.0

    resultado = await gerar("c1")

    assert resultado["status"] == "erro"
    assert resultado["mensagem"] == (
        "Duração divergente: esperado=60.0s, real=66.0s. Tente gerar novamente."
    )
    esteira.session.commit.assert_not_awaited()


# ─── As etapas derivadas, que falham sem derrubar o bruto ────────────────────


@pytest.mark.asyncio
async def test_regerar_sem_refazer_a_transcricao(esteira):
    await gerar("c1", refazer_transcricao=False)

    esteira.sincronizar.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_deteccao_que_nao_dispara_nao_derruba_o_bruto(esteira):
    esteira.deteccao.side_effect = RuntimeError("sem loop")

    assert (await gerar("c1"))["status"] == "pronto"


@pytest.mark.parametrize(
    ("automatico", "refazer", "gera"),
    [(True, True, True), (True, False, False), (False, True, False)],
)
@pytest.mark.asyncio
async def test_cenas_so_quando_ligadas_e_pedidas(esteira, monkeypatch, automatico, refazer, gera):
    monkeypatch.setattr(export_module.settings, "claude_auto_cenas_no_bruto", automatico)

    await gerar("c1", refazer_cenas=refazer)

    assert esteira.cenas.await_count == (1 if gera else 0)


@pytest.mark.asyncio
async def test_cenas_que_falham_marcam_erro_e_o_bruto_fica_pronto(esteira, monkeypatch):
    monkeypatch.setattr(export_module.settings, "claude_auto_cenas_no_bruto", True)
    esteira.cenas.side_effect = RuntimeError("IA fora")

    assert (await gerar("c1"))["status"] == "pronto"
    assert _passo("c1", "cenas") == "erro"


@pytest.mark.parametrize(("fire", "gera"), [(True, True), (False, False)])
@pytest.mark.asyncio
async def test_shorts_so_para_o_corte_fire(esteira, monkeypatch, fire, gera):
    monkeypatch.setattr(export_module.settings, "claude_auto_shorts_no_bruto", True)
    esteira.corte.metadado = types.SimpleNamespace(is_fire=fire)

    await gerar("c1")

    assert esteira.shorts.await_count == (1 if gera else 0)


@pytest.mark.asyncio
async def test_shorts_que_falham_marcam_erro_e_o_bruto_fica_pronto(esteira, monkeypatch):
    monkeypatch.setattr(export_module.settings, "claude_auto_shorts_no_bruto", True)
    esteira.corte.metadado = types.SimpleNamespace(is_fire=True)
    esteira.shorts.side_effect = RuntimeError("IA fora")

    assert (await gerar("c1"))["status"] == "pronto"
    assert _passo("c1", "shorts") == "erro"


# ─── O log detalhado ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_o_log_detalhado_registra_segmentos_pipeline_e_bruto_preso(esteira, monkeypatch):
    monkeypatch.setattr(export_module.settings, "bruto_verbose_log", True)
    esteira.corte.desvios = json.dumps([{"inicio_seg": 20.0, "fim_seg": 30.0, "motivo": "tosse"}])
    esteira.duracao_medida = 50.0
    esteira.pasta_do_corte.mkdir(parents=True)
    preso = esteira.pasta_do_corte / "clip_raw_1.mkv"
    preso.write_bytes(b"velho")
    unlink_original = Path.unlink

    def unlink_com_player_aberto(caminho, *args, **kwargs):
        if caminho.name == "clip_raw_1.mkv":
            raise PermissionError("em uso pelo player")
        return unlink_original(caminho, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", unlink_com_player_aberto)

    resultado = await gerar("c1")

    assert resultado["status"] == "pronto" and preso.exists()
    log = (esteira.pasta_do_corte / "DEBUG_gerar_bruto.log").read_text(encoding="utf-8")
    assert "[0] [20.0s -> 30.0s] tosse" in log
    assert "Segmentos CALCULADOS: 2" in log
    assert "[PIPELINE DEBUG]" in log and "cmd dispatched: ffmpeg -i" in log


@pytest.mark.asyncio
async def test_bruto_antigo_preso_pelo_player_fica_e_a_geracao_segue(esteira, monkeypatch):
    esteira.pasta_do_corte.mkdir(parents=True)
    preso = esteira.pasta_do_corte / "clip_raw_1.mkv"
    preso.write_bytes(b"velho")
    unlink_original = Path.unlink

    def unlink_com_player_aberto(caminho, *args, **kwargs):
        if caminho.name == "clip_raw_1.mkv":
            raise PermissionError("em uso pelo player")
        return unlink_original(caminho, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", unlink_com_player_aberto)

    assert (await gerar("c1"))["status"] == "pronto" and preso.exists()
    assert not (esteira.pasta_do_corte / "DEBUG_gerar_bruto.log").exists()
