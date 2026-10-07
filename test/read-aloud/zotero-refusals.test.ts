import { describe, expect, it, vi } from 'vitest';
import { createZoteroRefusals, refusalAction, type Reminder } from '../../src/read-aloud/zotero-refusals';

describe('refusalAction (issue #140)', () => {
  it('switches off at the daily limit, whatever is left', () => {
    expect(refusalAction('daily-limit-exceeded', 200, 20)).toBe('daily-limit');
  });

  it('switches off a used-up tier only when its credits are 0', () => {
    expect(refusalAction('quota-exceeded', 0, 5)).toBe('used-up');
    expect(refusalAction('quota-exceeded', -2, null)).toBe('used-up');
    // Zotero refused while some is left: the cheaper voices may still read
    expect(refusalAction('quota-exceeded', 20, 0.7)).toBe('short');
  });

  it('goes by the plugin’s own figure when the credits cannot be read afresh', () => {
    expect(refusalAction('quota-exceeded', null, 0)).toBe('used-up');
    expect(refusalAction('quota-exceeded', null, 2)).toBe('short');
    expect(refusalAction('quota-exceeded', null, null)).toBe('short');
  });
});

type Reader = { name: string; tier: string | null; open: boolean };

function harness(over: { credits?: number | null; on?: boolean } = {}) {
  const readers: Reader[] = [
    { name: 'this', tier: 'premium', open: true },
    { name: 'other premium', tier: 'premium', open: true },
    { name: 'other fish', tier: 'fish', open: true },
    { name: 'closed premium', tier: 'premium', open: false },
  ];
  let on = over.on ?? true;
  const closed: string[] = [];
  const reminders: Array<{ reader: string } & Reminder> = [];
  const switchOff = vi.fn(() => { on = false; });
  const credits = vi.fn(async () => (over.credits === undefined ? 0 : over.credits));
  const refusals = createZoteroRefusals<Reader>({
    readers: () => readers,
    usesTier: (reader, tier) => reader.open && reader.tier === tier,
    close: (reader) => { reader.open = false; closed.push(reader.name); },
    isOn: () => on,
    switchOff,
    credits,
    remind: (reader, reminder) => reminders.push({ reader: reader.name, ...reminder }),
    label: (tier) => (tier === 'premium' ? 'Zotero Premium' : 'Zotero Standard'),
    log: () => {},
  });
  return { readers, closed, reminders, switchOff, credits, refusals, isOn: () => on };
}

describe('createZoteroRefusals (issue #140)', () => {
  it('used up: closes every player reading with the tier, switches it off, and reminds where it happened', async () => {
    const h = harness({ credits: 0 });
    await h.refusals.refused(h.readers[0], { code: 'quota-exceeded', tier: 'premium', minutes: 0 });
    expect(h.closed).toEqual(['this', 'other premium']);
    expect(h.switchOff).toHaveBeenCalledWith('premium');
    expect(h.reminders).toEqual([{
      reader: 'this', action: 'used-up', tier: 'premium', buy: true, others: 1,
      text: 'Zotero Premium has no remaining time and has been switched off. Add more time, then enable it again in OpenReader settings. Reading also stopped in 1 other tab.',
    }]);
    expect(h.refusals.last()).toMatchObject({ action: 'used-up', tier: 'premium', credits: 0, closed: 2 });
  });

  it('closes the players before the switch goes off, so no reading loses its voice under it', async () => {
    const h = harness({ credits: 0 });
    const order: string[] = [];
    h.switchOff.mockImplementation(() => { order.push(`off with ${h.readers.filter((r) => r.open && r.tier === 'premium').length} open`); });
    await h.refusals.refused(h.readers[0], { code: 'quota-exceeded', tier: 'premium', minutes: 0 });
    expect(order).toEqual(['off with 0 open']);
  });

  it('daily limit: the same, with no link, and whatever credits are left', async () => {
    const h = harness({ credits: 200 });
    await h.refusals.refused(h.readers[0], { code: 'daily-limit-exceeded', tier: 'premium', minutes: 20 });
    expect(h.switchOff).toHaveBeenCalledWith('premium');
    expect(h.reminders[0]).toMatchObject({ action: 'daily-limit', buy: false, others: 1 });
    expect(h.reminders[0].text).toBe('Zotero Premium has reached today\'s limit and has been switched off. Enable it again in OpenReader settings tomorrow. Reading also stopped in 1 other tab.');
    expect(h.credits).not.toHaveBeenCalled();
  });

  it('refused with credits left: reminds only, nothing closed or switched off', async () => {
    const h = harness({ credits: 20 });
    await h.refusals.refused(h.readers[0], { code: 'quota-exceeded', tier: 'premium', minutes: 0.7 });
    expect(h.closed).toEqual([]);
    expect(h.switchOff).not.toHaveBeenCalled();
    expect(h.reminders).toEqual([{
      reader: 'this', action: 'short', tier: 'premium', buy: true, others: 0,
      text: 'Not enough remaining time on Zotero Premium for this voice. Choose a cheaper voice, or add more time.',
    }]);
  });

  it('a voice being switched to: the reader reading with another voice keeps its player', async () => {
    const h = harness({ credits: 0 });
    h.readers[0].tier = 'fish';
    await h.refusals.refused(h.readers[0], { code: 'quota-exceeded', tier: 'premium', minutes: 0 });
    expect(h.closed).toEqual(['other premium']);
    expect(h.reminders[0]).toMatchObject({ reader: 'this', action: 'used-up', others: 1 });
  });

  it('says nothing of other tabs when none was stopped', async () => {
    const h = harness({ credits: 0 });
    h.readers[1].open = false;
    await h.refusals.refused(h.readers[0], { code: 'quota-exceeded', tier: 'premium', minutes: 0 });
    expect(h.reminders[0].others).toBe(0);
    expect(h.reminders[0].text).toBe('Zotero Premium has no remaining time and has been switched off. Add more time, then enable it again in OpenReader settings.');
  });

  it('does nothing twice: a tier already off, or one being switched off, is left alone', async () => {
    const h = harness({ credits: 0, on: false });
    await h.refusals.refused(h.readers[0], { code: 'quota-exceeded', tier: 'premium', minutes: 0 });
    expect(h.reminders).toEqual([]);
    const g = harness({ credits: 0 });
    await Promise.all([
      g.refusals.refused(g.readers[0], { code: 'quota-exceeded', tier: 'premium', minutes: 0 }),
      g.refusals.refused(g.readers[1], { code: 'quota-exceeded', tier: 'premium', minutes: 0 }),
    ]);
    expect(g.switchOff).toHaveBeenCalledTimes(1);
    expect(g.reminders).toHaveLength(1);
  });
});
