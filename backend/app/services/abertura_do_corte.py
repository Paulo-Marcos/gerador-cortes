"""A abertura do corte longo: a pergunta do chat ou a ponte com a live (D-910).

Quem chega ao corte cai no meio de uma live de duas horas. A 1ª cena dá o chão
por uma de duas fontes, que se excluem:

- **pergunta do chat** — quando o apresentador responde a uma mensagem, o card
  mostra a mensagem como foi digitada e quem perguntou;
- **ponte** — senão, a `contextualizacao` que a skill de cortes escreveu: o que
  veio antes na live e como isso leva ao corte.

As duas entram no prompt de cenas pelo CÓDIGO, na 1ª parte, e não por
placeholder do scaffold: até a D-910 nenhum scaffold de cenas tinha
`{contextualizacao}` e a frase nunca chegava à IA. Mesma solução do M1 com a
pista do chat (`claude_ia.montar_prompt_de_cortes`): o bloco funciona em
qualquer canal, sem editar o scaffold de cada um.

A IA só aponta QUAL pergunta (pelo número) ou nenhuma; o card é montado aqui com
o texto original. A exclusão ("quando tiver chat, não tem ponte") é do domínio:
`pergunta_do_chat.abrir_com_a_pergunta`.

O chat é pista opcional, como no `chat_heat`: sem arquivo, arquivo ilegível ou
avatar que não baixa, a geração segue sem a pergunta ou sem a foto.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urlsplit

from app.config import settings
from app.core.channel_paths import projetos_dir
from app.domain.corte import pergunta_do_chat
from app.domain.corte.pergunta_do_chat import PerguntaCandidata
from app.domain.projeto.chat_mensagens import parse_mensagens_do_chat
from app.infrastructure.web_imagens import DownloadFalhou, SessaoWeb
from app.models import Corte

logger = logging.getLogger(__name__)

_TIMEOUT_DO_AVATAR_S = 15.0
_USER_AGENT = "CutCut/1.0 (https://github.com/paulo-marcos/gerador-cortes)"
_EXTENSAO_POR_TIPO = {"image/png": ".png", "image/webp": ".webp"}

# A foto do chat vem em 64 px; o servidor de imagens do YouTube entrega o tamanho
# que se pede no sufixo `=sNN-`. 176 px cobre o avatar do card em 4K com folga.
_TAMANHO_DO_AVATAR = re.compile(r"=s\d+-")

# A URL vem do arquivo de chat, que é conteúdo de terceiros: só se baixa dos
# servidores de avatar do YouTube, por https, e com teto de tamanho — o avatar
# de 176 px tem ~10 KB.
_HOSTS_DE_AVATAR = (".ggpht.com", ".googleusercontent.com")
_AVATAR_MAXIMO_BYTES = 2 * 1024 * 1024


def candidatas_do_corte(
    projeto_id: str, inicio_seg: float, transcricao_do_corte: list
) -> list[PerguntaCandidata]:
    """As perguntas do chat que o apresentador pode estar respondendo no corte."""
    try:
        arquivos = sorted((projetos_dir() / str(projeto_id) / "subtitles").glob("*.live_chat.json"))
        if not arquivos:
            return []
        conteudo = arquivos[0].read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        logger.info("[Abertura] Chat replay ilegível (%s); sigo sem a pergunta.", exc)
        return []
    return pergunta_do_chat.candidatas_a_pergunta(
        parse_mensagens_do_chat(conteudo),
        inicio_corte_seg=float(inicio_seg or 0),
        transcricao_do_corte=transcricao_do_corte,
    )


def bloco_do_corte(corte: Corte, transcricao_do_corte: list) -> str:
    """O bloco de abertura da 1ª parte do prompt de cenas deste corte."""
    candidatas = candidatas_do_corte(corte.projeto_id, corte.inicio_seg, transcricao_do_corte)
    return bloco_de_abertura(corte.contextualizacao or "", candidatas)


def bloco_de_abertura(contextualizacao: str, candidatas: list[PerguntaCandidata]) -> str:
    """O que a 1ª parte do prompt de cenas leva sobre a abertura. Vazio sem nada."""
    blocos = []
    if contextualizacao.strip():
        blocos.append(
            "CONTEXTUALIZAÇÃO (`contextualizacao`) — a ponte com o que veio antes "
            "na live; é a base da 1ª cena (refine a forma, preserve o sentido):\n"
            f"«{contextualizacao.strip()}»"
        )
    if candidatas:
        blocos.append(pergunta_do_chat.formatar_candidatas(candidatas))
    return "\n\n".join(blocos)


async def abrir_com_a_pergunta_escolhida(
    corte: Corte, transcricao_do_corte: list, escolha: object, cenas: list[dict]
) -> list[dict]:
    """Aplica a escolha da IA: com pergunta, o card abre o corte e a ponte sai.

    As candidatas são refeitas aqui com as mesmas entradas do prompt — a função
    é pura e o resultado é o mesmo —, e o mesmo vale para a importação manual.
    """
    if escolha is None:
        return cenas
    candidatas = candidatas_do_corte(corte.projeto_id, corte.inicio_seg, transcricao_do_corte)
    pergunta = pergunta_do_chat.pergunta_escolhida(escolha, candidatas)
    if pergunta is None:
        logger.info("[Abertura] Escolha de pergunta inválida (%r); sigo sem o card.", escolha)
        return cenas
    avatar = await _baixar_avatar(pergunta.foto_url, corte.projeto_id, corte.id)
    cena = pergunta_do_chat.cena_da_pergunta(pergunta, avatar_url=avatar)
    return pergunta_do_chat.abrir_com_a_pergunta(cenas, cena)


async def _baixar_avatar(foto_url: str, projeto_id: str, corte_id: str) -> str:
    """Baixa a foto para a pasta do corte e devolve a URL que o render carrega.

    O render não busca URL remota: a foto fica no projeto e é servida pelo
    backend local, como o retrato da ficha. Falhou, devolve "" e o card desenha
    a inicial do nome no lugar.
    """
    if not _url_de_avatar_do_youtube(foto_url):
        return ""
    url = _TAMANHO_DO_AVATAR.sub("=s176-", foto_url, count=1)
    try:
        async with SessaoWeb(_USER_AGENT) as web:
            download = await web.baixar(url, timeout=_TIMEOUT_DO_AVATAR_S)
        tipo = download.content_type.split(";")[0].strip().lower()
        if not download.conteudo or not tipo.startswith("image/"):
            return ""
        if len(download.conteudo) > _AVATAR_MAXIMO_BYTES:
            return ""
        nome = f"pergunta_chat_avatar{_EXTENSAO_POR_TIPO.get(tipo, '.jpg')}"
        pasta = projetos_dir() / str(projeto_id) / "cortes" / str(corte_id)
        pasta.mkdir(parents=True, exist_ok=True)
        (pasta / nome).write_bytes(download.conteudo)
    except (DownloadFalhou, OSError) as exc:
        logger.info("[Abertura] Avatar do chat não baixou (%s); vai a inicial.", exc)
        return ""
    return f"{settings.backend_public_url}/videos/{projeto_id}/cortes/{corte_id}/{nome}"


def _url_de_avatar_do_youtube(url: str) -> bool:
    partes = urlsplit(url)
    host = (partes.hostname or "").lower()
    return partes.scheme == "https" and host.endswith(_HOSTS_DE_AVATAR)
