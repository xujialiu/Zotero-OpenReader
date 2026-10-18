import { describe, expect, it, vi } from 'vitest';
import { isLanguageSupported, zoteroKeepsRegion } from '../../src/core/read-aloud-speed';
import { createPlayerVoiceList } from '../../src/read-aloud/player-voice-list';

function fixture() {
  const voices = [
    { id: 'us-a', language: 'en-US' }, { id: 'adrian', language: 'en' },
    { id: 'wild', language: '*' }, { id: 'us-b', language: 'en-US' },
    { id: 'gb', language: 'en-GB' },
  ];
  class Manager {
    active = true; paused = true; selectedVoiceID = 'us-a'; region: string | null = 'US';
    allVoices = voices; applied: string | null = null;
    get voicesForLanguage() {
      const current = this.allVoices.find(v => v.id === this.selectedVoiceID);
      const region = current?.language.split('-')[1] ?? this.region;
      // Native compatibility admits generic English and wildcard voices.
      return Object.assign(this.allVoices.filter(v => !region || !v.language.includes('-') || v.language === `en-${region}`),
        { filter: () => [], find: () => undefined });
    }
    selectVoice(id: string) {
      this.selectedVoiceID = id;
      // Native _applyVoice checks the getter after changing the selected ID.
      this.applied = this.voicesForLanguage.some(v => v.id === id) ? id : null;
    }
  }
  const manager = new Manager();
  const reader = { _internalReader: { _readAloudManager: manager } };
  const error = vi.fn();
  const list = createPlayerVoiceList({ error });
  list.attach(reader);
  const ids = () => Array.from(manager.voicesForLanguage, v => v.id);
  return { manager, reader, list, ids, voices, error, Manager };
}

describe('one player voice list', () => {
  it('offers only US voices to the popup and accepts both regional choices', () => {
    const f = fixture();
    expect(f.ids()).toEqual(['us-a', 'us-b']);
    for (const id of ['us-b', 'us-a']) {
      f.manager.selectVoice(id);
      expect(f.manager.selectedVoiceID).toBe(id);
      expect(f.manager.applied).toBe(id);
      expect(f.ids()).toEqual(['us-a', 'us-b']);
    }
    expect(f.voices).toHaveLength(5);
    f.list.dispose();
  });
  it('uses the selected region and keeps a singleton regional menu', () => {
    const f = fixture();
    f.manager.selectedVoiceID = 'gb';
    expect(f.ids()).toEqual(['gb']);
    f.list.dispose();
  });
  // Issue #223: a language lists only its own voices, generic English too,
  // as the phone and the voice browser do; a wildcard selection keeps Zotero's list
  it('offers a generic selection only the generic voices, and applies it with a stale US region', () => {
    const f = fixture();
    f.manager.selectVoice('adrian');
    expect(f.manager.applied).toBe('adrian');
    expect(f.ids()).toEqual(['adrian']);
    f.manager.selectVoice('wild');
    expect(f.manager.applied).toBe('wild');
    expect(f.ids()).toContain('adrian');
    f.list.dispose();
  });
  it('keeps a generic fallback usable when the regional voice disappears', () => {
    const f = fixture();
    f.manager.allVoices = f.voices.filter(v => !v.language.includes('-'));
    f.manager.selectVoice('adrian');
    expect(f.manager.applied).toBe('adrian');
    expect(f.ids()).toEqual(['adrian']);
    f.list.dispose();
  });
  // Zotero sees every Chinese region as none (normalizeLanguage), so its list
  // for a Hong Kong voice holds the Mandarin and Taiwanese ones too
  it('offers a Chinese selection only the voices of its own region', () => {
    const chinese = [
      { id: 'cn-a', language: 'zh-CN' }, { id: 'hk-a', language: 'zh-HK' },
      { id: 'tw-a', language: 'zh-TW' }, { id: 'hk-b', language: 'zh-HK' },
      { id: 'sichuan', language: 'zh-CN-sichuan' },
    ];
    class Manager {
      selectedVoiceID = 'hk-b'; lang = 'zh'; region: string | null = 'HK';
      allVoices = chinese;
      get voicesForLanguage() {
        // ReadAloudManager's: the selected voice's Zotero region, else the one asked for
        const current = this.allVoices.find(v => v.id === this.selectedVoiceID);
        const region = current && zoteroKeepsRegion(current.language) && current.language.includes('-')
          ? current.language.slice(3) : this.region;
        const lang = region ? `${this.lang}-${region}` : this.lang;
        return Object.assign(this.allVoices.filter(v => isLanguageSupported(v.language, lang)), { filter: () => [], find: () => undefined });
      }
    }
    const manager = new Manager();
    const list = createPlayerVoiceList({ error: vi.fn() });
    list.attach({ _internalReader: { _readAloudManager: manager } });
    const ids = () => Array.from(manager.voicesForLanguage, v => v.id);
    expect(ids()).toEqual(['hk-a', 'hk-b']);
    manager.selectedVoiceID = 'cn-a';
    expect(ids()).toEqual(['cn-a']);
    manager.selectedVoiceID = 'sichuan';
    expect(ids()).toEqual(['sichuan']);
    list.dispose();
  });
  it('preserves native results without a selected voice and restores the accessor', () => {
    const f = fixture();
    f.manager.selectedVoiceID = '';
    expect(f.ids()).toEqual(['us-a', 'adrian', 'wild', 'us-b']);
    f.manager.selectedVoiceID = 'us-a';
    f.list.attach(f.reader);
    expect(f.list.inspect(f.reader)?.patched).toBe(true);
    f.list.dispose();
    expect(f.ids()).toContain('adrian');
    expect(f.error).not.toHaveBeenCalled();
  });
});
