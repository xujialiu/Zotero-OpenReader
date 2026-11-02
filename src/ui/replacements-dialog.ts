import { validateReplacement, type MatchMode, type Replacement, type ReplacementProblem } from '../core/replacements';
import { t } from '../core/l10n';
import { initHelpTips } from './help-tips';
import { createReplacementsModel, type ReplacementScope, type ReplacementsModel } from './replacements-model';

/**
 * The replacements window (issue #237), in Zotero's own form: a modal
 * dialog like Read Aloud's Manage voices, with Zotero's table and, below it,
 * Edit on the left and − + on the right, as Settings → Export → Site-Specific
 * Settings has them; a row is added and edited in a small dialog of its own.
 * Opened from the Player it lists the document's rows and the global ones;
 * from the settings, the global ones alone. OK hands both lists back.
 *
 * The windows' markup is addon/content/replacements.xhtml and
 * replacement-row.xhtml; each calls `init` of the object it was opened with.
 */

export interface ReplacementsDialogInput {
  /** The document the Player belongs to; null opened from the settings. */
  document: { title: string; rows: Replacement[] } | null;
  global: Replacement[];
  /** The document's selected text, offered as a new row's text. */
  prefill?: string;
  /** Rows that recently ran out of time on a sentence (ADR 0024): marked in the table. */
  slow?: { scope: ReplacementScope; row: Replacement }[];
  tutorialURL: string;
}

export interface ReplacementsDialogResult {
  document: Replacement[] | null;
  global: Replacement[];
  changed: { document: boolean; global: boolean };
}

export interface ReplacementsDialogDeps {
  /** chrome:// address of the two windows' folder, ending in `/`. */
  base: string;
  launchURL(url: string): void;
  log(e: unknown): void;
}

const MODES: readonly MatchMode[] = ['exact', 'regex'];
const DRAG_TYPE = 'application/x-ztts-replacement';

const MODE_LABELS: Record<MatchMode, () => string> = {
  exact: () => t('ztts-replacement-mode-exact'),
  regex: () => t('ztts-replacement-mode-regex'),
};

export function matchLabel(row: Replacement): string {
  const mode = MODE_LABELS[row.mode]();
  return row.matchCase ? mode : t('ztts-replacements-ignore-case', { mode });
}

const PROBLEMS: Record<Exclude<ReplacementProblem['reason'], 'syntax'>, () => string> = {
  empty: () => t('ztts-replacement-error-empty'),
  'empty-match': () => t('ztts-replacement-error-empty-match'),
};

/** Open the window over `parent`, modal; the lists as OK left them, or null on Cancel. */
export function openReplacementsDialog(parent: any, deps: ReplacementsDialogDeps, input: ReplacementsDialogInput): ReplacementsDialogResult | null {
  const model = createReplacementsModel({ document: input.document?.rows ?? null, global: input.global });
  let result: ReplacementsDialogResult | null = null;
  const io = {
    init: (win: any) => {
      try {
        initMain(win, model, deps, input, (accepted) => { result = accepted; });
      } catch (e) {
        deps.log(e);
      }
    },
  };
  parent.openDialog(deps.base + 'replacements.xhtml', '', 'chrome,modal,centerscreen,resizable', io);
  return result;
}

function initMain(win: any, model: ReplacementsModel, deps: ReplacementsDialogDeps, input: ReplacementsDialogInput, accept: (result: ReplacementsDialogResult) => void): void {
  const doc = win.document;
  const $ = (id: string) => doc.getElementById(id);
  const React = win.require('react');
  const ReactDOM = win.require('react-dom');
  const VirtualizedTable = win.require('components/virtualized-table');
  const { renderCell } = VirtualizedTable;
  const documentMode = model.mode === 'document';
  const slow = input.slow ?? [];

  // The line above the table: what a replacement does, the tutorial, and whose rows these are
  const intro = $('ztts-replacements-intro');
  intro.textContent = (documentMode ? t('ztts-replacements-intro-document', { title: input.document?.title ?? '' }) : t('ztts-replacements-intro-global')) + ' ';
  const link = doc.createElementNS('http://www.w3.org/1999/xhtml', 'a');
  link.textContent = t('ztts-replacements-tutorial');
  link.setAttribute('href', input.tutorialURL);
  link.className = 'text-link';
  link.addEventListener('click', (event: Event) => {
    event.preventDefault();
    deps.launchURL(input.tutorialURL);
  });
  intro.append(link);

  let tree: any = null;
  const columns = [
    { dataKey: 'text', label: t('ztts-replacements-column-text'), flex: 3 },
    { dataKey: 'readAs', label: t('ztts-replacements-column-read-as'), flex: 3 },
    // Wide enough for "Regular expression, any case" whole in the 720 px window
    // (1.16.17-beta2 cut it at flex 3 of 640 px)
    { dataKey: 'match', label: t('ztts-replacements-column-match'), flex: 4 },
    ...(documentMode ? [{ dataKey: 'scope', label: t('ztts-replacements-column-scope'), flex: 2.5 }] : []),
  ];
  const isSlow = (index: number): boolean => {
    const entry = model.rows()[index];
    return slow.some((s) => s.scope === entry.scope && s.row.text === entry.row.text && s.row.mode === entry.row.mode && s.row.matchCase === entry.row.matchCase);
  };
  const cellValue = (index: number, key: string): string => {
    const { row, scope } = model.rows()[index];
    if (key === 'text') return row.text;
    if (key === 'readAs') return row.readAs;
    if (key === 'match') return matchLabel(row);
    return scope === 'document' ? t('ztts-replacement-scope-document') : t('ztts-replacement-scope-global');
  };
  let dragFrom: number | null = null;
  const renderItem = (index: number, selection: any, oldDiv: any, cols: any[]) => {
    let div = oldDiv;
    if (div) div.innerHTML = '';
    else {
      div = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      div.className = 'row';
      div.setAttribute('draggable', 'true');
      div.addEventListener('dragstart', (event: any) => {
        dragFrom = Number(div.dataset.index);
        event.dataTransfer.setData(DRAG_TYPE, String(dragFrom));
        event.dataTransfer.effectAllowed = 'move';
      });
      div.addEventListener('dragend', () => { dragFrom = null; clearDrop(); });
    }
    div.dataset.index = String(index);
    div.classList.toggle('selected', selection.isSelected(index));
    const overridden = model.overridden(index);
    const late = isSlow(index);
    div.classList.toggle('ztts-overridden', overridden);
    div.classList.toggle('ztts-slow', late);
    div.setAttribute('title', overridden ? t('ztts-replacements-overridden') : late ? t('ztts-replacements-slow') : '');
    for (const column of cols) div.appendChild(renderCell(index, cellValue(index, column.dataKey), column));
    return div;
  };

  const selected = (): number[] => {
    const set = tree?.selection?.selected;
    return set ? [...set].sort((a: number, b: number) => a - b) : [];
  };
  const refresh = (select?: number) => {
    tree?.invalidate();
    if (select !== undefined && select >= 0) tree?.selection.select(select);
    updateButtons();
  };
  const updateButtons = () => {
    const count = selected().length;
    $('ztts-replacements-edit').disabled = count !== 1;
    $('ztts-replacements-remove').disabled = count === 0;
  };

  const editRow = (index: number | null) => {
    const current = index === null ? null : model.rows()[index];
    const draft = openRowDialog(win, deps, model, {
      row: current?.row ?? { text: input.prefill?.trim() ?? '', readAs: '', mode: 'exact', matchCase: true },
      scope: current?.scope ?? model.mode,
      index,
    });
    if (!draft) return;
    const landed = index === null ? model.add(draft.row, draft.scope) : model.update(index, draft.row, draft.scope);
    refresh(landed);
  };
  const removeSelected = () => {
    const rows = selected();
    if (!rows.length) return;
    model.remove(rows);
    refresh(Math.min(rows[0], model.rows().length - 1));
  };
  const moveSelected = (by: number) => {
    const rows = selected();
    if (rows.length !== 1) return;
    refresh(model.move(rows[0], rows[0] + by));
  };

  // Dragging a row: a line where it would land, kept to its own list by the model
  let marked: any = null;
  const clearDrop = () => {
    marked?.classList.remove('ztts-drop-before', 'ztts-drop-after');
    marked = null;
  };
  const dropTarget = (event: any): { index: number; after: boolean } | null => {
    const row = event.target?.closest?.('.row');
    if (!row || row.dataset.index === undefined) return null;
    const box = row.getBoundingClientRect();
    return { index: Number(row.dataset.index), after: event.clientY > box.top + box.height / 2 };
  };
  const onDragOver = (event: any) => {
    if (dragFrom === null || !event.dataTransfer?.types?.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = dropTarget(event);
    clearDrop();
    if (!target) return;
    marked = event.target.closest('.row');
    marked.classList.add(target.after ? 'ztts-drop-after' : 'ztts-drop-before');
  };
  const onDrop = (event: any) => {
    const from = dragFrom;
    const target = dropTarget(event);
    clearDrop();
    dragFrom = null;
    if (from === null || !target) return;
    event.preventDefault();
    let to = target.index + (target.after ? 1 : 0);
    if (to > from) to--;
    refresh(model.move(from, to));
  };

  const onKeyDown = (event: any) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      removeSelected();
      return false;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      moveSelected(event.key === 'ArrowUp' ? -1 : 1);
      return false;
    }
    return true;
  };

  ReactDOM.createRoot($('ztts-replacements-table')).render(
    React.createElement(VirtualizedTable, {
      getRowCount: () => model.rows().length,
      id: 'ztts-replacements-tree',
      ref: (ref: any) => { tree = ref; },
      renderItem,
      showHeader: true,
      columns,
      staticColumns: true,
      multiSelect: true,
      disableFontSizeScaling: true,
      getRowString: (index: number) => model.rows()[index]?.row.text ?? '',
      onSelectionChange: () => updateButtons(),
      onActivate: (_event: unknown, indices: number[]) => { if (indices?.length === 1) editRow(indices[0]); },
      onKeyDown,
      onDragOver,
      onDrop,
    }),
  );

  $('ztts-replacements-add').addEventListener('command', () => editRow(null));
  $('ztts-replacements-edit').addEventListener('command', () => { const rows = selected(); if (rows.length === 1) editRow(rows[0]); });
  $('ztts-replacements-remove').addEventListener('command', removeSelected);
  doc.addEventListener('dialogaccept', () => accept({ ...model.result(), changed: model.changed() }));
  updateButtons();
}

interface RowDraft {
  row: Replacement;
  scope: ReplacementScope;
  index: number | null;
}

/** The small dialog for one row: Text, Read as, Match, Match case and, from the Player, Applies to. */
function openRowDialog(parent: any, deps: ReplacementsDialogDeps, model: ReplacementsModel, draft: RowDraft): { row: Replacement; scope: ReplacementScope } | null {
  let result: { row: Replacement; scope: ReplacementScope } | null = null;
  const io = {
    init: (win: any) => {
      try {
        initRow(win, model, draft, (accepted) => { result = accepted; });
      } catch (e) {
        deps.log(e);
      }
    },
  };
  parent.openDialog(deps.base + 'replacement-row.xhtml', '', 'chrome,modal,centerscreen', io);
  return result;
}

function initRow(win: any, model: ReplacementsModel, draft: RowDraft, accept: (result: { row: Replacement; scope: ReplacementScope }) => void): void {
  const doc = win.document;
  const $ = (id: string) => doc.getElementById(id);
  const text = $('ztts-replacement-text'), readAs = $('ztts-replacement-read-as');
  const mode = $('ztts-replacement-mode'), matchCase = $('ztts-replacement-match-case');
  const scope = $('ztts-replacement-scope'), scopeRow = $('ztts-replacement-scope-row');
  const error = $('ztts-replacement-error');
  doc.title = draft.index === null ? t('ztts-replacement-add-title') : t('ztts-replacement-edit-title');
  text.value = draft.row.text;
  readAs.value = draft.row.readAs;
  mode.value = MODES.includes(draft.row.mode) ? draft.row.mode : 'exact';
  matchCase.checked = draft.row.matchCase;
  scopeRow.hidden = model.mode !== 'document';
  scope.value = draft.scope;
  initHelpTips(doc);

  const current = (): { row: Replacement; scope: ReplacementScope } => ({
    row: { text: String(text.value).trim(), readAs: String(readAs.value), mode: (MODES.find((m) => m === mode.value) ?? 'exact'), matchCase: !!matchCase.checked },
    scope: model.mode === 'document' && scope.value === 'document' ? 'document' : 'global',
  });
  const problem = (): string | null => {
    const { row, scope: where } = current();
    const invalid = validateReplacement(row);
    if (invalid) {
      return invalid.reason === 'syntax' ? t('ztts-replacement-error-syntax', { detail: invalid.detail ?? '' }) : PROBLEMS[invalid.reason]();
    }
    // Moving within the same list, the row itself is not a duplicate
    const except = draft.index !== null && draft.scope === where ? draft.index : undefined;
    return model.duplicate(row, where, except) === null ? null : t('ztts-replacement-error-duplicate');
  };
  const show = (message: string | null) => {
    error.hidden = !message;
    error.textContent = message ?? '';
  };
  for (const field of [text, readAs]) field.addEventListener('input', () => show(null));
  mode.addEventListener('command', () => show(null));
  doc.addEventListener('dialogaccept', (event: Event) => {
    const message = problem();
    if (message) {
      show(message);
      event.preventDefault();
      return;
    }
    accept(current());
  });
  text.focus();
  text.select?.();
}
