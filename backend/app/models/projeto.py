"""Projeto, corte e metadado do corte."""

from datetime import datetime
from typing import TYPE_CHECKING

from app.models.base import Base, StatusCorte, StatusProjeto
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.shorts import Short
    from app.models.snapshots import CorteSnapshot


class Projeto(Base):
    __tablename__ = "projetos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # D-650: buscado por URL ao evitar baixar a mesma live duas vezes.
    youtube_url: Mapped[str] = mapped_column(String(500), index=True)
    titulo_live: Mapped[str] = mapped_column(String(500), default="")
    # D-666: era um default que lia o canal ativo (settings.db + disco) a cada
    # INSERT, de dentro do models.py. As três rotas que criam projeto já passam
    # o valor; o default nunca era usado em produção.
    canal_origem: Mapped[str] = mapped_column(String(200), default="")
    duracao_segundos: Mapped[int] = mapped_column(Integer, default=0)
    data_live: Mapped[str] = mapped_column(String(20), default="")
    arquivo_video_path: Mapped[str] = mapped_column(String(1000), default="")
    transcricao_raw: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(50), default=StatusProjeto.PENDENTE)
    progresso_download: Mapped[float] = mapped_column(Float, default=0.0)
    erro_msg: Mapped[str] = mapped_column(Text, default="")
    # I-023: filtro_padrao por projeto foi removido. Fonte única =
    # AppSettings.filtro_global_padrao (Ajustes). A coluna SQLite legada
    # (`filtro_padrao TEXT`) é ignorada pelo ORM mas tolerada no banco
    # antigo — sem necessidade de migração imediata.
    arquivos_limpos: Mapped[bool] = mapped_column(
        Integer, default=0
    )  # 0=não, 1=sim (SQLite usa Integer p/ bool)
    # D-527: o rebaixe da live limpa esta em curso.
    #
    # Campo proprio, e NAO o status BAIXANDO, de proposito: `reiniciar-download`
    # aceita projetos naquele status e apaga transcricao, titulo e duracao —
    # feito para download que falhou, nao para live ja analisada. Reusar o
    # status poria um botao destrutivo a um clique do projeto pronto.
    # Integer como o vizinho acima: SQLite guarda bool assim neste schema.
    rebaixando_video: Mapped[bool] = mapped_column(Integer, default=0)
    legenda_offset_ms: Mapped[int] = mapped_column(Integer, default=0)
    ultima_analise_em: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    # I-034: audit trail da última análise — array JSON dos blocos que a IA
    # classificou como NÃO_RECOMENDADO e descartou (cada item: tema, motivo).
    # Permite ao operador auditar o filtro editorial sem reabrir o prompt.
    descartados_analise: Mapped[str] = mapped_column(Text, default="[]")
    # D-286: mapa de falantes da diarização — {"SPEAKER_00": {"nome": "", "is_canal": true}, ...}.
    # `speaker` por segmento mora na transcricao_raw; o nome/rótulo (editável pelo
    # operador) mora aqui, para relabelar sem reprocessar a transcrição.
    falantes_map: Mapped[str] = mapped_column(Text, default="{}")
    # Renderer das cenas do Remotion: "v1" (atual/estável) ou "v2" (nova identidade).
    # Default v2: nova identidade editorial das cenas Remotion.
    versao_renderer: Mapped[str] = mapped_column(String(10), default="v2")
    # Nível padrão de sombra/overlay aplicado às cenas v2 deste projeto quando
    # a cena estiver com sombra_nivel="auto". Valores: nenhuma/leve/media/forte.
    sombra_nivel_padrao: Mapped[str] = mapped_column(String(20), default="nenhuma")
    layout_card_padrao: Mapped[str] = mapped_column(String(20), default="vertical")
    layout_youtube_padrao: Mapped[str] = mapped_column(Text, default="{}")
    # Preset tipografico dos cards/cenas Remotion v2.
    fonte_preset: Mapped[str] = mapped_column(String(30), default="atual")
    # F-052: pontuação herdada da tela de Ranking de Lives no momento do download.
    # 0.0 quando o projeto não veio do ranking (fluxo legado do YoutubeBrowser).
    pontuacao_ranking: Mapped[float] = mapped_column(Float, default=0.0)
    # D-372: voto manual (1-5) da qualidade da live. Sem uso desde a D-999 (0 de
    # 202 lives votadas): a coluna fica pelo histórico, sem migration.
    voto_qualidade_live: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    cortes: Mapped[list["Corte"]] = relationship(
        "Corte", back_populates="projeto", cascade="all, delete-orphan"
    )


class Corte(Base):
    __tablename__ = "cortes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # D-650: "os cortes deste projeto" é a consulta mais quente do app.
    projeto_id: Mapped[str] = mapped_column(String(36), ForeignKey("projetos.id"), index=True)
    numero: Mapped[int] = mapped_column(Integer)
    # D-448: posição na lista quando o editor a fixou NA MÃO (1-based). NULL — o
    # caso normal — significa "siga o tempo": `numero` é derivado de `inicio_seg`
    # a cada operação que cria ou move corte. Antes o `numero` era carimbado na
    # criação, então corte nascido depois (do desvio, da 2ª passada da análise)
    # ia para o fim mesmo começando no meio da live. Ordem canônica em
    # `domain/corte/ordem_cortes.py`.
    posicao_fixada: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    titulo_proposto: Mapped[str] = mapped_column(String(500), default="")
    resumo: Mapped[str] = mapped_column(Text, default="")
    tema_central: Mapped[str] = mapped_column(String(500), default="")
    # I-034: justificativa editorial da IA — 1-3 frases explicando POR QUE
    # este intervalo virou corte (em vez de virar desvio ou ser descartado),
    # incluindo defesa da duração escolhida. Usada para auditoria.
    justificativa: Mapped[str] = mapped_column(Text, default="")
    inicio_hms: Mapped[str] = mapped_column(String(20), default="00:00:00")
    fim_hms: Mapped[str] = mapped_column(String(20), default="00:00:00")
    inicio_seg: Mapped[float] = mapped_column(Float, default=0.0)
    fim_seg: Mapped[float] = mapped_column(Float, default=0.0)
    desvios: Mapped[str] = mapped_column(Text, default="[]")
    # D-998: trechos que FICAM no corte e a IA pede para conferir o fato. Não é
    # desvio: nada que calcula o corte lê esta coluna (domain/corte/alerta_conferir).
    alertas_conferir: Mapped[str] = mapped_column(Text, default="[]")
    # D-302: campos da proposta v2 da análise. `frase_gancho_*` é o ponto de
    # entrada mais forte do argumento (borda inicial editorial); `contextualizacao`
    # é a frase curta que situa o assunto (alimenta a 1ª cena, D-295; vazia =
    # sem contextualização); `score_json` é o ranking relativo {hook, flow,
    # value, total} entre os cortes da mesma análise. Vazios em análises de
    # skills anteriores à v2 (back-compat).
    frase_gancho_hms: Mapped[str] = mapped_column(String(20), default="")
    frase_gancho_texto: Mapped[str] = mapped_column(Text, default="")
    contextualizacao: Mapped[str] = mapped_column(Text, default="")
    score_json: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(50), default=StatusCorte.PROPOSTO)
    arquivo_clip_path: Mapped[str] = mapped_column(String(1000), default="")
    # Duração real (s) do `arquivo_clip_path`, pelo ffprobe a cada bruto: a tela a
    # usa no lugar da soma dos segmentos, que acumula drift. 0.0 = sem clip.
    duracao_clip_seg: Mapped[float] = mapped_column(Float, default=0.0)
    # F-063: deslocamento fino do áudio em relação ao vídeo (lip-sync), em
    # milissegundos. Positivo atrasa o áudio; negativo adianta. Aplicado na
    # geração do bruto e propaga para grade/overlay/render final. 0 = sem ajuste.
    audio_offset_ms: Mapped[int] = mapped_column(Integer, default=0)
    youtube_video_id: Mapped[str] = mapped_column(String(50), default="")
    youtube_url_publicado: Mapped[str] = mapped_column(String(200), default="")
    youtube_scheduled_at: Mapped[str] = mapped_column(String(30), default="")
    # D-512: quando o operador confirmou que subiu ESTE corte para o TikTok.
    # O TikTok e publicacao MANUAL (a API so posta em modo privado sem
    # auditoria), entao ninguem alem dele sabe que aconteceu. A marca existe
    # porque a limpeza automatica do `upload_ready/video.mp4` passou a depender
    # de TODOS os destinos: antes ela apagava o arquivo no fim do upload do
    # YouTube, e o TikTok — que usa o MESMO MP4 — ficava sem material.
    #
    # NULL nao e "nao publicou": e "nao se sabe". A retencao trata os dois
    # igual, preservando o arquivo, porque disco a mais e incomodo e arquivo a
    # menos e re-render.
    tiktok_publicado_em: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    # D-593: quando o operador declarou que os shorts deste corte ja subiram
    # para todas as redes (YouTube, TikTok, Instagram) e o corte saiu da fila.
    #
    # E uma DECLARACAO, e nao algo deduzido de `PublicacaoShort`: parte das
    # publicacoes acontece fora do app (o upload manual no celular, o Reels
    # postado a mao), e so o operador sabe que nada mais falta. Carimbo de data
    # e nao booleano pelo mesmo motivo do `tiktok_publicado_em`: "quando fechei"
    # e o que se pergunta depois.
    shorts_finalizados_em: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    # D-713: as duas marcas editoriais do corte moram NELE. Viviam no metadado
    # (texto e capa de publicacao), mas governam a limpeza (RN-15) e a fabrica de
    # shorts — sao julgamentos sobre o corte, nao sobre o texto dele. As colunas
    # antigas de `metadados_cortes` ficam no banco, sem uso; a migration 007
    # copiou os valores.
    is_fire: Mapped[bool] = mapped_column(Integer, default=0)
    # D-502: o corte foi indicado para a fabrica de shorts A MAO.
    #
    # Separado do Fire de proposito. Fire e um julgamento editorial sobre o CORTE
    # ("isso e bom"); indicar para shorts e uma aposta sobre um TRECHO dele
    # ("tem um pedaco que renderia"). Um corte mediano pode ter um momento
    # otimo, e amarrar as duas marcas obrigaria a mentir sobre o corte inteiro
    # para chegar no trecho.
    candidato_shorts: Mapped[bool] = mapped_column(Integer, default=0)
    is_leitura: Mapped[int] = mapped_column(Integer, default=0)
    autor_leitura: Mapped[str] = mapped_column(String(200), default="")
    parte_leitura: Mapped[int] = mapped_column(Integer, default=1)
    transcricao_corte: Mapped[str] = mapped_column(Text, default="[]")
    transcricao_final: Mapped[str] = mapped_column(Text, default="[]")
    transcricao_final_texto: Mapped[str] = mapped_column(Text, default="")
    cenas_remotion: Mapped[str] = mapped_column(Text, default="[]")
    layout_youtube: Mapped[str] = mapped_column(
        Text,
        default='{"regioes":[]}',  # D-966: sem modo_padrao, herda o do projeto (RN-10)
    )
    # E-036/D-487: o preset cujos crops alimentam o PALCO VERTICAL do short.
    # Coluna propria, e nao um campo dentro de `layout_youtube`: aquele bloco e
    # do pipeline horizontal (e do i-035, travado), e escrever nele para servir
    # os shorts arriscaria o render que ja funciona. Vazio = deduzir do proprio
    # layout do corte, ou nada.
    palco_short_preset: Mapped[str] = mapped_column(String(200), default="")
    # D-570: o PALCO padrao deste corte — o preset que os shorts herdam.
    #
    # NAO confundir com o `palco_short_preset` logo acima, que apesar do nome
    # guarda o preset de RECORTES (de onde saem as janelas). Os dois nomes
    # colidem desde a E-036; a D-571 vai desfazer isso, e ate la este comentario
    # e o unico aviso. Foi exatamente essa colisao que fez a tela mostrar
    # "RECORTES" onde o operador esperava "PALCO".
    #
    # HERANCA VIVA, e nao copia: o short que nao decidiu um campo le o do corte,
    # e trocar o padrao reflete na hora em todos que ninguem customizou. E a
    # mesma regra do resto da cascata de layout — chave ausente e heranca, e
    # materializar o default ao GRAVAR congelaria o palco do dia em que foi
    # escolhido.
    palco_padrao: Mapped[str] = mapped_column(String(200), default="")
    # D-594: o preset de GANCHO que vale para todos os shorts do corte — cor,
    # realce, fonte, tamanho e duracao. Mesma heranca viva do `palco_padrao`:
    # id vazio = cada trecho decide, e nada e copiado para os shorts.
    gancho_padrao: Mapped[str] = mapped_column(String(200), default="")
    # F-054: lista JSON de segmentos detectados via PySceneDetect no bruto do
    # corte. Cada item: {inicio, fim, score, status}. Status: sugerido /
    # aceito_full / aceito_compartilhada / rejeitado. Aceitar materializa uma
    # região correspondente em `layout_youtube.regioes`; o segmento continua
    # aqui para auditoria do que a IA propôs.
    segmentos_detectados: Mapped[str] = mapped_column(Text, default="[]")
    # D-576: a ORDEM em que o material deste corte toca. Lista JSON de blocos
    # `{inicio_seg, fim_seg}` em tempo de LIVE, na ordem de exibição — a EDL do
    # corte. Regra e vocabulário em `domain/corte/arranjo_blocos.py`.
    #
    # NÃO confundir com `desvios`, que a UI chama de "trechos": desvio decide o
    # que SAI, arranjo decide em que ORDEM entra o que ficou. São decisões
    # independentes e se compõem (cada bloco é subtraído dos seus desvios).
    #
    # Vazio é o caso normal e significa "ordem cronológica" — ausência como
    # herança, igual à cascata de layout. Corte que nunca foi reordenado não
    # carrega arranjo, e o pipeline roda o caminho de antes do D-576.
    arranjo_blocos: Mapped[str] = mapped_column(Text, default="[]")
    # Marca explicita do operador de que as cenas do roteiro visual ja foram revisadas
    # e estao prontas. Usada como pill na pagina de cortes (entre Graded e Final).
    cenas_validadas: Mapped[int] = mapped_column(Integer, default=0)
    cenas_validadas_em: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    is_pos_producao: Mapped[int] = mapped_column(Integer, default=0)
    # F-058: influência manual do editor sobre a thumbnail. Texto livre
    # (pessoas a destacar, relações, ênfases de tema). Quando preenchido, é
    # anexado ao prompt da skill `thumbnail-prompt-expert` como direção
    # prioritária, somando-se ao raciocínio do capista. Vazio = comportamento
    # idêntico ao atual.
    hints_thumbnail: Mapped[str] = mapped_column(Text, default="")
    # D-334: quantas vezes a skill trechos-expert rodou neste corte (D-332
    # tornou `gerar_trechos_via_claude` aditivo — o total de desvios origem=
    # 'claude' deixou de indicar quantos cliques geraram os desvios). Log é
    # JSON lista de {"em", "adicionados", "total_apos"}, um item por invocação.
    trechos_geracoes: Mapped[int] = mapped_column(Integer, default=0)
    trechos_geracoes_log: Mapped[str] = mapped_column(Text, default="[]")
    # D-419: voto humano (1-5) da qualidade do corte, com motivos e comentário.
    # Sem uso desde a D-999, que o trocou pelo "o que você mudou" derivado do
    # diff proposta × final (`domain/corte/mudancas_do_corte.py`). As colunas
    # ficam pelo histórico, sem migration (como as marcas antigas na D-713).
    voto_qualidade: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    voto_qualidade_motivos: Mapped[str] = mapped_column(Text, default="[]")
    voto_qualidade_comentario: Mapped[str] = mapped_column(Text, default="")
    voto_qualidade_em: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    projeto: Mapped["Projeto"] = relationship("Projeto", back_populates="cortes")
    metadado: Mapped["MetadadoCorte"] = relationship(
        "MetadadoCorte",
        back_populates="corte",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    # D-988: a proposta congelada (D-303) diz qual IA propôs o corte; só leitura.
    snapshot: Mapped["CorteSnapshot | None"] = relationship(
        primaryjoin="foreign(CorteSnapshot.corte_id) == Corte.id", viewonly=True, lazy="selectin"
    )
    # E-030: shorts extraidos deste corte. `lazy` default (nao selectin) de
    # proposito — a esteira de cortes nao carrega shorts sem pedir.
    shorts: Mapped[list["Short"]] = relationship(
        "Short", back_populates="corte", cascade="all, delete-orphan"
    )


class MetadadoCorte(Base):
    __tablename__ = "metadados_cortes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    corte_id: Mapped[str] = mapped_column(String(36), ForeignKey("cortes.id"), unique=True)
    titulo_youtube: Mapped[str] = mapped_column(String(100), default="")
    descricao_youtube: Mapped[str] = mapped_column(Text, default="")
    tags_youtube: Mapped[str] = mapped_column(Text, default="[]")
    opcoes_titulo: Mapped[str] = mapped_column(Text, default="[]")
    opcoes_texto_capa: Mapped[str] = mapped_column(Text, default="[]")
    texto_capa: Mapped[str] = mapped_column(String(100), default="")
    link_live_com_timestamp: Mapped[str] = mapped_column(String(500), default="")
    # D-666: quem cria o metadado preenche (ver toggle_fire e
    # indicar_para_shorts) — o model não consulta mais o canal ativo.
    canal_credito: Mapped[str] = mapped_column(String(200), default="")
    prompt_thumbnail: Mapped[str] = mapped_column(Text, default="")
    thumbnail_path: Mapped[str] = mapped_column(String(1000), default="")
    # D-519: a capa VERTICAL, do TikTok. Coluna propria e nao reuso da de cima
    # porque as duas imagens tem formatos e trabalhos diferentes: a do YouTube e
    # 16:9 e disputa um clique numa lista; esta e 9:16 (o TikTok mostra o video
    # deitado com tarjas, mas a capa ocupa o quadro inteiro) e serve a vitrine
    # do perfil, onde nove capas sao vistas juntas. Guardar uma so faria a
    # errada aparecer em algum dos dois lugares.
    thumbnail_tiktok_path: Mapped[str] = mapped_column(String(1000), default="")
    # D-520: as 2-3 palavras da capa vertical. Guardadas porque formam o
    # vocabulario do canal: a skill le as etiquetas recentes para REPETIR o nome
    # do assunto entre cortes, que e o que da coerencia a grade do perfil.
    etiqueta_tiktok: Mapped[str] = mapped_column(String(80), default="")
    # D-524: o prompt da ARTE da capa vertical. O app nao desenha: escreve o
    # prompt, o operador gera no agente capista dele e sobe a imagem de volta —
    # o mesmo fluxo manual que a D-413 consolidou no horizontal.
    prompt_capa_tiktok: Mapped[str] = mapped_column(Text, default="")
    # D-713: `is_fire` e `candidato_shorts` foram para o Corte.
    numero_serie: Mapped[int] = mapped_column(Integer, default=1)
    cor_serie: Mapped[str] = mapped_column(String(100), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    corte: Mapped["Corte"] = relationship("Corte", back_populates="metadado")
