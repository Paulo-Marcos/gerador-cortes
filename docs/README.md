# Documentação

Dois tipos de documento moram aqui, e a pasta diz qual é qual.

## Para quem instala, usa ou contribui

Está **em vigor**: descreve o app de hoje e é corrigido quando o app muda.

| Documento | Para quê |
|---|---|
| [SETUP.md](SETUP.md) | instalar e configurar, do clone ao primeiro canal |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | problemas conhecidos e como sair deles |
| [adr/](adr/README.md) | as decisões de arquitetura e o porquê de cada uma |
| [dominio/](dominio/mapa-de-contextos.md) | mapa de contextos, [glossário](dominio/glossario.md) e [regras de negócio](dominio/regras-de-negocio.md) |
| [ai_features_map.md](ai_features_map.md) | onde o app chama IA, e por qual provedor |
| [ai-index/](ai-index/render-pipeline.md) | índices de navegação para agentes de IA (ver [AI_NAVIGATION.md](../AI_NAVIGATION.md)) |

## `interno/` — o caderno de trabalho

Registros de **como o app chegou aonde está**: diagnósticos, planos de melhoria,
medições de desempenho, experimentos e notas de funcionalidade. Cada um retrata o
código **da data em que foi escrito** e não é atualizado depois; o que ele decidiu
e continua valendo está nas ADRs, no domínio ou no próprio código.

| Pasta | O que guarda |
|---|---|
| `interno/diagnostico/` | as vistorias completas do projeto, por data |
| `interno/melhoria-*/`, `interno/shorts/` | planos e propostas de cada frente (cortes, metadados, capa, shorts) |
| `interno/revisao-*/` | revisões de fluxo e medições do render |
| `interno/lip-sync/` | o experimento de sincronia labial (D-602), com os scripts de medição |
| `interno/feature-*.md` | notas de funcionalidades antigas |
| `interno/historico-arquitetura-2026-05.md` | a narrativa das mudanças de arquitetura de maio de 2026, antes do [CHANGELOG](../CHANGELOG.md) |

**Onde pôr um documento novo:** se ele precisa continuar verdadeiro enquanto o
código muda, é público (e alguém tem de mantê-lo). Se é o registro de uma
investigação, de um plano ou de uma medição, vai para `interno/`, com a data no
nome.
