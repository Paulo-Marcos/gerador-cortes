"""Short, metadado e publicação do short."""

from datetime import datetime

from app.models.base import Base, StatusShort
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Short(Base):
    """Trecho vertical extraido de um corte Fire (E-030, D-452).

    Reativa as tabelas que a D-345 deixou ORFAS (sem DROP) ao remover a feature
    morta — os registros de PROD continuam la e voltam a ter modelo.

    INVARIANTE: `inicio_seg`/`fim_seg` estao no espaco de tempo do BRUTO (o clip
    ja sem os desvios removidos), NAO no da live. E do bruto que o short e
    recortado; usar os tempos da live dessincroniza todo candidato.
    """

    __tablename__ = "shorts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # D-650: "os shorts deste corte", em toda abertura da fábrica.
    corte_id: Mapped[str] = mapped_column(String(36), ForeignKey("cortes.id"), index=True)
    numero: Mapped[int] = mapped_column(Integer)
    titulo_sugerido: Mapped[str] = mapped_column(String(500), default="")
    inicio_seg: Mapped[float] = mapped_column(Float, default=0.0)
    fim_seg: Mapped[float] = mapped_column(Float, default=0.0)
    # D-604: as FATIAS do bruto que este short toca, na ORDEM EM QUE TOCAM, em
    # JSON: `[{"inicio_seg": 0, "fim_seg": 30}, {"inicio_seg": 45, "fim_seg": 60}]`.
    #
    # `[]` e o caso normal e significa "a janela unica acima" — ausencia como
    # heranca, a mesma regra do resto do layout. Short gravado antes desta
    # demanda tem `[]` e se comporta exatamente como antes.
    #
    # Coluna JSON, e nao tabela, pela razao que `desvios` (logo abaixo) e
    # `arranjo` do corte ja provaram: e uma lista de janelas de tempo que so faz
    # sentido junto do dono, nunca e consultada por si, e cabe inteira numa
    # leitura do short — uma tabela cobraria um JOIN por candidato na tela que
    # lista oito deles.
    #
    # Quando ha segmentos, `inicio_seg`/`fim_seg` passam a ser o ENVELOPE (o
    # menor inicio e o maior fim). Nao sao redundancia: e por eles que a regua
    # sabe onde desenhar o short no bruto e que a deteccao de rosto escolhe a
    # janela. O que eles deixam de responder e "quanto tempo dura" —
    # `fim - inicio` MENTE com buraco no meio, e a resposta passou a morar em
    # `domain/segmentos_short.duracao_liquida`.
    #
    # A ORDEM da lista e livre (decisao do operador): ele pode abrir com o
    # gancho mais forte mesmo que ele venha depois na live. Nada ordena esta
    # lista, e ordenar seria desfazer a decisao dele em silencio.
    segmentos: Mapped[str] = mapped_column(Text, default="[]")
    # E-030: o que a IA usa para o operador escolher entre bons candidatos.
    # `gancho` e a frase que precisa segurar os 3 primeiros segundos; `score`
    # ordena a lista; `justificativa` explica a nota (colunas novas sobre as
    # tabelas antigas — a reconciliacao da D-403 as adiciona sozinha no boot).
    gancho: Mapped[str] = mapped_column(String(500), default="")
    score: Mapped[float] = mapped_column(Float, default=0.0)
    justificativa: Mapped[str] = mapped_column(Text, default="")
    # D-464: onde o recorte 9:16 se centra na horizontal (0.0 a 1.0). NULL = deriva
    # do layout do corte (a facecam), que e o default certo na maioria das lives;
    # valor gravado = o operador discordou depois de ver o enquadramento.
    foco_x: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    cenas_remotion: Mapped[str] = mapped_column(Text, default="[]")
    # D-565: o titulo-gancho que aparece na ABERTURA do short. Vazio = sem
    # gancho, que e o comportamento de antes desta demanda.
    #
    # Coluna NOVA, e nao reuso do `gancho` acima, por um motivo concreto: aquele
    # ja e a DESCRICAO do post publicado (`publicacao_destinos.montar_contexto_
    # do_short`). Reaproveita-lo reescreveria em silencio a descricao de todo
    # short ja curado — e o operador so descobriria depois de publicado.
    #
    # Os dois textos tambem sao de generos diferentes: o `gancho` da IA e uma
    # frase de curadoria ("qual e a graca deste trecho"), e este e o cartao de
    # 4 a 7 palavras que segura o dedo no feed. O primeiro alimenta o gerador do
    # segundo; nao sao a mesma frase.
    #
    # E NAO e uma cena (`cenas_remotion`, hoje desligada em `CENAS_LIGADAS`):
    # cena era texto em qualquer momento, N vezes; o gancho e um so, ancorado no
    # zero. Campos separados para que religar um nunca mexa no outro.
    gancho_tela: Mapped[str] = mapped_column(String(200), default="")
    # Quanto tempo o gancho fica em tela. 0 = o padrao de `domain/gancho_short`.
    gancho_ate_seg: Mapped[float] = mapped_column(Float, default=0.0)
    # D-581: a cor do gancho, em hex. Vazio = branco, que e como ele sempre saiu.
    #
    # O relato que originou isto: "ele aparece branco e igual a legenda e da
    # conflito". Sao dois textos brancos no mesmo quadro ao mesmo tempo, e o
    # unico jeito de o olho separar promessa de fala e um deles mudar.
    #
    # Hex e nao chave de paleta, pela razao da D-563: quem desenha o gancho sao
    # a previa e o Remotion, e uma chave obrigaria os dois a manterem a mesma
    # tabela de cores — que e exatamente o que diverge com o tempo.
    gancho_cor: Mapped[str] = mapped_column(String(20), default="")
    # D-581: como o gancho se separa do fundo — veu, caixa, contorno, sombra ou
    # nenhum. Vazio cai no `REALCE_PADRAO` (veu), que e o de antes desta coluna.
    gancho_realce: Mapped[str] = mapped_column(String(20), default="")
    # D-600: ONDE o gancho senta neste trecho, em % do quadro. 0 = "nao decidi",
    # e ai vale o lugar do preset de gancho do corte — e, na falta dele, o ponto
    # fixo que o renderer usava antes desta demanda (topo da safe zone,
    # centralizado, 86% de largura).
    #
    # Por que o lugar e por trecho, se fonte e tamanho nao sao: o corpo e a
    # fonte sao identidade do canal, iguais nos oito shorts de um corte; o LUGAR
    # depende do que esta no quadro, e o quadro muda a cada trecho. Um palco com
    # a pessoa a esquerda e outro com ela centralizada pedem ganchos em pontos
    # diferentes do mesmo corte.
    gancho_x: Mapped[float] = mapped_column(Float, default=0.0)
    gancho_y: Mapped[float] = mapped_column(Float, default=0.0)
    gancho_largura: Mapped[float] = mapped_column(Float, default=0.0)
    # D-573: as ultimas variacoes que a IA propos, em JSON.
    #
    # A D-565 decidiu NAO gravar o resultado do gerador, e a razao era boa:
    # gravar ESCOLHERIA pelo operador, e o gancho e a decisao mais editorial
    # desta tela. Mas a razao era sobre ESCOLHER, nao sobre LEMBRAR.
    #
    # Medido no log do canal: uma chamada real levou 231 segundos. Guardadas so
    # no estado do modal, essas variacoes morriam se ele fechasse a janela,
    # trocasse de trecho ou recarregasse — quase quatro minutos de espera
    # jogados fora, sem aviso. Agora elas sobrevivem; escolher continua sendo
    # dele, por PATCH, como sempre foi.
    gancho_sugestoes: Mapped[str] = mapped_column(Text, default="[]")
    desvios: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(50), default=StatusShort.SUGERIDO)
    # D-484: quem propos este trecho — "ia" ou "manual".
    #
    # NAO e informativo: e o que mantem o short manual VIVO. `registrar_sugestoes`
    # apaga todos os candidatos ainda SUGERIDOS ao regerar, porque refazer o
    # palpite da maquina e descartar o palpite anterior. Sem esta coluna, um
    # trecho marcado a mao pelo operador seria varrido junto — e em silencio, na
    # proxima vez que alguem clicasse em gerar shorts.
    origem: Mapped[str] = mapped_column(String(20), default="ia")
    arquivo_short_path: Mapped[str] = mapped_column(String(1000), default="")
    # D-483: o MP4 de PREVIA — vertical com legenda e cenas, sem o filtro. Serve
    # para julgar antes de gastar a passada boa, e e descartavel: finalizar
    # reprocessa do zero, nao incrementa este arquivo.
    #
    # Coluna separada, e nao um novo valor de StatusShort, de proposito: o enum
    # e contrato (vale para a API e para os 13 registros que ja existem em
    # PROD), e o estagio se deduz sem ele — tem previa, tem final, ou nenhum.
    arquivo_previa_path: Mapped[str] = mapped_column(String(1000), default="")
    # E-036/D-487: o arranjo do palco deste candidato. Vazio = automatico, que
    # deduz das regioes disponiveis. Por SHORT e nao por corte porque o estilo
    # muda dentro do mesmo corte: um trecho mostra a tela, o seguinte e so fala.
    # D-498: o preset DESTE short, quando ele discorda do corte. Numa live longa
    # a cena do OBS muda — minuto 3 e rosto cheio, minuto 11 e tela
    # compartilhada — e as regioes mudam junto. Vazio = herda do corte, que
    # segue sendo o default para a maioria dos trechos.
    palco_preset: Mapped[str] = mapped_column(String(200), default="")
    # D-501/D-508: a assinatura do canal em volta — "palco" (fundo com textura,
    # chrome e molduras, em PNG do Remotion) ou "nenhuma". Ortogonal ao arranjo:
    # vale para qualquer montagem, e amarra-la a uma exigiria duplicar cada
    # arranjo em duas versoes.
    moldura: Mapped[str] = mapped_column(String(20), default="palco")
    # D-507: como a tela e montada — "cheia", "dividida_empilhada" ou
    # "dividida_insert". Vazio deduz das regioes marcadas.
    #
    # Substitui o `modelo_palco`, que oferecia quatro opcoes onde havia duas
    # decisoes: os quatro modelos misturavam "quantas janelas" com "qual regiao
    # alimenta cada uma", e por isso pareciam repetir o recorte.
    arranjo_palco: Mapped[str] = mapped_column(String(40), default="")
    # D-507: em modo CHEIA, qual regiao preenche a janela unica. E aqui que o
    # enquadramento deixa de ser botao a parte: com uma janela so, o recorte
    # dela E o enquadramento.
    janela_cheia: Mapped[str] = mapped_column(String(20), default="")
    # D-493: os slots que o operador MOVEU, como sobreposicao PARCIAL sobre o
    # modelo — `{"pessoa": {"x":..,"y":..,"w":..,"h":..}}`. Chave ausente herda
    # do modelo; materializar os defaults ao gravar apagaria a heranca, e trocar
    # de modelo depois nao moveria mais nada (mesma regra do layout horizontal).
    ajustes_palco: Mapped[str] = mapped_column(Text, default="{}")
    # D-499: o RECORTE deste short sobre o quadro-fonte — o que sai da live, em
    # pixels do bruto. `{"pessoa": {"x":..,"y":..,"w":..,"h":..}}`, sobreposicao
    # PARCIAL sobre as regioes do preset, mesma regra de heranca do
    # `ajustes_palco`.
    #
    # Ate aqui o crop vinha pronto do preset do canal e so o SLOT era editavel:
    # dava para dizer onde o bloco cai, nao o que ele mostra. Numa live em que a
    # facecam muda de lugar no meio, o preset do corte fica errado para UM
    # trecho — e nao havia como consertar so aquele.
    recortes_palco: Mapped[str] = mapped_column(Text, default="{}")
    # D-499: a CHAVE da paleta do canal usada como fundo (ex.: "fundoPalco").
    # Vazio = o default do canal. Guardamos a chave e nao a cor: gravar o hex
    # congelaria a paleta do dia, e trocar o tema do canal deixaria os shorts
    # antigos com a cor velha.
    fundo_palco: Mapped[str] = mapped_column(String(60), default="")
    # D-552: a TEXTURA do palco deste short — um id de `YOUTUBE_BACKGROUND`,
    # nao uma cor.
    #
    # Coluna propria, e nao reaproveitar `fundo_palco`: aquela guarda uma CHAVE
    # DA PALETA e alimenta a cor de base do ffmpeg. Trocar o significado dela
    # faria os shorts ja gravados apontarem para uma textura inexistente, e o
    # sintoma seria o palco cair no default sem ninguem entender por que.
    #
    # Vazio = a textura padrao do canal.
    fundo_editorial: Mapped[str] = mapped_column(String(60), default="")
    # D-552: qual preset de PALCO foi aplicado neste short.
    #
    # Aplicar um preset COPIA valores (arranjo, janela, recortes, textura) — nao
    # cria um vinculo vivo. Sem guardar de onde vieram, a tela nao tinha como
    # dizer "este e o palco tal", e o operador criava um preset que nunca mais
    # aparecia em lugar nenhum.
    #
    # A marca e limpa assim que qualquer um desses valores muda por fora, para
    # ela nunca afirmar uma origem que deixou de ser verdade.
    palco_short_preset: Mapped[str] = mapped_column(String(200), default="")
    # D-563: a cor da palavra CORRENTE da legenda, em hex ("#9bcfe3").
    #
    # Guardamos o hex resolvido, e nao uma chave de catalogo, porque quem
    # desenha a legenda sao DOIS lugares — a previa no navegador e o Remotion no
    # render. Uma chave obrigaria os dois a manterem a mesma tabela de cores, e
    # a licao da D-558 e que duas copias da mesma tabela divergem: o
    # `StageChrome` do frontend ficou com 1920x1080 cravado enquanto o do
    # renderer aprendia a receber o quadro, e ninguem percebeu por meses.
    #
    # O hex nao tem esse problema: e o proprio valor, igual nos dois lados.
    #
    # Vazio = a cor de acento do canal, que e o que sempre foi.
    legenda_cor: Mapped[str] = mapped_column(String(20), default="")
    # D-563: a familia da fonte da legenda ("Anton"), pela mesma razao do hex:
    # o valor viaja, e nao uma chave que previa e renderer teriam de traduzir.
    # Vazio — ou uma familia que o renderer nao carrega — cai na fonte do canal.
    legenda_fonte: Mapped[str] = mapped_column(String(60), default="")
    # D-605: ONDE a legenda senta neste trecho, em % do quadro. 0 = "nao decidi",
    # e ai vale o lugar do palco padrao do corte — e, na falta dele, o ponto fixo
    # que o renderer usava antes desta demanda (base no alto da safe zone,
    # centralizada, 80% de largura).
    #
    # O relato que originou isto: "a depender do Palco, ela fica em cima da
    # pessoa". Quem decide onde a pessoa aparece no vertical e o arranjo do
    # palco, e por isso o lugar da legenda herda do palco — pela mesma cascata
    # de `legenda_cor`/`legenda_fonte` logo acima, e nao por uma nova.
    #
    # `legenda_x` e o CENTRO da caixa; `legenda_y` e a BASE dela, contada do topo
    # do quadro. Base e nao topo porque a legenda vira duas ou tres linhas
    # varias vezes por short: ancorada pela base ela cresce para CIMA e a ultima
    # linha nunca se move, que e o que o `bottom:` do renderer sempre fez. O
    # gancho (`gancho_y`) ancora pelo topo pelo motivo simetrico — e um texto so,
    # digitado ao vivo, e pela base a primeira linha escorregaria a cada palavra.
    legenda_x: Mapped[float] = mapped_column(Float, default=0.0)
    legenda_y: Mapped[float] = mapped_column(Float, default=0.0)
    legenda_largura: Mapped[float] = mapped_column(Float, default=0.0)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    # Importar Corte aqui fecharia o ciclo projeto<->shorts, que test_ciclos_de_import_d695 reprova.
    # "Corte" vive em projeto.py; importá-lo aqui fecharia um ciclo de import (D-695).
    corte: Mapped["Corte"] = relationship("Corte", back_populates="shorts")  # noqa: F821  # pyright: ignore[reportUndefinedVariable]
    metadado: Mapped["MetadadoShort"] = relationship(
        "MetadadoShort",
        back_populates="short",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class MetadadoShort(Base):
    """Metadados de publicacao de um short (E-030, D-452).

    Espelha `MetadadoCorte` no que o short precisa. Campos por plataforma
    (Instagram, TikTok) sao escopo do E-035 e entram quando houver destino.
    """

    __tablename__ = "metadados_shorts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    short_id: Mapped[str] = mapped_column(String(36), ForeignKey("shorts.id"), unique=True)
    titulo_youtube: Mapped[str] = mapped_column(String(100), default="")
    descricao_youtube: Mapped[str] = mapped_column(Text, default="")
    tags_youtube: Mapped[str] = mapped_column(Text, default="[]")
    frase_capa: Mapped[str] = mapped_column(String(100), default="")
    # D-565 (onda 4): o QUADRO de capa deste short, relativo ao projeto.
    #
    # Um frame do proprio short, e nao uma arte montada como a do corte. A capa
    # vertical do corte existe porque o video dele e DEITADO — a imagem 16:9
    # viraria uma faixa fina num quadro vertical. O short ja nasce 9:16, com o
    # palco, a moldura e o fundo do canal em volta: montar arte por cima dele
    # trocaria um quadro que ja e do canal por uma ilustracao.
    capa_path: Mapped[str] = mapped_column(String(1000), default="")
    # Em que segundo do SHORT o quadro foi tirado. Guardado para o operador
    # poder reabrir a escolha, e para refazer a capa depois de um render novo
    # sem ter de procurar o instante outra vez.
    capa_instante_seg: Mapped[float] = mapped_column(Float, default=0.0)
    # D-581: o prompt de imagem da capa, escrito pelo capista.
    #
    # GRAVADO, e nao so devolvido, pelo mesmo motivo da capa do TikTok (D-524):
    # e isso que torna o fluxo retomavel. O operador gera o prompt aqui, sai do
    # app para desenhar no agente dele, e volta minutos depois para subir a
    # arte — sem gravar, o prompt teria morrido no fechar do modal.
    #
    # Coluna propria e nao reuso de `frase_capa`: aquela e o TEXTO que vai na
    # capa (poucas palavras), este e o paragrafo em ingles que descreve a cena.
    prompt_capa: Mapped[str] = mapped_column(Text, default="")
    youtube_video_id: Mapped[str] = mapped_column(String(50), default="")
    youtube_url_publicado: Mapped[str] = mapped_column(String(200), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    short: Mapped["Short"] = relationship("Short", back_populates="metadado")


class PublicacaoShort(Base):
    """Onde cada vídeo já foi parar, e quando (D-564).

    Antes disto o app só sabia de UMA publicação: `Corte.tiktok_publicado_em`.
    Para um short, nada — e sem esse registro o lote republicaria em silêncio o
    que já subiu, que é o erro mais caro que uma fila pode cometer.

    A linha nasce quando o item entra no lote e acompanha o item até o fim: é a
    memória durável do que já foi (não repetir), de quantos saíram hoje (a cota
    do YouTube), do que espera o clique do operador e, D-908, de quando cada um
    foi marcado — o próximo lote parte do último agendado.

    `alvo_tipo` distingue "short" (o vertical, 9:16) de "corte" (o MP4 16:9 que
    também vai para o TikTok, D-470): um contrato, uma tabela.
    """

    __tablename__ = "publicacoes_shorts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    alvo_tipo: Mapped[str] = mapped_column(String(10), default="short")
    alvo_id: Mapped[str] = mapped_column(String(36), index=True)
    plataforma: Mapped[str] = mapped_column(String(30))
    estado: Mapped[str] = mapped_column(String(20), default="aguardando")
    lote_id: Mapped[str] = mapped_column(String(36), default="", index=True)
    url: Mapped[str] = mapped_column(String(500), default="")
    # O que a tela mostra quando algo saiu do trilho (roteiro do TikTok, erro da
    # API, pasta do pacote): texto pronto para ler — quem lê é o operador.
    detalhe: Mapped[str] = mapped_column(Text, default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    # Só quando a publicação foi CONFIRMADA. Nulo enquanto espera o clique: é
    # este campo que conta a cota do dia, e enchê-lo no escuro inflaria a conta.
    publicado_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # D-908: a data marcada para este item (UTC), ou nulo quando subiu "agora".
    agendado_para: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
