/**
 * Themes: the visual identities of the complete game interface.
 *
 * A theme is nothing but a palette. It changes the CSS variables the UI reads
 * and never touches game rules, so themes stay separate from game state.
 */

/** The four supported themes. */
export type ThemeId = 'classic' | 'havana' | 'cyberpunk' | 'tokyo' | 'midnight' | 'royal' | 'desert' | 'arctic';

/** The palette a theme sets on the document root. */
export interface ThemePalette {
  /** The felt / page background. */
  readonly surface: string;
  /** The raised panels that sit on the felt. */
  readonly panel: string;
  /** The primary accent, used for legal placements and highlights. */
  readonly accent: string;
  /** The brass accent used for headings and the rack. */
  readonly brass: string;
  /** The main text colour. */
  readonly text: string;
  /** The muted text colour. */
  readonly muted: string;
  /** The glow cast by the table light. */
  readonly glow: string;
}

export interface Theme {
  readonly id: ThemeId;
  readonly label: string;
  /** A one-line description shown in the theme picker. */
  readonly description: string;
  /** The two colours used for the picker swatch. */
  readonly swatch: readonly [string, string];
  readonly palette: ThemePalette;
}

/** The theme catalogue, in the order the picker shows them. */
export const THEMES: readonly Theme[] = [
  {
    id: 'classic',
    label: 'Classic Green Felt',
    description: 'Deep slate emerald, brushed brass, warm late-night club.',
    swatch: ['#0F291E', '#D4AF37'],
    palette: {
      surface: '#0F291E',
      panel: '#0B1A14',
      accent: '#F59E0B',
      brass: '#D4AF37',
      text: '#F4F1E8',
      muted: '#9DB2A6',
      glow: 'rgba(212, 175, 55, 0.35)',
    },
  },
  {
    id: 'havana',
    label: 'Havana Courtyard',
    description: 'Sun-bleached terracotta, sea turquoise, palm dusk.',
    swatch: ['#2B1810', '#E0A458'],
    palette: {
      surface: '#2B1810',
      panel: '#1C0F09',
      accent: '#F2A65A',
      brass: '#E0A458',
      text: '#FBEFE2',
      muted: '#C7A88C',
      glow: 'rgba(224, 164, 88, 0.35)',
    },
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk Bodega',
    description: 'Neon magenta on wet asphalt, cyan signage, rain glow.',
    swatch: ['#12021F', '#FF2E9A'],
    palette: {
      surface: '#12021F',
      panel: '#0B0116',
      accent: '#00E5FF',
      brass: '#FF2E9A',
      text: '#F2E9FF',
      muted: '#A98FC4',
      glow: 'rgba(255, 46, 154, 0.38)',
    },
  },
  {
    id: 'tokyo',
    label: 'Tokyo Lofi Study',
    description: 'Ink blue at 2am, soft sakura, rain on the window.',
    swatch: ['#101A2E', '#F2A7C3'],
    palette: {
      surface: '#101A2E',
      panel: '#0A1120',
      accent: '#7FD1FF',
      brass: '#F2A7C3',
      text: '#EAF1FF',
      muted: '#8FA3C4',
      glow: 'rgba(127, 209, 255, 0.30)',
    },
  },
  {
    id: 'midnight', label: 'Midnight Slate', description: 'Smoked charcoal, cool steel, and electric blue light.', swatch: ['#0B111B', '#6DB7FF'],
    palette: { surface: '#0B111B', panel: '#070B12', accent: '#6DB7FF', brass: '#9CCBFF', text: '#EFF6FF', muted: '#8596AB', glow: 'rgba(109, 183, 255, 0.32)' },
  },
  {
    id: 'royal', label: 'Royal Plum', description: 'Deep aubergine, champagne gold, and velvet shadows.', swatch: ['#241127', '#E8C878'],
    palette: { surface: '#241127', panel: '#160A19', accent: '#D58CE6', brass: '#E8C878', text: '#FFF3FA', muted: '#BE9EBC', glow: 'rgba(232, 200, 120, 0.33)' },
  },
  {
    id: 'desert', label: 'Desert Clay', description: 'Burnt umber, turquoise accents, and sunset copper.', swatch: ['#301A13', '#49C5B6'],
    palette: { surface: '#301A13', panel: '#1E0F0A', accent: '#49C5B6', brass: '#D88D58', text: '#FFF1E5', muted: '#C19C87', glow: 'rgba(216, 141, 88, 0.34)' },
  },
  {
    id: 'arctic', label: 'Arctic Glass', description: 'Frozen navy, glacier cyan, and crisp silver light.', swatch: ['#0A2633', '#91E4F2'],
    palette: { surface: '#0A2633', panel: '#061922', accent: '#91E4F2', brass: '#BDECF4', text: '#F2FCFF', muted: '#91ADB7', glow: 'rgba(145, 228, 242, 0.3)' },
  },
] as const;

/** The theme ids, in catalogue order. */
export const THEME_IDS: readonly ThemeId[] = THEMES.map((theme) => theme.id);

/** The theme used when nothing has been chosen or the choice is invalid. */
export const DEFAULT_THEME: ThemeId = 'classic';

/** Look a theme up by id, falling back to the default theme. */
export function getTheme(id: unknown): Theme {
  if (typeof id !== 'string') return THEMES[0]!;
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;
}

/** Whether a value names one of the supported themes. */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}
