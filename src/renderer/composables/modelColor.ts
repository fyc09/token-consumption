// Model color mapping - the ONLY color spec in the app.
// Top 8 by usage: bold high-contrast colors.
// Rest: muted colors.
//
// Used consistently across:
// - DailyTokens stacked bar
// - DailyModels 100% stacked bar
// - DetailDialog model pie chart
// - DetailDialog segmented stacked bar

const BOLD = [
  '#7F3C8D', '#11A579', '#3969AC', '#F2B701', '#E73F74',
  '#80BA5A', '#E68310', '#008695'
]

const MUTED = [
  '#BFD3E6', '#FFD9A6', '#D4B6D6', '#A8D5BA', '#F2C2C2',
  '#C9C9C9', '#E6E6E6'
]

const TOP_N = 8

export function modelColor(model: string, ranked: string[]): string {
  const i = ranked.indexOf(model)
  if (i < 0) return MUTED[0]
  if (i < TOP_N) return BOLD[i]
  return MUTED[(i - TOP_N) % MUTED.length]
}

