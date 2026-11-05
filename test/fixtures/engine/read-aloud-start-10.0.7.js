// Verbatim methods from Zotero 10.0.7 resource/reader/reader.js, lines
// 84105-84149 (omni.ja; zotero/reader, AGPL-3.0, Copyright © Corporation
// for Digital Scholarship). The class wrapper is test scaffolding; the
// method bodies are unchanged. Tests inject the SDT builder and language
// helper, and use the existing native manager fixture for request triggers.
class NativeStartReader {
  async _requestReadAloudSegments() {
    let manager = this._readAloudManager;
    let granularity = manager.segmentGranularity;
    if (!granularity) {
      return;
    }
    let sdt = await this._loadSDT();
    if (!sdt || !manager.active || manager.segmentGranularity !== granularity) {
      return;
    }
    if (!manager.lang) {
      manager.setLanguage(sdt_segments_getSDTLang(sdt.structure));
    }
    this._readAloudSegments = sdt_segments_buildSDTReadAloudSegments(sdt.structure, granularity, manager.lang);
    let segments = this._readAloudSegments.segments;
    if (!segments.length) {
      manager.clearSegments();
      return;
    }
    this._materializeSourcePositions(segments);
    let position = this._captureReadAloudStart();
    let backwardStopIndex = position ? this._findReadAloudStartIndex(segments, position) : this._findFirstVisibleSegmentIndex(segments);
    manager.setSegments(segments, backwardStopIndex, null);
  }

  // Selection > explicit target > persisted savedPosition. Selection and
  // target are consumed as side effects. savedPosition only applies if
  // the user hasn't scrolled too far away.
  _captureReadAloudStart() {
    let view = this._lastView;
    let selectionPosition = view?.getSelectionPosition?.();
    if (selectionPosition) {
      view.clearSelection?.();
      return selectionPosition;
    }
    let target = this._readAloudManager.consumeTargetPosition();
    if (target) {
      return target;
    }
    let saved = this._state.readAloudState.savedPosition;
    if (saved && this._activePrimaryView?.isPositionNearView?.(saved)) {
      return saved;
    }
    return null;
  }
}
