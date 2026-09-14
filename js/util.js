// Small helpers, no dependencies.

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

export const pad2 = (n) => String(n).padStart(2, '0');

// ISO date (local) yyyy-mm-dd
export const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// weekday with Monday = 0 ... Sunday = 6
export const weekdayMon = (d) => (d.getDay() + 6) % 7;

export const WD = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

export const fmtDay = (iso) => {
  const d = parseISO(iso);
  return `${WD[weekdayMon(d)]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3).toLowerCase()}`;
};

export const fmtDuration = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
};

export const fmtNum = (n) =>
  (n == null || n === '') ? '—' : String(n).replace('.', ',');

export const daysBetween = (isoA, isoB) =>
  Math.round((parseISO(isoB) - parseISO(isoA)) / 86400000);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// App version — bump on each notable release; shown in Profilo and in feedback.
export const APP_VERSION = '0.6 beta';
export const FEEDBACK_EMAIL = 'grmmrk@gmail.com';

// Accent presets — swap the app's primary color.
export const ACCENTS = {
  coral:  { name: 'Coral',   main: '#FF5A3C', grad: 'linear-gradient(135deg,#FF5A3C,#FF8A3C)' },
  blu:    { name: 'Blu',     main: '#3B82F6', grad: 'linear-gradient(135deg,#3B82F6,#60A5FA)' },
  viola:  { name: 'Viola',   main: '#7C3AED', grad: 'linear-gradient(135deg,#7C3AED,#A855F7)' },
  verde:  { name: 'Verde',   main: '#16A34A', grad: 'linear-gradient(135deg,#16A34A,#22C55E)' },
  rosa:   { name: 'Rosa',    main: '#EC4899', grad: 'linear-gradient(135deg,#EC4899,#F472B6)' },
  ambra:  { name: 'Ambra',   main: '#F59E0B', grad: 'linear-gradient(135deg,#F59E0B,#FBBF24)' },
  ciano:  { name: 'Ciano',   main: '#0EA5E9', grad: 'linear-gradient(135deg,#0EA5E9,#38BDF8)' },
  rosso:  { name: 'Rosso',   main: '#EF4444', grad: 'linear-gradient(135deg,#EF4444,#F87171)' },
};

export const GOALS = {
  massa:          'Massa muscolare',
  definizione:    'Definizione',
  forza:          'Forza',
  ricomposizione: 'Ricomposizione',
  mantenimento:   'Mantenimento',
};

let toastTimer;
export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}
