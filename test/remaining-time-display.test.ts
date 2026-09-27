import { expect, it } from 'vitest';
import { t } from '../src/core/l10n';
import { remainingTimeLines } from '../src/ui/remaining-time';
it('shows one compact line without section titles and retains selection and terminal states', () => {
  expect(remainingTimeLines({ status: 'ready', scope: 'document', seconds: 1085, sectionSeconds: 45, sectionTitle: 'A long title '.repeat(50) }, t)).toEqual([{ text: 'Doc <19 min · Section <1 min' }]);
  expect(remainingTimeLines({ status: 'ready', scope: 'selection', seconds: 90 }, t)).toEqual([{ text: 'Selection <2 min' }]);
  expect(remainingTimeLines({ status: 'finished', scope: 'document', seconds: 0 }, t)).toEqual([{ text: 'Finished' }]);
  expect(remainingTimeLines({ status: 'estimating', scope: 'document', seconds: null }, t)).toEqual([{ text: 'Estimating…' }]);
  expect(remainingTimeLines({ status: 'unavailable', scope: 'document', seconds: null }, t)).toEqual([{ text: 'Estimate unavailable' }]);
});
it.each([[0, 1], [0.1, 1], [59.99, 1], [60, 2], [60.01, 2], [120, 3]])('formats %s seconds with a positive strict minute bound', (seconds, minutes) => {
  expect(remainingTimeLines({ status: 'ready', scope: 'document', seconds }, t)).toEqual([{ text: `Doc <${minutes} min` }]);
});
