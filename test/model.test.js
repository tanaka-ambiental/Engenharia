import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, availability, deficitAt, simulate } from '../src/model.js';

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
}

test('balanço desconta compromissos e demanda sem creditar o lançamento', () => {
  const r = availability(defaults);
  close(r.ceiling, 0.6); close(r.available, 0.35); close(r.balance, 0.25);
  assert.equal(r.withinBudget, true);
  assert.equal(availability({ ...defaults, demand: 0.4 }).withinBudget, false);
  close(availability({ ...defaults, qEffluent: 100 }).balance, r.balance);
});

test('mistura conserva massas, converte DBO₅ e carga nas unidades corretas', () => {
  const r = simulate(defaults);
  close(r.qMix, 0.84);
  close(r.doMix, (0.8 * 7 + 0.04) / 0.84);
  close(r.bod5Mix, (0.8 * 2 + 0.04 * 60) / 0.84);
  close(r.l0 * (1 - Math.exp(-defaults.kb * 5)), r.bod5Mix);
  close(r.effluentLoad, 207.36);
  close(r.points[0].oxygen, r.doMix);
  close(r.endTime, 50000 / 0.25 / 86400);
});

test('sem carga orgânica, o déficit cai apenas por reaeração', () => {
  const p = { ...defaults, bodRiver: 0, bodEffluent: 0 };
  const r = simulate(p);
  close(r.points.at(-1).oxygen, p.saturation - r.d0 * Math.exp(-r.k2 * r.endTime));
  close(r.minimum.time, 0);
  assert.equal(r.criticalPoint, null);
});

test('sem lançamento preserva as concentrações do rio', () => {
  const r = simulate({ ...defaults, qEffluent: 0 });
  close(r.doMix, defaults.doRiver); close(r.bod5Mix, defaults.bodRiver);
  close(r.effluentLoad, 0);
});

test('K₁ = K₂ e taxas quase iguais são estáveis', () => {
  const t = 2.3, l0 = 12, d0 = 2, k = 0.23;
  const exact = (k * l0 * t + d0) * Math.exp(-k * t);
  close(deficitAt(t, l0, d0, k, k), exact);
  close(deficitAt(t, l0, d0, k, k + 1e-12), exact, 1e-10);
  const r = simulate({ ...defaults, k1: k, k2: k, length: 200 });
  close(r.criticalPoint.time, 1 / k - r.d0 / (k * r.l0));
});

test('correção térmica usa taxas do rio; conversão do ensaio permanece a 20 °C', () => {
  const base = simulate(defaults), hot = simulate({ ...defaults, temperature: 30 });
  close(hot.k1, defaults.k1 * defaults.theta1 ** 10);
  close(hot.k2, defaults.k2 * defaults.theta2 ** 10);
  close(hot.l0, base.l0);
});

test('solução coincide com integração numérica independente da equação de oxigênio', () => {
  for (const [k1, k2, d0] of [[0.23, 0.6, 2], [0.6, 0.23, 2], [0.23, 0.23, -1]]) {
    const dt = 0.0002, tEnd = 4, l0 = 15;
    let d = d0;
    const f = (t, value) => k1 * l0 * Math.exp(-k1 * t) - k2 * value;
    for (let i = 0; i < tEnd / dt; i++) {
      const t = i * dt, a = f(t, d), b = f(t + dt / 2, d + dt * a / 2);
      const c = f(t + dt / 2, d + dt * b / 2), e = f(t + dt, d + dt * c);
      d += dt * (a + 2 * b + 2 * c + e) / 6;
    }
    close(deficitAt(tEnd, l0, d0, k1, k2), d, 1e-9);
  }
});

test('OD mínimo considera ponto analítico e extremos do trecho', () => {
  const r = simulate({ ...defaults, length: 200 });
  assert.ok(r.minimum.time > 0 && r.minimum.time < r.endTime);
  close(r.k1 * r.l0 * Math.exp(-r.k1 * r.minimum.time) - r.k2 * deficitAt(r.minimum.time, r.l0, r.d0, r.k1, r.k2), 0);
  assert.ok(r.points.every(pt => pt.oxygen >= r.minimum.oxygen - 1e-10));
  const short = simulate({ ...defaults, length: 0.01 });
  close(short.minimum.distance, 0.01);
});

test('esgotamento de OD gera aviso e não oculta os valores negativos', () => {
  const r = simulate({ ...defaults, bodEffluent: 2000, length: 200 });
  assert.ok(r.minimum.oxygen < 0);
  assert.equal(r.withinOxygenTarget, false);
  assert.ok(r.warnings.some(w => w.includes('OD negativo')));
});

test('validação rejeita dados ausentes, não finitos ou fora de faixa', () => {
  for (const patch of [{ qRiver: 0 }, { velocity: 0 }, { k1: -1 }, { fraction: 101 }, { temperature: 50 }, { length: NaN }, { qRef: Infinity }, { saturation: '' }, { kb: undefined }]) {
    assert.throws(() => simulate({ ...defaults, ...patch }));
  }
});

test('casos extremos permitidos produzem resultados finitos', () => {
  for (const patch of [
    { k1: 100, k2: 0.000001, length: 5000, velocity: 0.0001 },
    { k1: 0.000001, k2: 100, length: 5000, velocity: 0.0001 },
    { k1: 100, k2: 100, length: 5000, velocity: 0.0001 },
    { doRiver: 30, doEffluent: 30, bodRiver: 0, bodEffluent: 0 },
  ]) {
    const r = simulate({ ...defaults, ...patch });
    assert.ok(r.points.every(pt => Number.isFinite(pt.oxygen) && Number.isFinite(pt.ultimateBod)));
    assert.ok(Number.isFinite(r.minimum.oxygen));
  }
});
