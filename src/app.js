import { defaults, fields, simulate, validate } from './model.js';

const form = document.querySelector('#study-form');
const $ = selector => document.querySelector(selector);
const number = (value, digits = 3) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
const metadata = ['project', 'waterbody', 'location', 'responsible', 'reference', 'criteria', 'sources'];
const metadataLabels = ['Empreendimento', 'Corpo hídrico', 'Município / bacia', 'Responsável técnico', 'Referência hidrológica', 'Enquadramento e critérios', 'Fontes e observações'];
let isExample = true;
let dirty = false;
let lastResult;
let computedAt;

const groups = {
  'availability-fields': ['qRef', 'fraction', 'committed', 'demand'],
  'mixing-fields': ['qRiver', 'qEffluent', 'doRiver', 'doEffluent', 'bodRiver', 'bodEffluent'],
  'reach-fields': ['temperature', 'saturation', 'velocity', 'length', 'doTarget'],
  'kinetic-fields': ['k1', 'k2', 'kb', 'theta1', 'theta2'],
};
for (const [container, keys] of Object.entries(groups)) {
  for (const key of keys) {
    const [title, unit, min, max] = fields[key];
    const label = document.createElement('label');
    label.append(document.createTextNode(title));
    const wrapper = document.createElement('div'); wrapper.className = 'input-unit';
    const input = document.createElement('input');
    Object.assign(input, { name: key, id: key, type: 'number', min, max, step: 'any', required: true, value: defaults[key] });
    const suffix = document.createElement('span'); suffix.textContent = unit;
    wrapper.append(input, suffix); label.append(wrapper); $(`#${container}`).append(label);
  }
}

function getInputs() {
  return Object.fromEntries(Object.keys(fields).map(key => [key, form.elements.namedItem(key).value === '' ? NaN : Number(form.elements.namedItem(key).value)]));
}
function getMetadata() { return Object.fromEntries(metadata.map(key => [key, form.elements.namedItem(key).value.trim()])); }
function showError(error) { $('#error').textContent = error.message; $('#error').hidden = false; }
function node(tag, text, className) {
  const el = document.createElement(tag); if (text !== undefined) el.textContent = text;
  if (className) el.className = className; return el;
}
function metric(title, value, unit, foot, problem = false) {
  const el = node('div', undefined, `metric${problem ? ' problem' : ''}`);
  const strong = node('strong', value, 'metric-value'); strong.append(node('small', unit));
  el.append(node('span', title, 'metric-label'), strong, node('span', foot, 'metric-foot')); return el;
}
function detail(label, value) {
  const row = node('div'); row.append(node('dt', label), node('dd', value)); return row;
}
function check(text, ok) {
  const el = node('div', undefined, `check${ok ? '' : ' attention'}`);
  el.append(node('span', ok ? '✓' : '!', 'check-icon'), node('span', text)); return el;
}
function renderChart(p, r) {
  const NS = 'http://www.w3.org/2000/svg';
  function svgNode(tag, attrs = {}, content) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    if (content !== undefined) el.textContent = content; return el;
  }
  const width = 960, height = 310, left = 57, right = 22, top = 27, bottom = 49;
  const low = Math.min(0, Math.floor(r.minimum.oxygen - 0.5));
  const high = Math.ceil(Math.max(p.saturation, p.doTarget, ...r.points.map(pt => pt.oxygen)) + 0.5);
  const x = d => left + d / p.length * (width - left - right);
  const y = od => height - bottom - (od - low) / (high - low) * (height - top - bottom);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': 'chart-title chart-desc' });
  svg.append(svgNode('title', { id: 'chart-title' }, 'Perfil de OD calculado por Streeter–Phelps'));
  svg.append(svgNode('desc', { id: 'chart-desc' }, `OD mínimo de ${number(r.minimum.oxygen)} mg/L a ${number(r.minimum.distance)} km. Critério informado de ${number(p.doTarget)} mg/L.`));
  for (let i = 0; i <= 5; i++) {
    const od = low + (high - low) * i / 5;
    svg.append(svgNode('line', { x1: left, x2: width - right, y1: y(od), y2: y(od), class: 'grid-line' }));
    svg.append(svgNode('text', { x: left - 11, y: y(od) + 4, 'text-anchor': 'end' }, number(od, 1)));
    const distance = p.length * i / 5;
    svg.append(svgNode('text', { x: x(distance), y: height - bottom + 21, 'text-anchor': 'middle' }, number(distance, 1)));
  }
  svg.append(svgNode('text', { x: left, y: 13 }, 'OD (mg/L)'));
  svg.append(svgNode('text', { x: width / 2, y: height - 5, 'text-anchor': 'middle' }, 'Distância a jusante do lançamento (km)'));
  svg.append(svgNode('line', { x1: left, x2: width - right, y1: y(p.doTarget), y2: y(p.doTarget), stroke: '#b18a42', 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }));
  const curve = r.points.map((point, i) => `${i ? 'L' : 'M'}${x(point.distance).toFixed(3)},${y(point.oxygen).toFixed(3)}`).join(' ');
  svg.append(svgNode('path', { d: curve, fill: 'none', stroke: '#167e73', 'stroke-width': 2.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  const dot = svgNode('circle', { cx: x(r.minimum.distance), cy: y(r.minimum.oxygen), r: 4.5, fill: '#167e73', stroke: '#fff', 'stroke-width': 2 });
  dot.append(svgNode('title', {}, `Mínimo no trecho: ${number(r.minimum.oxygen)} mg/L a ${number(r.minimum.distance)} km`)); svg.append(dot);
  $('#chart').replaceChildren(svg);
}

function calculate() {
  try {
    isExample = form.elements.namedItem('scenarioKind').value === 'example';
    const p = getInputs(), r = simulate(p), m = getMetadata();
    computedAt = new Date(); lastResult = r; dirty = false;
    $('#error').hidden = true;
    $('#scenario-state').textContent = isExample ? 'Cenário demonstrativo' : 'Cenário em edição · critérios informados pelo usuário';
    $('#result-state').textContent = `${isExample ? 'EXEMPLO · ' : ''}Calculado em ${computedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${m.project || 'Estudo sem identificação'} · Horário de Brasília.`;
    $('#budget-preview').replaceChildren(node('span', 'Saldo após a nova captação · parcela de referência − comprometida − nova demanda'), node('strong', `${number(r.budget.balance)} m³/s`));
    $('#metrics').replaceChildren(
      metric('Saldo hídrico após a demanda', number(r.budget.balance), 'm³/s', r.budget.withinBudget ? 'Dentro do orçamento informado' : 'Demanda acima do saldo informado', !r.budget.withinBudget),
      metric('OD mínimo no trecho', number(r.minimum.oxygen), 'mg/L', r.minimum.oxygen < 0 ? 'Esgotamento de oxigênio previsto' : r.withinOxygenTarget ? 'Alcança o critério de OD informado' : 'Abaixo do critério de OD informado', !r.withinOxygenTarget || r.minimum.oxygen < 0),
      metric('Local do OD mínimo', number(r.minimum.distance, 2), 'km', `${number(r.minimum.time, 2)} dias após a mistura`),
      metric('Carga de DBO₅ do lançamento', number(r.effluentLoad, 2), 'kg/dia', 'Carga do efluente, antes da mistura'),
    );
    renderChart(p, r);
    $('#chart-description').textContent = `Mistura inicial: ${number(r.doMix)} mg/L de OD. Mínimo no trecho: ${number(r.minimum.oxygen)} mg/L a ${number(r.minimum.distance)} km. Fim do trecho: ${number(r.points.at(-1).oxygen)} mg/L. Critério adotado: ${number(p.doTarget)} mg/L.${r.minimum.oxygen < 0 ? ' A parcela negativa da curva é uma extrapolação matemática, sem significado físico.' : ''}`;
    $('#calculation-details').replaceChildren(
      detail('Parcela de referência adotada', `${number(r.budget.ceiling)} m³/s`),
      detail('Saldo antes da nova captação', `${number(r.budget.available)} m³/s`),
      detail('Vazão após mistura', `${number(r.qMix)} m³/s`),
      detail('OD inicial após mistura', `${number(r.doMix)} mg/L`),
      detail('DBO₅ após mistura', `${number(r.bod5Mix)} mg/L`),
      detail('DBO última inicial (L₀)', `${number(r.l0)} mg/L`),
      detail('Déficit inicial (D₀)', `${number(r.d0)} mg/L`),
      detail('K₁ / K₂ na temperatura adotada', `${number(r.k1, 4)} / ${number(r.k2, 4)} dia⁻¹`),
      detail('Tempo total de percurso', `${number(r.endTime)} dias`),
      detail('Extremo analítico a jusante', r.criticalPoint ? `${number(r.criticalPoint.distance, 2)} km${r.criticalPoint.distance > p.length ? ' (fora do trecho)' : ''}` : 'Sem extremo interior a jusante'),
    );
    $('#checks').replaceChildren(
      check(r.budget.withinBudget ? 'A demanda cabe no balanço informado. Não equivale à disponibilidade oficial para outorga.' : 'A demanda excede o saldo do balanço informado.', r.budget.withinBudget),
      check(r.minimum.oxygen < 0 ? 'Há esgotamento previsto de OD. O regime aeróbio do modelo deixa de ser aplicável.' : r.withinOxygenTarget ? 'O OD calculado alcança o critério informado em todo o trecho simulado.' : 'O OD calculado fica abaixo do critério informado em parte do trecho.', r.withinOxygenTarget && r.minimum.oxygen >= 0),
      check(metadata.every(key => m[key]) ? 'Campos de identificação e fontes preenchidos; conteúdo sujeito à conferência técnica.' : 'Complete identificação, fontes e fundamento dos critérios antes de usar o relatório técnico.', metadata.every(key => m[key])),
      check('Conferência das exigências vigentes do SP Águas e responsabilidade técnica pendentes. Sem certificação de conformidade.', false),
    );
    $('#warnings').replaceChildren(...r.warnings.map(w => node('p', w, 'warning')));
    $('#report-metadata').replaceChildren(...metadata.map((key, i) => node('p', `${metadataLabels[i]}: ${m[key] || 'Não informado'}`)));
    $('#input-table').replaceChildren(...Object.entries(fields).map(([key, [title, unit]]) => {
      const row = node('tr'); row.append(node('td', title), node('td', number(p[key], 6)), node('td', unit)); return row;
    }));
    return true;
  } catch (error) { showError(error); return false; }
}

form.addEventListener('submit', event => {
  event.preventDefault(); if (calculate()) $('#resultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
form.addEventListener('input', () => {
  isExample = form.elements.namedItem('scenarioKind').value === 'example';
  dirty = true;
  $('#scenario-state').textContent = isExample ? 'Exemplo em edição · recalcular para atualizar' : 'Alterações pendentes de cálculo';
  $('#result-state').textContent = 'Resultados anteriores: há alterações não calculadas. Clique em Calcular estudo para atualizar.';
  $('#budget-preview').textContent = 'Balanço anterior desatualizado. Calcule o estudo para atualizar.';
});
$('#example').addEventListener('click', () => {
  if (dirty || !isExample || metadata.some(key => form.elements.namedItem(key).value.trim())) {
    if (!window.confirm('Carregar o exemplo substitui os dados do formulário. Salve o estudo JSON antes de continuar, se necessário. Deseja carregar?')) return;
  }
  for (const key of Object.keys(defaults)) form.elements.namedItem(key).value = defaults[key];
  for (const key of metadata) form.elements.namedItem(key).value = '';
  form.elements.namedItem('scenarioKind').value = 'example'; isExample = true; calculate();
});
$('#export').addEventListener('click', () => {
  if (!form.reportValidity() || !calculate()) return;
  const study = { schemaVersion: 1, application: 'Engenharia Hídrica', modelVersion: '0.1.0', savedAt: computedAt.toISOString(), illustrative: isExample, metadata: getMetadata(), inputs: getInputs(), results: lastResult, limitations: 'Modelo preliminar, sem certificação de conformidade com SP Águas. Consultar hipóteses e limites no aplicativo.' };
  const blob = new Blob([JSON.stringify(study, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = node('a');
  link.href = url; link.download = `estudo-hidrico-${computedAt.toISOString().slice(0, 10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#import').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('O arquivo deve ter até 2 MB.');
    const data = JSON.parse(await file.text());
    if (data.schemaVersion !== 1 || !data.inputs || !data.metadata || typeof data.illustrative !== 'boolean') throw new Error('Arquivo de estudo incompatível. Use um JSON exportado por este aplicativo.');
    validate(data.inputs);
    for (const key of metadata) if (typeof data.metadata[key] !== 'string' || data.metadata[key].length > (key === 'sources' ? 6000 : key === 'criteria' ? 300 : 200)) throw new Error('Identificação inválida no arquivo.');
    if ((dirty || !isExample || metadata.some(key => form.elements.namedItem(key).value.trim())) && !window.confirm('Importar substitui o formulário atual. Deseja continuar?')) return;
    for (const key of Object.keys(defaults)) form.elements.namedItem(key).value = data.inputs[key];
    for (const key of metadata) form.elements.namedItem(key).value = data.metadata[key];
    isExample = data.illustrative; form.elements.namedItem('scenarioKind').value = isExample ? 'example' : 'study'; calculate();
  } catch (error) { showError(error); }
  finally { event.target.value = ''; }
});
$('#print').addEventListener('click', () => {
  if (!form.reportValidity() || !calculate()) return;
  window.print();
});
// Impressão pelo menu do navegador também precisa dos valores atuais.
window.addEventListener('beforeprint', () => {
  if (!calculate()) $('#result-state').textContent = 'RELATÓRIO INVÁLIDO: há dados de entrada inválidos. Corrija o formulário e recalcule antes de utilizar estes resultados.';
});
window.addEventListener('beforeunload', event => {
  if (dirty) { event.preventDefault(); event.returnValue = ''; }
});
calculate();
