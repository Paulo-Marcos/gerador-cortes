"""Abertura do corte longo: a pergunta do chat ou a ponte com a live (D-910)."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.domain.corte import pergunta_do_chat
from app.infrastructure.web_imagens import Download, DownloadFalhou
from app.services import abertura_do_corte
from app.services.cenas_remotion import CenasRemotionService

from tests.json_schema_minimo import violacoes

PERGUNTA = "a rede anti social vai entregar conteúdo de esquerda durante a eleição?"
INICIO_DO_CORTE = 2842.0

# No tempo do corte: ele lê a pergunta logo no começo e segue respondendo.
TRANSCRICAO = [
    {"start": 0.0, "end": 4.0, "texto": "olha a pergunta do chat"},
    {"start": 4.0, "end": 9.0, "texto": "a rede antissocial vai entregar conteúdo de esquerda"},
    {"start": 9.0, "end": 14.0, "texto": "durante a eleição? eu acho que vai sim"},
    {"start": 14.0, "end": 40.0, "texto": "e explico o porquê com calma agora"},
]


def _linha_do_chat(offset_seg, texto, autor="@Perguntador", foto="https://yt4.ggpht.com/x=s64-c-k"):
    item = {
        "liveChatTextMessageRenderer": {
            "message": {"runs": [{"text": texto}]},
            "authorName": {"simpleText": autor},
            "authorPhoto": {"thumbnails": [{"url": foto, "width": 64}]},
        }
    }
    return json.dumps(
        {
            "replayChatItemAction": {
                "actions": [{"addChatItemAction": {"item": item}}],
                "videoOffsetTimeMsec": str(int(offset_seg * 1000)),
            }
        }
    )


@pytest.fixture
def projetos(tmp_path, monkeypatch):
    monkeypatch.setattr(abertura_do_corte, "projetos_dir", lambda: tmp_path)
    return tmp_path


def _gravar_chat(projetos, *linhas, projeto_id="proj-1"):
    pasta = projetos / projeto_id / "subtitles"
    pasta.mkdir(parents=True)
    (pasta / "chat.live_chat.json").write_text("\n".join(linhas), encoding="utf-8")


def _corte(contextualizacao="", transcricao=None):
    corte = MagicMock()
    corte.id = "corte-1"
    corte.projeto_id = "proj-1"
    corte.inicio_seg = INICIO_DO_CORTE
    corte.fim_seg = INICIO_DO_CORTE + 40
    corte.titulo_proposto = "Título"
    corte.tema_central = "tema"
    corte.resumo = "resumo"
    corte.contextualizacao = contextualizacao
    corte.frase_gancho_texto = ""
    corte.transcricao_final = json.dumps(TRANSCRICAO if transcricao is None else transcricao)
    corte.cenas_remotion = None
    return corte


def _sessao(corte):
    db = AsyncMock()
    db.get = AsyncMock(return_value=corte)
    db.commit = AsyncMock()
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=db)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


class _WebFalsa:
    """`SessaoWeb` que devolve a imagem combinada ou falha, sem rede."""

    pedidos: list[str] = []

    def __init__(self, resposta):
        self._resposta = resposta

    def __call__(self, _user_agent):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *erro):
        return False

    async def baixar(self, url, *, timeout):
        _WebFalsa.pedidos.append(url)
        if isinstance(self._resposta, Exception):
            raise self._resposta
        return self._resposta


# ─── candidatas e bloco do prompt ────────────────────────────────────────────


def test_candidatas_leem_o_chat_do_projeto(projetos):
    _gravar_chat(projetos, _linha_do_chat(2830, PERGUNTA))
    [candidata] = abertura_do_corte.candidatas_do_corte("proj-1", INICIO_DO_CORTE, TRANSCRICAO)
    assert (candidata.autor, candidata.texto) == ("@Perguntador", PERGUNTA)


def test_sem_chat_ou_chat_ilegivel_nao_tem_candidata_nem_erro(projetos):
    assert abertura_do_corte.candidatas_do_corte("proj-1", INICIO_DO_CORTE, TRANSCRICAO) == []
    _gravar_chat(projetos, "{lixo", "não é json")
    assert abertura_do_corte.candidatas_do_corte("proj-1", INICIO_DO_CORTE, TRANSCRICAO) == []


def test_bloco_de_abertura_leva_a_ponte_e_as_candidatas():
    candidata = pergunta_do_chat.PerguntaCandidata(1.0, "@a", "tal coisa?", "", 1.0)
    assert abertura_do_corte.bloco_de_abertura("", []) == ""
    so_ponte = abertura_do_corte.bloco_de_abertura("Depois de X, ele responde Y.", [])
    assert "«Depois de X, ele responde Y.»" in so_ponte
    assert "PERGUNTAS DO CHAT" not in so_ponte
    as_duas = abertura_do_corte.bloco_de_abertura("Depois de X.", [candidata])
    assert "«Depois de X.»" in as_duas and "1. @a: tal coisa?" in as_duas


# ─── prompt de cenas ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_primeira_parte_do_prompt_leva_a_ponte_e_as_perguntas(projetos):
    _gravar_chat(projetos, _linha_do_chat(2830, PERGUNTA))
    corte = _corte(contextualizacao="Depois de falar das redes, ele lê o chat.")
    with patch("app.services.cenas_remotion.AsyncSessionLocal", return_value=_sessao(corte)):
        prompt = (await CenasRemotionService.montar_prompt("corte-1"))["prompts"][0]["texto"]
    assert "«Depois de falar das redes, ele lê o chat.»" in prompt
    assert f"1. @Perguntador: {PERGUNTA}" in prompt
    assert "pergunta_chat" in prompt


@pytest.mark.asyncio
async def test_o_short_nao_leva_abertura(projetos):
    _gravar_chat(projetos, _linha_do_chat(2830, PERGUNTA))
    corte = _corte(contextualizacao="Ponte qualquer.")
    with patch("app.services.cenas_remotion.AsyncSessionLocal", return_value=_sessao(corte)):
        info = await CenasRemotionService.montar_prompt("corte-1", transcricao_override=TRANSCRICAO)
    assert "Ponte qualquer." not in info["prompt"]
    assert "PERGUNTAS DO CHAT" not in info["prompt"]


@pytest.mark.asyncio
async def test_so_a_primeira_parte_leva_a_abertura(projetos):
    longa = [
        {"start": float(i * 5), "end": float(i * 5 + 5), "texto": f"fala número {i}"}
        for i in range(400)
    ]
    corte = _corte(contextualizacao="Ponte da live.", transcricao=longa)
    corte.fim_seg = INICIO_DO_CORTE + 2000
    with patch("app.services.cenas_remotion.AsyncSessionLocal", return_value=_sessao(corte)):
        partes = (await CenasRemotionService.montar_prompt("corte-1"))["prompts"]
    assert len(partes) > 1
    assert "Ponte da live." in partes[0]["texto"]
    assert all("Ponte da live." not in p["texto"] for p in partes[1:])


# ─── a escolha da IA vira o card, e a ponte sai ──────────────────────────────

_RESPOSTA_DA_IA = {
    "pergunta_chat": 1,
    "cenas": [
        # A ponte que a IA fez mesmo assim: disputa a abertura com o card.
        {"tipo": "pergunta_transicao", "startLeg": 0, "duracao_s": 4, "texto": "ponte"},
        {"tipo": "enfase", "startLeg": 7, "duracao_s": 4, "texto": "depois do card"},
    ],
}


async def _importar(resposta, web):
    corte = _corte(contextualizacao="Ponte da live.")
    with (
        patch("app.services.cenas_remotion.AsyncSessionLocal", return_value=_sessao(corte)),
        patch.object(abertura_do_corte, "SessaoWeb", web),
    ):
        return await CenasRemotionService.importar_cenas("corte-1", resposta)


@pytest.mark.asyncio
async def test_com_pergunta_escolhida_o_card_abre_e_a_ponte_sai(projetos):
    _gravar_chat(projetos, _linha_do_chat(2830, PERGUNTA))
    web = _WebFalsa(Download(b"jpeg", "image/jpeg"))

    cenas = (await _importar(_RESPOSTA_DA_IA, web))["cenas"]

    card = cenas[0]
    assert card["tipo"] == "pergunta_chat"
    assert (card["inicio"], card["texto"], card["autor"]) == (0.0, PERGUNTA, "@Perguntador")
    assert [c["texto"] for c in cenas[1:]] == ["depois do card"]
    # O avatar foi baixado para a pasta do corte, no tamanho grande.
    assert _WebFalsa.pedidos[-1] == "https://yt4.ggpht.com/x=s176-c-k"
    assert (projetos / "proj-1" / "cortes" / "corte-1" / "pergunta_chat_avatar.jpg").exists()
    assert card["avatar_url"].endswith("/videos/proj-1/cortes/corte-1/pergunta_chat_avatar.jpg")


@pytest.mark.asyncio
async def test_avatar_que_nao_baixa_deixa_o_card_sem_foto(projetos):
    _gravar_chat(projetos, _linha_do_chat(2830, PERGUNTA))
    web = _WebFalsa(DownloadFalhou("sem rede"))

    card = (await _importar(_RESPOSTA_DA_IA, web))["cenas"][0]

    assert card["tipo"] == "pergunta_chat"
    assert "avatar_url" not in card


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "foto",
    [
        "https://exemplo.com/x=s64-c-k",  # host fora do YouTube
        "http://yt4.ggpht.com/x=s64-c-k",  # sem https
        "https://yt4.ggpht.com.exemplo.com/x=s64",  # imita o host
        "file:///C:/Windows/win.ini",
    ],
)
async def test_avatar_fora_dos_servidores_do_youtube_nao_e_baixado(projetos, foto):
    # A URL vem do arquivo de chat, conteúdo de terceiros: nem chega a pedir.
    _gravar_chat(projetos, _linha_do_chat(2830, PERGUNTA, foto=foto))
    _WebFalsa.pedidos.clear()

    card = (await _importar(_RESPOSTA_DA_IA, _WebFalsa(Download(b"jpeg", "image/jpeg"))))["cenas"][
        0
    ]

    assert card["tipo"] == "pergunta_chat"
    assert "avatar_url" not in card
    assert _WebFalsa.pedidos == []


@pytest.mark.asyncio
async def test_avatar_grande_demais_nao_e_gravado(projetos):
    _gravar_chat(projetos, _linha_do_chat(2830, PERGUNTA))
    enorme = Download(b"x" * (abertura_do_corte._AVATAR_MAXIMO_BYTES + 1), "image/jpeg")

    card = (await _importar(_RESPOSTA_DA_IA, _WebFalsa(enorme)))["cenas"][0]

    assert "avatar_url" not in card
    assert not (projetos / "proj-1" / "cortes" / "corte-1" / "pergunta_chat_avatar.jpg").exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("escolha", [None, 7, "nenhuma"])
async def test_sem_pergunta_valida_a_ponte_fica(projetos, escolha):
    _gravar_chat(projetos, _linha_do_chat(2830, PERGUNTA))
    resposta = {**_RESPOSTA_DA_IA, "pergunta_chat": escolha}

    cenas = (await _importar(resposta, _WebFalsa(DownloadFalhou("não deveria baixar"))))["cenas"]

    assert [c["texto"] for c in cenas] == ["ponte", "depois do card"]


@pytest.mark.asyncio
async def test_a_geracao_leva_a_escolha_da_primeira_parte_ate_a_importacao():
    info = {"prompts": [{"texto": "parte 1"}, {"texto": "parte 2"}]}
    respostas = [
        {"pergunta_chat": 2, "cenas": [{"tipo": "enfase"}]},
        {"pergunta_chat": 1, "cenas": [{"tipo": "enfase"}]},
    ]
    with (
        patch.object(CenasRemotionService, "montar_prompt", AsyncMock(return_value=info)),
        patch("app.services.cenas_remotion.editorial_skills.resolver_skill", MagicMock()),
        patch("app.services.cenas_remotion.registrar_skill_usada"),
        patch("app.services.cenas_remotion.bloco_variacao_de", return_value=""),
        patch("app.services.cenas_remotion.gerar_json", AsyncMock(side_effect=respostas)),
        patch.object(CenasRemotionService, "importar_cenas", AsyncMock()) as importar,
    ):
        await CenasRemotionService._gerar_cenas("corte-1")
    assert importar.call_args.args[1]["pergunta_chat"] == 2


# ─── contrato com o renderer (D-725) ─────────────────────────────────────────


def test_o_card_da_pergunta_cabe_no_contrato_da_cena():
    contrato = json.loads(
        (
            Path(__file__).resolve().parents[3] / "video-renderer" / "protocol" / "cena.schema.json"
        ).read_text(encoding="utf-8")
    )
    candidata = pergunta_do_chat.PerguntaCandidata(1.0, "@a", "pergunta literal?", "", 1.0)
    cena = pergunta_do_chat.cena_da_pergunta(candidata, avatar_url="http://localhost/a.jpg")

    assert violacoes(cena, contrato, "cena") == []
    assert "pergunta_chat" in contrato["properties"]["tipo"]["enum"]
    assert "avatar_url" in contrato["properties"]
