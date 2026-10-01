/**
 * The Top bar and the Bottom bar lie over the document's edge rather than
 * shrinking it (issue #135): what the follow has to count as off screen.
 */

/** A docked bar's height, the frame's own while no menu is open. */
export const BAR_HEIGHT = 34;

/**
 * The frame's z-index (issue #164): above Zotero's toolbar (30) and sidebar
 * (10), which a dragged Floating panel can reach, and below Zotero's lowest
 * popup layer (`.utility-popup`, 40), so every popup Zotero draws, from the
 * find bar and the Appearance popup to the dialog and the menus they open,
 * lies over the player. The document's views have none.
 */
export const FRAME_Z = 35;

/**
 * The rules that move Zotero's popups hanging from the top of the reader out
 * from under the Top bar, by the bar's height: the find bar in every view that
 * reaches the top (#137), and the Appearance popup, whose first row would
 * otherwise lie under the bar (#164). None for the other layouts, or while
 * the player is closed.
 */
export function popupRules(layout: string, visible: boolean): string[] {
  if (!visible || layout !== 'top') return [];
  return [
    '.split-view .primary-view .find-popup, body.enable-vertical-split-view .split-view .secondary-view .find-popup { margin-top: ' + BAR_HEIGHT + 'px !important; }',
    '.appearance-popup { margin-top: ' + BAR_HEIGHT + 'px !important; }',
  ];
}

/** A vertical extent in the reader document, CSS px. */
export interface Band {
  top: number;
  bottom: number;
}

/** How many px of a box's top and bottom edge lie under a bar. */
export interface Covered {
  top: number;
  bottom: number;
}

/**
 * The strip a bar occupies, from its frame's box: the frame grows past the
 * bar while a menu is open, downward for the Top bar and upward for the
 * Bottom bar. Null for the Floating panel, which covers a corner and can be
 * dragged away.
 */
export function barBand(layout: string, frame: Band): Band | null {
  if (layout === 'top') return { top: frame.top, bottom: frame.top + BAR_HEIGHT };
  if (layout === 'A') return { top: frame.bottom - BAR_HEIGHT, bottom: frame.bottom };
  return null;
}

/** How much of the box's top and bottom edge the band lies over; a band over neither edge covers nothing. */
export function coveredEdges(band: Band | null, box: Band): Covered {
  if (!band || !(box.bottom > box.top)) return { top: 0, bottom: 0 };
  const top = band.top <= box.top && band.bottom > box.top ? Math.min(band.bottom, box.bottom) - box.top : 0;
  const bottom = band.bottom >= box.bottom && band.top < box.bottom ? box.bottom - Math.max(band.top, box.top) : 0;
  return { top, bottom };
}
