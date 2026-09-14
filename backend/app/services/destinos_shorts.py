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
import threading
from pathlib import Path

from app.domain.agendamento import Agendamento
from app.domain.publicacao import LIMITES, ModoPublicacao, Plataforma, legenda_unica
from app.domain.ritmo_publicacao import UPLOADS_YOUTUBE_POR_DIA
from app.services.publicacao_destinos import (
    Destino,
    PacotePublicacao,
    registrar,
    registrar_do_corte,
)

logger = logging.getLogger(__name__)

# D-564: a conta da cota (1.600 de 10.000 por upload) mudou de casa. Aqui ela
# era só documentação; quem precisa dela é a FILA, que decide quantos ainda
# cabem hoje. O nome antigo fica como apelido para quem já importa daqui.
UPLOADS_POR_DIA = UPLOADS_YOUTUBE_POR_DIA

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
    agenda_sozinho = True

    def __init__(self, *, agendamento: Agendamento | None = None) -> None:
        self.agendamento = agendamento

    async def publicar(self, pacote: PacotePublicacao) -> dict:
        from app.services.youtube import YouTubeService

        creds, erro = YouTubeService._get_credentials()
        if not creds:
            raise RuntimeError(erro or "Sem credenciais do YouTube.")

        video_id = await self._enviar(creds, pacote)
        url = f"https://youtu.be/{video_id}"
        logger.info("[Publicacao] short no YouTube: %s", url)

        aviso = await self._enviar_capa(creds, video_id, pacote.capa)
        return {
            "plataforma": self.plataforma.value,
            "video_id": video_id,
            "url": url,
            "capa_aplicada": pacote.capa is not None and not aviso,
            "avisos": [aviso] if aviso else [],
        }

    async def _enviar_capa(self, creds, video_id: str, capa: Path | None) -> str:
        """Cola a capa no vídeo que acabou de subir (D-588). Devolve o aviso, ou "".

        O YouTube recebe vídeo e capa em duas chamadas, e este destino fazia só
        a primeira: a capa escolhida chegava no `pacote` e morria aqui. O upload
        do corte (`youtube.py`) sempre fez as duas.

        NUNCA levanta. Quando a capa chega, o vídeo já está no canal — derrubar o
        item por causa dela faria a fila tratar como erro um short que subiu, e
        a próxima tentativa o subiria DE NOVO.

        Onde a capa aparece não é decisão nossa: Short com capa própria entrou em
        liberação gradual em jul/2026, para canais do Programa de Parcerias. A
        chamada pode dar certo e o feed de Shorts ainda mostrar um quadro.
        """
        if capa is None:
            return ""
        if not capa.is_file():
            return "A capa nao esta mais em disco; o YouTube vai usar um quadro do video."

        import asyncio

        from app.domain.thumbnail_encode import preparar_para_youtube

        # A mesma preparação do corte: sem ela, capa acima de 2 MB é recusada, e
        # reencodar com o subsampling padrão do PIL borrava a cor (D-343).
        dados, mimetype, _ = preparar_para_youtube(capa.read_bytes())
        try:
            await asyncio.to_thread(self._subir_capa, creds, video_id, dados, mimetype)
        except Exception as exc:  # noqa: BLE001 — a capa reporta, o vídeo já subiu
            logger.warning("[Publicacao] capa do short nao entrou: %s", exc)
            return f"O short subiu, mas a capa nao entrou ({exc}). Troque no YouTube Studio."
        return ""

    @staticmethod
    def _subir_capa(creds, video_id: str, dados: bytes, mimetype: str) -> None:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaInMemoryUpload

        youtube = build("youtube", "v3", credentials=creds)
        youtube.thumbnails().set(
            videoId=video_id, media_body=MediaInMemoryUpload(dados, mimetype=mimetype)
        ).execute()

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
                # Sem data, sobe como `unlisted`: o operador confere o resultado
                # no Studio antes de tornar público. O mesmo cuidado do upload do
                # corte.
                #
                # COM data é obrigatoriamente `private`, e não é escolha nossa:
                # o YouTube ignora `publishAt` em qualquer outra privacidade. Um
                # agendamento em `unlisted` não daria erro — simplesmente nunca
                # aconteceria, que é a pior das duas falhas.
                "status": {
                    "privacyStatus": "private" if self.agendamento else "unlisted",
                    "madeForKids": False,
                    "selfDeclaredMadeForKids": False,
                    **({"publishAt": self.agendamento.em_utc_iso()} if self.agendamento else {}),
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
        legenda_unica(pacote.metadados.titulo, pacote.metadados.descricao),
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
    """Deixa disponíveis os destinos que existem hoje.

    D-584: o `TIKTOK_HORIZONTAL` NÃO entra aqui, e a ausência é a regra.

    Ele é destino do CORTE — o arquivo 16:9, que o `PublicarTiktokModal` publica
    a partir da tela do projeto. Registrá-lo no registro dos SHORTS o fazia
    aparecer no painel de publicação de todo short, onde ele nunca cabe: os
    limites dele pedem `vertical=False` e no mínimo 60s, e um short é 9:16 com
    15 a 90s. Ou seja, uma linha permanente na tela oferecendo um destino que a
    validação reprova sempre.

    O operador perguntou duas vezes o que o TikTok horizontal fazia ali. Era
    isto — e não o componente morto que a D-581 removeu por engano achando que
    respondia à pergunta.

    Fora do painel, mas não fora do app — ele vai para o registro do
    corte, que é onde a tela horizontal e o lote o procuram.
    """
    registrar(DestinoYouTubeShorts())
    registrar(DestinoManual(Plataforma.INSTAGRAM_REELS))
    registrar(DestinoManual(Plataforma.TIKTOK))
    registrar_do_corte(DestinoManual(Plataforma.TIKTOK_HORIZONTAL))


registrar_destinos_padrao()


def pasta_do_pacote(arquivo: Path, plataforma: Plataforma) -> Path:
    """Onde o pacote manual daquela plataforma é escrito."""
    return arquivo.parent / "publicar" / plataforma.value


class DestinoTikTokAssistido(DestinoManual):
    """O TikTok com o robô no volante, e o dedo do operador no botão (D-564).

    ## O terceiro modo, e por que ele não é nenhum dos dois

    O pacote manual entrega uma pasta e vai embora; a API sobe e acabou. Este
    fica no meio e é o que o TikTok permite hoje: o robô abre o Chrome do
    operador, sobe o MP4, escreve a legenda, põe a capa — e **espera**. O post
    só existe quando o humano aperta *Publicar*.

    ## Por que ele BLOQUEIA até a publicação

    Porque é isso que encadeia o lote. A raia é sequencial e este `publicar`
    só retorna quando o item saiu; então o próximo começa a subir no instante
    em que o operador terminou o anterior — sem ele voltar aqui para pedir.

    É também o que impede o erro caro: duas abas de upload abertas ao mesmo
    tempo confundem a vigília, e marcar o vídeo errado como publicado libera a
    limpeza do MP4 (D-512). Uma de cada vez não é lentidão, é a garantia.

    ## `publicar_sozinho`

    Desligado por padrão, e ligado por lote — nunca por conta própria. Com ele o
    robô também clica em *Publicar*: até esse clique tudo é reversível com um
    F5, e depois dele uma legenda errada é um post público no canal.
    """

    modo = ModoPublicacao.ASSISTIDO
    agenda_sozinho = True

    def __init__(
        self,
        plataforma: Plataforma,
        *,
        publicar_sozinho: bool = False,
        ao_ficar_pronta=None,
        segundos_de_vigilia: float | None = None,
        agendamento: Agendamento | None = None,
        parar_espera: threading.Event | None = None,
    ) -> None:
        super().__init__(plataforma)
        self.publicar_sozinho = publicar_sozinho
        self.agendamento = agendamento
        # D-591: o lote acende isto para tirar a vigília da espera — cancelando,
        # ou porque o operador já marcou "publiquei". Sem ele o `publicar`
        # ficava preso por até meia hora, e a raia inteira junto.
        self.parar_espera = parar_espera
        # Chamado quando a aba está pronta e a bola passa para o operador. É o
        # que faz a tela dizer "sua vez" DURANTE a espera, em vez de fingir que
        # ainda está trabalhando por meia hora.
        self.ao_ficar_pronta = ao_ficar_pronta
        self.segundos_de_vigilia = segundos_de_vigilia

    async def publicar(self, pacote: PacotePublicacao) -> dict:
        from uuid import uuid4

        from app.domain.tiktok_studio import marca_da_aba
        from app.services import tiktok_studio

        pronto = await super().publicar(pacote)

        # A marca é por ITEM, e não por lote: é ela que diz qual das abas
        # abertas é esta, e duas abas do mesmo lote precisam de nomes diferentes.
        marca = marca_da_aba(uuid4().hex[:12])
        capa = pronto.get("capa") or ""

        relatorio = await tiktok_studio.subir_assistido(
            video=Path(pronto["video"]),
            legenda=legenda_unica(pronto.get("titulo", ""), pronto.get("descricao", "")),
            capa=Path(capa) if capa else None,
            marca=marca,
            publicar_sozinho=self.publicar_sozinho,
            agendamento=self.agendamento,
        )

        if relatorio.get("publicado"):
            return {**pronto, **relatorio, "modo": self.modo.value}

        if self.ao_ficar_pronta is not None:
            await self.ao_ficar_pronta(relatorio.get("avisos", []))

        espera = {"segundos": self.segundos_de_vigilia} if self.segundos_de_vigilia else {}
        publicado = await tiktok_studio.aguardar_publicacao(
            marca=marca, parar=self.parar_espera, **espera
        )

        return {**pronto, **relatorio, "modo": self.modo.value, "publicado": publicado}


class DestinoInstagramReelsAssistido(DestinoManual):
    """O Reels com o robô no volante, e o dedo do operador no Compartilhar (D-564).

    Mesmo contrato do TikTok assistido, e as diferenças estão todas debaixo:

      - o compositor é um MODAL, então não há navegação para provar que saiu.
        A vigília espera o modal fechar e procura o aviso de sucesso, porque
        fechar sozinho também é o que acontece quando alguém descarta;
      - a capa entra na etapa "Editar" do compositor (D-589), e como no TikTok
        é o único passo que reporta em vez de interromper.

    A API oficial publicaria isto sem navegador nenhum — mas cobra conta
    Business ligada a uma Página, app review, e o MP4 servido por uma URL
    pública. O app roda na máquina do operador, com os vídeos em disco.
    """

    modo = ModoPublicacao.ASSISTIDO

    # D-580: `False`, e agora por um motivo MEDIDO e nao suposto. Em 12/09/2026,
    # no Chrome do robo ja logado, o compositor de Reels do instagram.com foi
    # varrido controle a controle: marcar pessoas, legenda, localizacao,
    # colaboradores, acessibilidade e configuracoes avancadas — e dentro das
    # avancadas so ocultar curtidas e desativar comentarios. Nao existe
    # agendamento naquela tela, e nao e falta de conta profissional.
    #
    # Agendar Reels mora no Meta Business Suite: outro dominio, outro login,
    # exige Pagina do Facebook. Superficie nova inteira, e nao uma emenda aqui.
    agenda_sozinho = False

    def __init__(
        self,
        plataforma: Plataforma = Plataforma.INSTAGRAM_REELS,
        *,
        publicar_sozinho: bool = False,
        ao_ficar_pronta=None,
        segundos_de_vigilia: float | None = None,
        agendamento: Agendamento | None = None,
        parar_espera: threading.Event | None = None,
    ) -> None:
        super().__init__(plataforma)
        self.publicar_sozinho = publicar_sozinho
        self.ao_ficar_pronta = ao_ficar_pronta
        self.segundos_de_vigilia = segundos_de_vigilia
        self.agendamento = agendamento
        # D-591: o mesmo sinal do TikTok assistido.
        self.parar_espera = parar_espera

    async def publicar(self, pacote: PacotePublicacao) -> dict:
        from uuid import uuid4

        from app.domain.tiktok_studio import marca_da_aba
        from app.services import instagram_reels

        pronto = await super().publicar(pacote)
        marca = marca_da_aba(uuid4().hex[:12])
        capa = pronto.get("capa") or ""

        relatorio = await instagram_reels.subir_assistido(
            video=Path(pronto["video"]),
            legenda=legenda_unica(pronto.get("titulo", ""), pronto.get("descricao", "")),
            capa=Path(capa) if capa else None,
            marca=marca,
            publicar_sozinho=self.publicar_sozinho,
        )

        if self.agendamento:
            # Dito em voz alta, e no relatorio que a tela mostra: engolir a data
            # aqui seria o mesmo erro do video que sobe `unlisted` e some.
            relatorio = {
                **relatorio,
                "avisos": [
                    *relatorio.get("avisos", []),
                    f"Este Reel NAO fica agendado para {self.agendamento.legivel()}: o "
                    "compositor do instagram.com nao tem agendamento (so o Meta "
                    "Business Suite tem). Compartilhe na hora que quiser publicar.",
                ],
            }

        if relatorio.get("publicado"):
            return {**pronto, **relatorio, "modo": self.modo.value}

        if self.ao_ficar_pronta is not None:
            await self.ao_ficar_pronta(relatorio.get("avisos", []))

        espera = {"segundos": self.segundos_de_vigilia} if self.segundos_de_vigilia else {}
        publicado = await instagram_reels.aguardar_publicacao(
            marca=marca, parar=self.parar_espera, **espera
        )

        return {**pronto, **relatorio, "modo": self.modo.value, "publicado": publicado}
