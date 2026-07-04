/**
 * Identidade visual — paleta padrão
 *
 * Fonte única de verdade para cores, tipografia e tokens.
 * Substitui literais espalhadas pelas cenas.
 *
 * NOTA: estes são apenas os DEFAULTS neutros. A paleta real do canal é
 * definida em `theme.config.json` e consumida por `theme-v2.ts` — que
 * sobrescreve estes valores. Não coloque branding de canal aqui.
 */

// Carregamento de fontes via @remotion/google-fonts.
// IMPORTANTE: importar este módulo garante que `loadFont` seja chamado.
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

// Carrega apenas pesos e subset usados — evita 100+ requests por tab de render.
// latin cobre português; pesos cobrem regular/semibold/bold das cenas.
const inter = loadInter("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });
const lora = loadLora("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });
const mono = loadJetBrainsMono("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const FONTS = {
  // UI / títulos / labels — sans-serif moderno
  ui: inter.fontFamily,
  // Citações filosóficas / texto editorial — serif
  serif: lora.fontFamily,
  // Datas, fontes, números — monoespaçada
  mono: mono.fontFamily,
};

/**
 * Paleta padrão — defaults neutros.
 * - Cor primária e sua variante profunda (sombras / bordas / estados)
 * - Cor secundária em quatro intensidades (claro → noite)
 * - Cor de acento luminoso (uso raro = hook)
 *
 * Valores meramente ilustrativos: a paleta do canal vem de `theme.config.json`.
 */
export const COLORS = {
  corPrimaria: "#3C6E71",          // primária — teal neutro
  corPrimariaProfunda: "#1E3A3B",  // sombras / bordas / estados

  // ─── Família SECUNDÁRIA (quatro intensidades) ───
  corSecundaria: "#4F6D7A",        // secundária — azul-acinzentado
  corSecundariaClara: "#7FA0AD",   // highlight / gradientes claros
  corSecundariaProfunda: "#33505C",// intermediário — bordas / detalhes
  corSecundariaNoite: "#1B2B33",   // fundos profundos / overlay

  corAcento: "#E0A458",            // ACENTO LUMINOSO — uso raro
  brancoNeve: "#F5F5F5",           // texto sobre escuro
  cinzaEditorial: "rgba(245,245,245,0.6)", // subtexto
  tinta: "#0A0F1A",                // texto sobre claro
  fundoCard: "rgba(10, 10, 20, 0.92)",
  fundoCardSolido: "rgba(15, 15, 30, 0.95)",
};

// Aliases legados (compatibilidade com cenas existentes durante refactor)
export const secundaria = COLORS.corSecundaria;
export const primaria = COLORS.corPrimaria;
export const branco = COLORS.brancoNeve;
export const acento = COLORS.corAcento;

/**
 * Gradientes reutilizáveis
 */
export const GRADIENTS = {
  faixaPrimaria: `linear-gradient(90deg, ${COLORS.corPrimaria} 0%, ${COLORS.corSecundaria} 100%)`,
  pilarVertical: `linear-gradient(180deg, ${COLORS.corPrimaria} 0%, ${COLORS.corSecundaria} 100%)`,
  fundoCard: `linear-gradient(135deg, ${COLORS.corSecundariaProfunda} 0%, ${COLORS.corSecundariaNoite} 100%)`,
  brilhoAcento: `radial-gradient(circle, ${COLORS.corAcento}33 0%, transparent 70%)`,
  ambienteAtmosferico: `radial-gradient(circle at 70% 30%, ${COLORS.corSecundaria}66, ${COLORS.corSecundariaNoite}EE)`,
  capaPrincipal: `linear-gradient(180deg, ${COLORS.corSecundariaClara} 0%, ${COLORS.corSecundaria} 100%)`,
};

/**
 * Sombras tipográficas e de container
 */
export const SHADOWS = {
  glowPrimaria: `0 0 30px ${COLORS.corPrimaria}55`,
  glowAcento: `0 0 40px ${COLORS.corAcento}66`,
  cardElevado: "0 30px 80px rgba(0,0,0,0.6)",
  textoSobreVideo: "0 4px 16px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)",
  mascote: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
};

/**
 * Z-index hierárquico
 */
export const Z = {
  ambiente: 1,        // partículas, noise
  conteudo: 10,       // texto, cards
  mascote: 50,        // mascote
  cta: 100,           // chamada final, overlays críticos
};
