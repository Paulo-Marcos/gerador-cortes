# Glossário do domínio

> Criado na D-667. Cada termo com o que ele **é**, onde **mora** no código e com
> o que ele **se confunde**. Conferido contra o código de 22/09/2026.
>
> Regra de uso: um conceito, uma palavra — em código, banco e tela. Ao criar um
> campo novo, confira aqui se o nome já quer dizer outra coisa.

## Entidades centrais

| Termo | O que é | Onde mora |
|---|---|---|
| **Projeto** | Uma live baixada e processada. Tem uma pasta própria em `projetos/<id>/`. | `models.Projeto`; ciclo em `domain/projeto/ciclo_projeto.py` (RN-01) |
| **Corte** | Um trecho proposto ou aprovado da live, definido por `inicio_seg`/`fim_seg` em tempo de **live**. | `models.Corte`; ciclo em `domain/corte/ciclo_corte.py` (RN-04) |
| **Metadado** | O texto e a capa de publicação de um corte (título, descrição, tags, thumbnail). Um por corte. | `models.MetadadoCorte` |
| **Short** | Um vídeo vertical tirado de um corte. Seus tempos estão no espaço do **bruto**, não da live (RN-08). | `models.Short` |
| **Bruto** | O clip do corte já cortado da live, sem filtro nem cenas (`clip_raw_*.mkv`). É a base do render final e dos shorts. | `services/export_bruto.py`; `Corte.arquivo_clip_path` |
| **Canal** | A identidade que publica: handle, nome, crédito, tema, mascote e skills editoriais. Uma pasta por canal (banco de dados e mídias) e as suas linhas no `settings.db` (identidade, skills e ajustes). | `instance/channels/<id>/`; `settings.db`; `services/channels.py` (`identidade_do_canal_ativo`); ver ADR-0012 |

## Os termos que se confundem

### Trecho, desvio, bloco, segmento, região

São cinco ideias diferentes que o código e a tela às vezes chamam pelo mesmo nome.

| Termo | O que é | Onde mora | Não confundir com |
|---|---|---|---|
| **Desvio** | Um intervalo que **sai** do corte (silêncio, erro, trecho sem graça). A **tela chama de "trecho"**. | `Corte.desvios`; `domain/corte/segment_calculator.py` | bloco (desvio decide o que sai; bloco decide a ordem do que fica) |
| **Bloco** | Um pedaço do corte na **ordem de exibição**: a lista de blocos é a EDL do corte. Lista vazia = ordem cronológica. | `Corte.arranjo_blocos`; `domain/corte/arranjo_blocos.py` | desvio (os dois se compõem: cada bloco é subtraído dos seus desvios) |
| **Segmento (do short)** | Um pedaço do **bruto** que entra no short, na ordem que o operador escolheu. Lista vazia = janela única. | `Short.segmentos`; `domain/segmentos_short.py` (RN-09) | segmento detectado |
| **Segmento detectado** | Um corte de cena achado automaticamente (PySceneDetect) no bruto do corte. Só uma sugestão. | `Corte.segmentos_detectados` | segmento do short |
| **Região (de layout)** | Um intervalo de **tempo** do corte com um modo de exibição: `full` ou `compartilhada`. | `layout_youtube.regioes`; `domain/corte/youtube_layout.py` | região do quadro |
| **Região (do quadro)** | Uma **área** do vídeo de origem com nome (a facecam, a tela compartilhada), recortada e recolocada num slot. | presets de palco; `domain/palco_short.py` (`Recorte.regiao`) | região de layout |

### Os três ganchos

| Termo | O que é | Onde mora |
|---|---|---|
| **`frase_gancho`** (do corte) | O ponto de entrada mais forte do argumento, proposto pela análise: a borda editorial de início do corte. | `Corte.frase_gancho_hms`, `frase_gancho_texto` |
| **`gancho`** (do short) | A frase de curadoria da IA ("qual é a graça deste trecho"). Também vira a **descrição do post** publicado. | `Short.gancho` |
| **`gancho_tela`** (do short) | O cartão de 4 a 7 palavras na **abertura** do short, que segura o dedo no feed. A aparência herda do preset; o texto nunca (RN-12, RN-13). | `Short.gancho_tela`; `domain/gancho_short.py` |

O `gancho` alimenta o gerador do `gancho_tela`, mas não são a mesma frase. E o
`gancho_tela` **não é uma cena**: cena é texto em qualquer momento, N vezes; o
gancho é um só, ancorado no zero.

### Palco, recorte e slot

| Termo | O que é | Onde mora |
|---|---|---|
| **Palco** | A composição do quadro final: um fundo próprio com as regiões do vídeo coladas em slots. Troca "cópia de pixel da live" por "recomposição". | `domain/palco_short.py`; `Corte.palco_padrao` |
| **Recorte** | Uma região do quadro com destino definido: **de onde sai** (o crop, vindo do preset do canal) e **para onde vai** (o slot, vindo do modelo). | `domain/palco_short.py` (`Recorte`) |
| **Slot** | O lugar no quadro final onde um recorte é colado. Muda entre 16:9 e 9:16; o crop não. | `domain/palco_short.py` (`Slot`) |
| **Palco padrão** | O palco do corte, herdado **ao vivo** pelos shorts dele (RN-11). | `Corte.palco_padrao`; `services/palco_shorts.py` |

### Fire e candidato a shorts

| Termo | O que é | Onde mora |
|---|---|---|
| **Fire** | Um julgamento sobre o **corte inteiro**: "este é dos bons". Muda a moldura da capa e o que a limpeza preserva (RN-15). | `MetadadoCorte.is_fire` |
| **Candidato a shorts** | Uma aposta sobre **um trecho** do corte, independente do Fire (RN-14). | `MetadadoCorte.candidato_shorts` |

### Cena

| Termo | O que é | Onde mora |
|---|---|---|
| **Cena** | Um card de texto sobre o vídeo (Remotion) em qualquer momento do corte. | `Corte.cenas_remotion`; `services/cenas_remotion.py` |

## Travas protegem funcionalidades, não contextos

As travas de `.guia/locks/registry.yaml` protegem **funcionalidades homologadas**
(um comportamento que foi validado e não deve regredir sem aviso), não os
contextos do [mapa](mapa-de-contextos.md). Um arquivo pode estar em várias
travas, e um contexto inteiro pode não ter nenhuma. Trava não é fronteira de
arquitetura: as fronteiras são verificadas pelo import-linter (D-662) e pelo
ESLint (D-663).
