// esg-gov.js — Module G (Governance) data layer
import { db, auth } from "./auth.js";
const uid = () => auth.currentUser?.uid ?? '';
import {
  doc, addDoc, updateDoc, deleteDoc, getDocs,
  collection, query, where, limit, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Collection names ─────────────────────────────────────────────────────────
export const C = {
  AUDIT:  'govAudit',
  LEGAL:  'govLegal',
  RISK:   'govRisk',
  ETHICS: 'govEthics',
};

export const DEPTS = [
  'Outbound (OB)', 'Inbound (IB)', 'Inventory', 'Logistics / 3PL',
  'Transportation', 'Safety & Environment', 'Warehouse Management', 'ทั้งองค์กร',
];

export const AUDIT_TYPES = [
  { key: 'internal',   label: 'Internal Audit (ภายใน)'             },
  { key: 'external',   label: 'External Audit (ภายนอก)'            },
  { key: 'regulatory', label: 'Regulatory Inspection (หน่วยงานรัฐ)' },
  { key: 'supplier',   label: 'Supplier / 3PL Audit'               },
];

export const SEVERITIES = [
  { key: 'low',      label: 'Low (ต่ำ)'        },
  { key: 'medium',   label: 'Medium (กลาง)'    },
  { key: 'high',     label: 'High (สูง)'       },
  { key: 'critical', label: 'Critical (วิกฤต)' },
];

export const AUDIT_STATUSES = [
  { key: 'open',        label: 'Open (เปิด)'       },
  { key: 'in_progress', label: 'In Progress'       },
  { key: 'closed',      label: 'Closed (ปิดแล้ว)'  },
];

export const LEGAL_CATS = [
  { key: 'environmental', label: 'Environmental (สิ่งแวดล้อม)'   },
  { key: 'safety',        label: 'Safety & Health (ความปลอดภัย)' },
  { key: 'labor',         label: 'Labor (แรงงาน)'                },
  { key: 'fire',          label: 'Fire & Building (อาคาร/ไฟ)'    },
  { key: 'quality',       label: 'Quality (คุณภาพ)'              },
  { key: 'other',         label: 'Other (อื่นๆ)'                  },
];

export const LEGAL_STATUSES = [
  { key: 'compliant',     label: 'Compliant ✅'       },
  { key: 'in_progress',   label: 'In Progress 🔄'     },
  { key: 'non_compliant', label: 'Non-Compliant ❌'   },
  { key: 'na',            label: 'N/A'                },
];

export const RISK_CATS = [
  { key: 'operational',   label: 'Operational (ปฏิบัติการ)'   },
  { key: 'environmental', label: 'Environmental (สิ่งแวดล้อม)' },
  { key: 'safety',        label: 'Safety & Health'             },
  { key: 'financial',     label: 'Financial (การเงิน)'         },
  { key: 'legal',         label: 'Legal / Regulatory'          },
  { key: 'reputational',  label: 'Reputational (ชื่อเสียง)'    },
];

export const RISK_STATUSES = [
  { key: 'active',    label: 'Active (กำลังจัดการ)' },
  { key: 'mitigated', label: 'Mitigated (ลดแล้ว)'   },
  { key: 'accepted',  label: 'Accepted (ยอมรับ)'    },
  { key: 'closed',    label: 'Closed (ปิด)'          },
];

export const ETHICS_TYPES = [
  { key: 'training',       label: 'Training (อบรม)'                   },
  { key: 'declaration',    label: 'Declaration (คำประกาศ/ลงนาม)'      },
  { key: 'policy_review',  label: 'Policy Review (ทบทวนนโยบาย)'      },
  { key: 'disclosure',     label: 'Disclosure (เปิดเผยข้อมูล)'        },
];

// ── Generic helpers ───────────────────────────────────────────────────────────
function ym(year, month) { return { year: Number(year), month: Number(month) }; }

async function addRec(col, data) {
  const ref = await addDoc(collection(db, col), {
    ...data, uid: uid(), createdAt: serverTimestamp(),
  });
  return ref.id;
}

async function updateRec(col, id, data) {
  await updateDoc(doc(db, col, id), {
    ...data, updatedBy: uid(), updatedAt: serverTimestamp(),
  });
}

export async function deleteRec(col, id) {
  await deleteDoc(doc(db, col, id));
}

async function listByMonth(col, year, month, maxRows = 100) {
  const q = query(
    collection(db, col),
    where('year', '==', Number(year)),
    where('month', '==', Number(month)),
    limit(maxRows),
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return rows;
}

// ── Audit ─────────────────────────────────────────────────────────────────────
export async function saveAudit(data) {
  const { id, ...rest } = data;
  const payload = { ...ym(rest.year, rest.month), ...rest };
  if (id) { await updateRec(C.AUDIT, id, payload); return id; }
  return addRec(C.AUDIT, payload);
}
export const listAudit = (y, m) => listByMonth(C.AUDIT, y, m);

// ── Legal / Compliance ────────────────────────────────────────────────────────
export async function saveLegal(data) {
  const { id, ...rest } = data;
  const payload = { ...ym(rest.year, rest.month), ...rest };
  if (id) { await updateRec(C.LEGAL, id, payload); return id; }
  return addRec(C.LEGAL, payload);
}
export const listLegal = (y, m) => listByMonth(C.LEGAL, y, m);

// ── Risk register ─────────────────────────────────────────────────────────────
export async function saveRisk(data) {
  const { id, ...rest } = data;
  const likelihood  = Number(rest.likelihood) || 0;
  const impact      = Number(rest.impact)     || 0;
  const risk_score  = likelihood * impact;
  const payload = { ...ym(rest.year, rest.month), ...rest, risk_score };
  if (id) { await updateRec(C.RISK, id, payload); return id; }
  return addRec(C.RISK, payload);
}
export const listRisk = (y, m) => listByMonth(C.RISK, y, m);

// ── Ethics / Anti-corruption ──────────────────────────────────────────────────
export async function saveEthics(data) {
  const { id, ...rest } = data;
  const payload = { ...ym(rest.year, rest.month), ...rest };
  if (id) { await updateRec(C.ETHICS, id, payload); return id; }
  return addRec(C.ETHICS, payload);
}
export const listEthics = (y, m) => listByMonth(C.ETHICS, y, m);

// ── Monthly summary ───────────────────────────────────────────────────────────
export async function govMonthSummary(year, month) {
  const [audits, legals, risks, ethics] = await Promise.all([
    listAudit(year, month),
    listLegal(year, month),
    listRisk(year, month),
    listEthics(year, month),
  ]);
  const sum = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return {
    audit_total:      audits.length,
    audit_open:       audits.filter(a => a.audit_status !== 'closed').length,
    audit_critical:   audits.filter(a => a.severity === 'critical' || a.severity === 'high').length,
    legal_compliant:  legals.filter(l => l.compliance_status === 'compliant').length,
    legal_nc:         legals.filter(l => l.compliance_status === 'non_compliant').length,
    legal_total:      legals.length,
    risk_active:      risks.filter(r => r.risk_status === 'active').length,
    risk_high:        risks.filter(r => (r.risk_score || 0) >= 10).length,
    risk_avg_score:   risks.length ? Math.round(sum(risks,'risk_score') / risks.length * 10) / 10 : 0,
    ethics_sessions:  ethics.length,
    ethics_trainees:  sum(ethics, 'participants'),
  };
}
