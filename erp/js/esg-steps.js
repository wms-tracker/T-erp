// esg-steps.js — Reusable step editor for ESG forms
// Usage:
//   initStepEditor('container-id', '#accentColor')
//   getSteps('container-id')  → [{step_no, description, assignee, due_date}]
//   setSteps('container-id', stepsArray)
//   clearSteps('container-id')
// Expose globally: window.esgAddStep = esgAddStep; window.esgRemoveStep = esgRemoveStep;

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function initStepEditor(containerId, accentColor) {
  accentColor = accentColor || '#2563eb';
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML =
    '<div class="step-wrap">'
    + '<div class="step-header">'
    + '<span class="step-title">📋 ขั้นตอนดำเนินการ</span>'
    + '<button type="button" class="btn-add-step" style="border-color:'+accentColor+';color:'+accentColor+'" onclick="esgAddStep(\''+containerId+'\')">+ เพิ่มขั้นตอน</button>'
    + '</div>'
    + '<div id="slist-'+containerId+'" class="slist"></div>'
    + '</div>';
}

export function esgAddStep(containerId, data) {
  data = data || {};
  const list = document.getElementById('slist-'+containerId);
  if (!list) return;
  const idx = list.children.length + 1;
  const row = document.createElement('div');
  row.className = 'step-row';
  row.dataset.cid = containerId;
  row.innerHTML =
    '<span class="snum">'+idx+'.</span>'
    + '<input type="text" class="sinp sdesc" placeholder="คำอธิบายขั้นตอน..." value="'+esc(data.description)+'">'
    + '<input type="text" class="sinp sassign" placeholder="ผู้รับผิดชอบ" value="'+esc(data.assignee)+'">'
    + '<input type="date" class="sinp sdue" value="'+(data.due_date||'')+'">'
    + '<button type="button" class="btn-remove-step" onclick="esgRemoveStep(this)">✕</button>';
  list.appendChild(row);
}

export function esgRemoveStep(btn) {
  const row = btn.closest('.step-row');
  const cid = row.dataset.cid;
  row.remove();
  _renumber(cid);
}

function _renumber(containerId) {
  const list = document.getElementById('slist-'+containerId);
  if (list) Array.from(list.querySelectorAll('.snum')).forEach((el, i) => { el.textContent = (i+1)+'.'; });
}

export function getSteps(containerId) {
  const list = document.getElementById('slist-'+containerId);
  if (!list) return [];
  return Array.from(list.querySelectorAll('.step-row')).map((row, i) => ({
    step_no:     i + 1,
    description: row.querySelector('.sdesc').value.trim(),
    assignee:    row.querySelector('.sassign').value.trim(),
    due_date:    row.querySelector('.sdue').value,
  })).filter(s => s.description);
}

export function setSteps(containerId, steps) {
  const list = document.getElementById('slist-'+containerId);
  if (!list) return;
  list.innerHTML = '';
  (steps || []).forEach(s => esgAddStep(containerId, s));
}

export function clearSteps(containerId) {
  const list = document.getElementById('slist-'+containerId);
  if (list) list.innerHTML = '';
}
