import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ConditionIcon, conditionSymbol } from '../src/components/ConditionIcon';

it('choisit les symboles WMO et conserve les couleurs de la référence', () => {
  for (const [code, symbol] of [[0, 'sun'], [1, 'partly-cloudy'], [2, 'partly-cloudy'], [3, 'cloud'], [45, 'fog'], [61, 'rain'], [71, 'snow'], [85, 'snow'], [95, 'storm']] as const) {
    expect(conditionSymbol({ code })).toBe(symbol);
    const markup = renderToStaticMarkup(createElement(ConditionIcon, { code }));
    expect(markup).toContain(`weather-symbol-${symbol}`);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('#10b8ed');
    expect(markup).toContain('#ffb900');
  }
  expect(conditionSymbol({})).toBe('unknown');
  expect(conditionSymbol({ code: 0, isDay: false })).toBe('moon');
  expect(conditionSymbol({ cloud: 40 })).toBe('partly-cloudy');
  expect(conditionSymbol({ code: 2, rain: .5 })).toBe('rain');
});
