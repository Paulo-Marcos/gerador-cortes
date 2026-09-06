"""Os destinos concretos de publicação de short (D-468, D-469, D-470).

Um arquivo só porque os três compartilham o mesmo contrato e diferem em poucas
linhas cada — separá-los em módulos daria três imports para ler duas dezenas de
linhas úteis.

  - **YouTube Shorts (D-468)** — por API. É o único que já tem OAuth pronto, e o
    único cuja cota importa: `videos.insert` custa 1.600 unidades de um teto
    diário de 10.000, então dá ~6 uploads por dia.
  - **Instagram Reels e TikTok (D-469)** — pacote manual. Ambos exigem app
    review de 2 a 4 semanas, e o TikTok não-auditado só publica em modo privado.
    Enquanto isso não sai, o app entrega uma pasta pronta.
  - **TikTok horizontal (D-470)** — o mesmo pacote manual, mas alimentado pelo
    MP4 16:9 que já foi para o YouTube.
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

from app.domain.publicacao import LIMITES, ModoPublicacao, Plataforma
from app.services.publicacao_destinos import Destino, PacotePublicacao, registrar

logger = logging.getLogger(__name__)

# `videos.insert` custa 1.600 de um teto diário de 10.000 unidades.
CUSTO_QUOTA_UPLOAD = 1600
QUOTA_DIARIA = 10_000
UPLOADS_POR_DIA = QUOTA_DIARIA // CUSTO_QUOTA_UPLOAD

NOME_PACOTE = "publicar.txt"
# A capa entra na pasta com nome fixo: o operador acha sem procurar, e a
# extensao vem da imagem original porque o TikTok recusa PNG disfarcado de JPG.
NOME_CAPA = "capa"

# D-522: a capa do TikTok e 9:16, e a thumbnail do YouTube NAO serve de reserva —
# 16:9 vira uma faixa fina no quadro vertical e some na grade do perfil. Dizer o
# que fazer vale mais que dizer que falta.
SEM_CAPA = (
    "sem capa vertical — gere a capa do TikTok em Metadados, ou escolha um frame "
    "no proprio TikTok na hora do upload"
)


class DestinoYouTubeShorts(Destino):
    """Upload direto pela Data API v3 — não existe endpoint de Shorts.

    O que faz do vídeo um Short é ele ser vertical e caber em 3 minutos, não uma
    chamada diferente. `#shorts` deixou de ser necessário em 2026, mas continua
    inofensivo se o canal quiser usá-lo nas hashtags.
    """

    plataforma = Plataforma.YOUTUBE_SHORTS
    modo = ModoPublicacao.API

    async def publicar(self, pacote: PacotePublicacao) -> dict:
        from app.services.youtube import YouTubeService

        creds, erro = YouTubeService._get_credentials()
        if not creds:
            raise RuntimeError(erro or "Sem credenciais do YouTube.")

        video_id = await self._enviar(creds, pacote)
        url = f"https://youtu.be/{video_id}"
        logger.info("[Publicacao] short no YouTube: %s", url)
        return {"plataforma": self.plataforma.value, "video_id": video_id, "url": url}

    async def _enviar(self, creds, pacote: PacotePublicacao) -> str:
        import asyncio

        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        def _upload() -> str:
            youtube = build("youtube", "v3", credentials=creds)
            corpo = {
                "snippet": {
                    "title": pacote.metadados.titulo,
                    "description": pacote.metadados.descricao[:5000],
                    "tags": [t.lstrip("#") for t in pacote.metadados.hashtags],
                    "categoryId": "22",
                },
                # Sobe como `unlisted`: o operador confere o resultado no Studio
                # antes de tornar público. O mesmo cuidado do upload do corte.
                "status": {
                    "privacyStatus": "unlisted",
                    "madeForKids": False,
                    "selfDeclaredMadeForKids": False,
                },
            }
            media = MediaFileUpload(
                str(pacote.arquivo), chunksize=8 * 1024 * 1024, resumable=True, mimetype="video/mp4"
            )
            requisicao = youtube.videos().insert(
                part="snippet,status", body=corpo, media_body=media
            )
            resposta = None
            while resposta is None:
                _, resposta = requisicao.next_chunk()
            return resposta["id"]

        return await asyncio.to_thread(_upload)


class DestinoManual(Destino):
    """Pacote pronto para o operador subir do celular.

    Não é gambiarra: é o que o mercado faz quando não passa pelo app review.
    O trabalho que sobra para o humano é abrir o app e colar — e o pacote existe
    para que ele não precise ir atrás do arquivo nem reescrever o texto.
    """

    modo = ModoPublicacao.MANUAL

    def __init__(self, plataforma: Plataforma) -> None:
        self.plataforma = plataforma

    async def publicar(self, pacote: PacotePublicacao) -> dict:
        destino_dir = pacote.arquivo.parent / "publicar" / self.plataforma.value
        destino_dir.mkdir(parents=True, exist_ok=True)

        capa = copiar_capa(pacote, destino_dir)

        texto = destino_dir / NOME_PACOTE
        texto.write_text(montar_texto_do_pacote(pacote, capa), encoding="utf-8")
        (destino_dir / "metadados.json").write_text(
            json.dumps(
                {
                    "plataforma": self.plataforma.value,
                    "titulo": pacote.metadados.titulo,
                    "descricao": pacote.metadados.descricao,
                    "hashtags": pacote.metadados.hashtags,
                    "video": str(pacote.arquivo),
                    "capa": str(capa) if capa else "",
                    "avisos": pacote.avisos,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        logger.info("[Publicacao] pacote manual em %s", destino_dir)
        return {
            "plataforma": self.plataforma.value,
            "modo": self.modo.value,
            "pasta": str(destino_dir),
            "video": str(pacote.arquivo),
            # D-518: vazio quando o corte nao tem thumbnail — a tela usa isso
            # para avisar, em vez de deixar o operador subir sem capa sem saber.
            "capa": str(capa) if capa else "",
            "avisos": pacote.avisos,
            # D-503: os metadados voltam na resposta, e nao so no arquivo.
            # A macro copia a legenda para a area de transferencia; le-la do
            # `pacote.txt` exigiria que a tela abrisse um arquivo do disco.
            "titulo": pacote.metadados.titulo,
            "descricao": pacote.metadados.descricao,
            "hashtags": pacote.metadados.hashtags,
        }


def copiar_capa(pacote: PacotePublicacao, destino_dir: Path) -> Path | None:
    """Poe a capa DENTRO da pasta do pacote, e nao so o caminho dela (D-518).

    Aqui a copia se paga, ao contrario do MP4 — sao dezenas de KB, e o ganho e
    o gesto: a pasta ja abre no explorador, entao a capa fica ao lado do texto,
    a um arrastar do seletor de capa do TikTok. Apontar para a pasta de
    thumbnails obrigaria o operador a navegar ate outro canto do projeto no
    meio do upload.

    Devolve `None` quando nao ha capa, e tambem quando a copia falha: ficar sem
    capa e um contratempo, perder o pacote inteiro por causa dela nao.
    """
    if not pacote.capa or not pacote.capa.is_file():
        return None

    alvo = destino_dir / f"{NOME_CAPA}{pacote.capa.suffix.lower()}"
    try:
        shutil.copy2(pacote.capa, alvo)
    except OSError as exc:
        logger.warning("[Publicacao] nao consegui copiar a capa: %s", exc)
        return None
    return alvo


def _campos_de_texto(pacote: PacotePublicacao) -> list[str]:
    """As caixas de texto que a plataforma REALMENTE tem (D-535).

    O TikTok e o Instagram nao tem titulo: tem uma legenda so, e o "titulo" e a
    primeira linha dela. Escrever "-- TITULO --" e "-- DESCRICAO --" no pacote
    mandava o operador procurar um campo inexistente e decidir na hora como
    juntar os dois — decisao que o pacote existe para poupar.

    No YouTube Shorts os dois campos existem de verdade, e ali continuam
    separados.
    """
    limites = LIMITES[pacote.plataforma]
    visivel = f"aparecem ~{limites.titulo_visivel} caracteres antes do 'mais'"

    if not limites.caixa_unica:
        return [
            "",
            f"-- TITULO ({visivel}) --",
            pacote.metadados.titulo,
            "",
            "-- DESCRICAO --",
            pacote.metadados.descricao,
        ]

    return [
        "",
        f"-- LEGENDA (caixa unica; {visivel}) --",
        pacote.metadados.titulo,
        "",
        pacote.metadados.descricao,
    ]


def montar_texto_do_pacote(pacote: PacotePublicacao, capa: Path | None = None) -> str:
    """O `publicar.txt`: o que copiar, na ordem em que a plataforma pergunta.

    Campos separados por marcadores para o operador achar o que colar sem ler o
    arquivo inteiro. Os avisos vêm PRIMEIRO — de nada adianta descobrir que o
    vídeo passa do limite depois de já ter subido.
    """
    limites = LIMITES[pacote.plataforma]
    linhas = [f"== {limites.rotulo} =="]

    if pacote.avisos:
        linhas.append("")
        linhas.append("!! ANTES DE SUBIR:")
        linhas.extend(f"   - {aviso}" for aviso in pacote.avisos)

    linhas += _campos_de_texto(pacote)
    linhas += [
        "",
        "-- ARQUIVO --",
        str(pacote.arquivo),
        "",
        "-- CAPA --",
        # Sem capa o TikTok congela um frame qualquer do video, que costuma
        # pegar alguem de olho fechado. Dizer isso aqui e o que transforma a
        # ausencia em decisao do operador, e nao em surpresa depois do upload.
        str(capa) if capa else SEM_CAPA,
        "",
    ]
    return "\n".join(linhas)


def registrar_destinos_padrao() -> None:
    """Deixa disponíveis os destinos que existem hoje."""
    registrar(DestinoYouTubeShorts())
    registrar(DestinoManual(Plataforma.INSTAGRAM_REELS))
    registrar(DestinoManual(Plataforma.TIKTOK))
    registrar(DestinoManual(Plataforma.TIKTOK_HORIZONTAL))


registrar_destinos_padrao()


def pasta_do_pacote(arquivo: Path, plataforma: Plataforma) -> Path:
    """Onde o pacote manual daquela plataforma é escrito."""
    return arquivo.parent / "publicar" / plataforma.value
