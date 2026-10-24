import type { Tick } from '../graph/coordinate.ts'

/** 11px labels: conservative per-character estimate plus breathing room. */
const LABEL_CHAR_PX = 6.5
const LABEL_PADDING_PX = 12
const LABEL_MIN_WIDTH_PX = 18
const LABEL_GAP_PX = 8
const LABEL_LEFT_INSET_PX = 20
const LABEL_RIGHT_INSET_PX = 4

export interface CategoricalTickCandidate extends Tick {
  /** Unrounded screen X of the category before the label clamp. */
  readonly px: number
}

interface PlacedTick {
  readonly tick: CategoricalTickCandidate
  readonly center: number
  readonly width: number
}

/**
 * Conservative width estimate for the 11px system-font tick labels. The
 * renderer has no text metrics without layout, so this uses a stable
 * character-count policy rather than a browser measurement.
 */
export function estimateCategoryLabelWidth(label: string): number {
  return Math.max(LABEL_MIN_WIDTH_PX, label.length * LABEL_CHAR_PX + LABEL_PADDING_PX)
}

/**
 * Select a readable subset of categorical ticks for the available plot width.
 * Input must already be ordered by screen X. Greedy left-to-right selection
 * uses the label estimate above; the final category is added when it fits,
 * replacing trailing interior labels if necessary. Thus the first and last
 * labels survive whenever their own extents allow it. No bars are involved.
 */
export function selectCategoricalTicks(candidates: ReadonlyArray<CategoricalTickCandidate>, plotWidth: number): Tick[] {
  if (!(plotWidth > 0) || candidates.length === 0) {
    return []
  }
  const placed: PlacedTick[] = candidates.map((tick) => ({
    tick,
    center: Math.min(Math.max(tick.px, LABEL_LEFT_INSET_PX), plotWidth - LABEL_RIGHT_INSET_PX),
    width: estimateCategoryLabelWidth(tick.label),
  }))
  const fits = (left: PlacedTick, right: PlacedTick): boolean =>
    right.center - left.center >= (left.width + right.width) / 2 + LABEL_GAP_PX

  const selected: PlacedTick[] = []
  for (const tick of placed) {
    const previous = selected[selected.length - 1]
    if (previous === undefined || fits(previous, tick)) {
      selected.push(tick)
    }
  }

  const last = placed[placed.length - 1]
  if (last !== undefined && selected[selected.length - 1] !== last) {
    while (selected.length > 1) {
      const previous = selected[selected.length - 1]
      if (previous !== undefined && fits(previous, last)) {
        break
      }
      selected.pop()
    }
    const previous = selected[selected.length - 1]
    if (previous !== undefined && fits(previous, last)) {
      selected.push(last)
    }
  }

  return selected.map(({ tick }) => ({ value: tick.value, label: tick.label }))
}
