// Vazões: m³/s; concentrações: mg/L; tempo: dias; coeficientes: base e, dia⁻¹.
export const defaults = Object.freeze({
  qRef: 1.2, fraction: 50, committed: 0.25, demand: 0.1,
  qRiver: 0.8, qEffluent: 0.04, doRiver: 7, doEffluent: 1,
  bodRiver: 2, bodEffluent: 60, temperature: 20, saturation: 9.09,
  k1: 0.23, k2: 0.6, kb: 0.23, theta1: 1.047, theta2: 1.024,
  velocity: 0.25, length: 50, doTarget: 5,
});

export const fields = Object.freeze({
  qRef: ['Vazão de referência', 'm³/s', 0, 1e7],
  fraction: ['Parcela adotada como outorgável', '%', 0, 100],
  committed: ['Captações já comprometidas', 'm³/s', 0, 1e7],
  demand: ['Nova captação pretendida', 'm³/s', 0, 1e7],
  qRiver: ['Vazão do rio antes do lançamento', 'm³/s', 0.000001, 1e7],
  qEffluent: ['Vazão do efluente', 'm³/s', 0, 1e7],
  doRiver: ['OD no rio', 'mg/L', 0, 30],
  doEffluent: ['OD no efluente', 'mg/L', 0, 30],
  bodRiver: ['DBO₅ no rio', 'mg/L', 0, 1e5],
  bodEffluent: ['DBO₅ no efluente', 'mg/L', 0, 1e5],
  temperature: ['Temperatura da mistura', '°C', 0, 40],
  saturation: ['OD de saturação nas condições locais', 'mg/L', 0.01, 30],
  k1: ['K₁ a 20 °C · desoxigenação', 'dia⁻¹', 0.000001, 100],
  k2: ['K₂ a 20 °C · reaeração', 'dia⁻¹', 0.000001, 100],
  kb: ['Kᵦ a 20 °C · ensaio DBO', 'dia⁻¹', 0.000001, 100],
  theta1: ['θ₁ · correção de K₁', '—', 1, 1.2],
  theta2: ['θ₂ · correção de K₂', '—', 1, 1.2],
  velocity: ['Velocidade média no trecho', 'm/s', 0.0001, 20],
  length: ['Extensão simulada', 'km', 0.001, 5000],
  doTarget: ['Critério de OD mínimo adotado', 'mg/L', 0, 30],
});

export function validate(input) {
  for (const [key, [label, , min, max]] of Object.entries(fields)) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < min || input[key] > max) {
      throw new Error(`${label}: informe um número entre ${min} e ${max}.`);
    }
  }
}

export function availability(p) {
  const ceiling = p.qRef * p.fraction / 100;
  const available = ceiling - p.committed;
  const balance = available - p.demand;
  return { ceiling, available, balance, withinBudget: balance >= -1e-12 };
}

// Forma estável também quando K₁ ≈ K₂; expm1 evita cancelamento numérico.
export function deficitAt(t, l0, d0, k1, k2) {
  const delta = k2 - k1;
  const response = Math.abs(delta * t) < 1e-7
    ? t * (1 - delta * t / 2 + (delta * t) ** 2 / 6)
    : -Math.expm1(-delta * t) / delta;
  // Para delta negativo grande, a forma acima pode provocar 0 × Infinity.
  const oxygenDemand = delta * t < -500
    ? k1 * l0 * (Math.exp(-k1 * t) - Math.exp(-k2 * t)) / delta
    : k1 * l0 * Math.exp(-k1 * t) * response;
  return oxygenDemand + d0 * Math.exp(-k2 * t);
}

export function simulate(p) {
  validate(p);
  const budget = availability(p);
  const qMix = p.qRiver + p.qEffluent;
  const doMix = (p.qRiver * p.doRiver + p.qEffluent * p.doEffluent) / qMix;
  const bod5Mix = (p.qRiver * p.bodRiver + p.qEffluent * p.bodEffluent) / qMix;
  const l0 = bod5Mix / -Math.expm1(-5 * p.kb);
  const d0 = p.saturation - doMix;
  const k1 = p.k1 * p.theta1 ** (p.temperature - 20);
  const k2 = p.k2 * p.theta2 ** (p.temperature - 20);
  const endTime = p.length * 1000 / p.velocity / 86400;
  const at = t => ({
    time: t, distance: t * p.velocity * 86400 / 1000,
    oxygen: p.saturation - deficitAt(t, l0, d0, k1, k2),
    ultimateBod: l0 * Math.exp(-k1 * t),
  });
  // dD/dt = K₁L₀ exp(-K₁t) − K₂D(t). Existe no máximo um extremo interior.
  let criticalTime = null;
  if (l0 > 0) {
    const delta = k2 - k1;
    if (Math.abs(delta) < 1e-10 * Math.max(k1, k2)) {
      criticalTime = 1 / k1 - d0 / (k1 * l0);
    } else {
      const correction = -d0 * delta / (k1 * l0);
      if (correction > -1) {
        criticalTime = (Math.log1p(delta / k1) + Math.log1p(correction)) / delta;
      }
    }
  }
  if (!Number.isFinite(criticalTime) || criticalTime < 0) criticalTime = null;
  const candidates = [at(0), at(endTime)];
  if (criticalTime !== null && criticalTime <= endTime) candidates.push(at(criticalTime));
  const minimum = candidates.reduce((a, b) => a.oxygen < b.oxygen ? a : b);
  const points = Array.from({ length: 241 }, (_, i) => at(endTime * i / 240));
  if (minimum.time > 0 && minimum.time < endTime) {
    points.push(minimum); points.sort((a, b) => a.time - b.time);
  }
  const warnings = [];
  if (minimum.oxygen < 0) warnings.push('O modelo prevê OD negativo. Há indicação de esgotamento do oxigênio; os valores após esse esgotamento não representam concentrações físicas e exigem outro tratamento do regime anóxico.');
  if (doMix > p.saturation) warnings.push('A mistura está supersaturada. Confirme OD medido e saturação nas condições locais.');
  if (p.doTarget > p.saturation) warnings.push('O critério de OD informado supera a saturação adotada. Revise os parâmetros locais.');
  if (!budget.withinBudget) warnings.push('A nova demanda supera o saldo do balanço hídrico informado.');
  return {
    budget, qMix, doMix, bod5Mix, l0, d0, k1, k2, endTime, minimum,
    criticalPoint: criticalTime === null ? null : at(criticalTime),
    withinOxygenTarget: minimum.oxygen >= p.doTarget - 1e-10,
    effluentLoad: p.qEffluent * p.bodEffluent * 86.4,
    points, warnings,
  };
}
