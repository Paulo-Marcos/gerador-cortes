# Handoff — CortadorLive Workbench (redesign do shell + todas as páginas)

## Visão geral

Redesign completo do frontend do CortadorLive (Vite + React + TS + Tailwind + shadcn/ui) em torno de um **shell "Workbench"**:

- **Abas de trabalho** (projeto+etapa, como um navegador/VS Code) em vez de navegação por rota única;
- **4 painéis retráteis** com auto-colapso responsivo (rail de projetos, painel contextual esquerdo, painel de ferramentas direito, fila global);
- **Player sempre 16:9 com altura limitada** — o espaço vertical sobrando vai para timeline/ferramentas/campos;
- **Fila global de jobs** visível em qualquer tela (resolve a dor: trabalhar num projeto enquanto renderiza outro);
- **Temas completos** claro/escuro + 4 paletas de acento, altamente customizável estilo VS Code.

## Sobre os arquivos de design

`Workbench 1c.dc.html` e `Shell Explorations.dc.html` são **referências de design em HTML** — protótipos de aparência e comportamento, **não código de produção**. A tarefa é **recriar no codebase existente** (`frontend/`), reaproveitando os componentes, hooks e APIs que já existem. NUNCA reescrever lógica de negócio que já funciona — o redesign é de *shell, layout e navegação*; os painéis internos são os componentes atuais re-hospedados.

## Fidelidade

**Hi-fi para estrutura, layout, cores e comportamento dos painéis.** Dados são fictícios (LIVE 263/265/266/267/268, "Canal do Sapo"). Textos de prompts/skills são ilustrativos — usar os dados reais das APIs.

## Tokens de design

O projeto JÁ tem o sistema `--wb-*` em `src/index.css`. O protótipo usa um mapeamento simplificado. **De/para de tokens** (usar sempre o token existente à direita; não criar tokens novos, exceto os marcados ⊕):

| Protótipo | Codebase (`index.css`) |
|---|---|
| `--bg` | `--wb-bg` |
| `--strip` | ⊕ novo: `--wb-bg-strip` (faixa das abas; claro: `oklch(0.92 0.008 240)`, escuro: `oklch(0.125 0.012 255)`) |
| `--panel` | `--wb-bg-panel` |
| `--inset` | `--wb-bg-inset` |
| `--border` | `--wb-border` |
| `--text` / `--mute` / `--dim` | `--wb-text` / `--wb-text-mute` / `--wb-text-dim` |
| `--acc` / `--acc-strong` / `--acc-soft` / `--acc-fg` | `--wb-accent` / `--wb-accent-strong` / `--wb-accent-soft` / ⊕ `--wb-accent-fg` |
| `--ok(-soft/-ink)` | `--wb-ok(-soft)`; ink = usar `--wb-ok` sobre `-soft` |
| `--warn`, `--err`, `--info`, `--fire` (+ soft) | `--wb-warn`, `--wb-err`, `--wb-info`, `--wb-fire` (+ `-soft`) |

Tipografia: DM Sans (UI) + JetBrains Mono (timecodes, labels de seção `9px/800/letter-spacing .14em`, valores) — já configuradas. Raios: usar `--radius-*` existentes. Sombras: `--wb-shadow`.

Dimensões-chave do shell:
- Tab strip: 44px de altura útil (padding 8px 12px, abas `border-radius 10px 10px 0 0`).
- Painéis (aberto / colapsado): rail **216 / 62px**, lista de cortes **236 / 40px**, Trechos/Transcrição **300 / 38px**, fila global **248 / 42px**, cenas **232 / 40px**, layout YouTube **260 / 38px**. Transição `width .22s ease`.
- Centro tem **mínimo 420px**: se `soma(painéis) + 420 > viewport`, auto-colapsar na ordem **rail → fila → painel direito → painel esquerdo** (o painel expandido manualmente por último "vence" — os outros cedem).
- Painel colapsado = barra vertical clicável: chevron, label em `writing-mode:vertical-rl`, e indicador vivo (ex.: anel de progresso da fila).
- Player: `width:min(100%, calc((100vh - 330px)*16/9)); aspect-ratio:16/9; align-self:center` — nunca letterbox; sobra vertical vai para timeline (`flex:1`).

## Arquivos deste pacote

- `Workbench 1c.dc.html` — protótipo interativo final (todas as views).
- `Shell Explorations.dc.html` — exploração das 4 direções (histórico; a escolhida foi a 1c).
- `DE-PARA.md` — mapeamento página por página, função por função.
- `ATALHOS-E-CONFIGURACOES.md` — atalhos a implementar + modelo de customização estilo VS Code.
- `PLANO-DE-ETAPAS.md` — implementação em fases, com critérios de aceite e guarda-corpos anti-alucinação.

## Ordem de leitura para o implementador

1. `README.md` (este) → 2. `DE-PARA.md` → 3. `PLANO-DE-ETAPAS.md` (execute UMA etapa por vez) → 4. `ATALHOS-E-CONFIGURACOES.md` quando chegar na etapa 7.
