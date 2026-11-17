// Kleiner, freundlicher Agent als inline-SVG mit Gesichtsausdrücken.
// Stimmungen: neutral, denkt, freut, besorgt, verwirrt

const LABELS = {
  neutral: 'Der Agent wartet auf deinen Plan.',
  denkt: 'Der Agent arbeitet.',
  freut: 'Der Agent freut sich.',
  besorgt: 'Der Agent schaut besorgt.',
  verwirrt: 'Der Agent ist verwirrt.'
};

function face(mood) {
  switch (mood) {
    case 'denkt':
      return `
        <circle cx="47" cy="56" r="5" fill="#1d3b3c"/><circle cx="73" cy="56" r="5" fill="#1d3b3c"/>
        <circle cx="49" cy="54" r="1.6" fill="#fff"/><circle cx="75" cy="54" r="1.6" fill="#fff"/>
        <path d="M52 73h16" stroke="#1d3b3c" stroke-width="3.2" stroke-linecap="round"/>`;
    case 'freut':
      return `
        <path d="M40 58q7-9 14 0M66 58q7-9 14 0" fill="none" stroke="#1d3b3c" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M46 68q14 13 28 0" fill="#1d3b3c" stroke="#1d3b3c" stroke-width="2.6" stroke-linejoin="round"/>
        <circle cx="38" cy="67" r="4" fill="#f4a9a0" opacity=".7"/><circle cx="82" cy="67" r="4" fill="#f4a9a0" opacity=".7"/>`;
    case 'besorgt':
      return `
        <path d="M39 47l12 4M81 47l-12 4" stroke="#1d3b3c" stroke-width="3" stroke-linecap="round"/>
        <circle cx="46" cy="58" r="5" fill="#1d3b3c"/><circle cx="74" cy="58" r="5" fill="#1d3b3c"/>
        <path d="M48 76q12-9 24 0" fill="none" stroke="#1d3b3c" stroke-width="3.2" stroke-linecap="round"/>`;
    case 'verwirrt':
      return `
        <circle cx="46" cy="57" r="6.5" fill="none" stroke="#1d3b3c" stroke-width="3"/><circle cx="46" cy="57" r="2" fill="#1d3b3c"/>
        <circle cx="74" cy="57" r="4" fill="#1d3b3c"/>
        <path d="M48 73l6-3 6 3 6-3 6 3" fill="none" stroke="#1d3b3c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    default:
      return `
        <circle cx="46" cy="57" r="5" fill="#1d3b3c"/><circle cx="74" cy="57" r="5" fill="#1d3b3c"/>
        <circle cx="47.5" cy="55.5" r="1.6" fill="#fff"/><circle cx="75.5" cy="55.5" r="1.6" fill="#fff"/>
        <path d="M50 70q10 7 20 0" fill="none" stroke="#1d3b3c" stroke-width="3.2" stroke-linecap="round"/>`;
  }
}

export function mascotSVG(mood = 'neutral', size = 120) {
  const m = LABELS[mood] ? mood : 'neutral';
  const lamp = m === 'denkt' ? '#f2b33d' : m === 'besorgt' ? '#e0675a' : m === 'freut' ? '#5cc48a' : '#8fd3cc';
  return `
<svg class="mascot mascot-${m}" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${LABELS[m]}">
  <line x1="60" y1="10" x2="60" y2="24" stroke="#3e7f7c" stroke-width="3" stroke-linecap="round"/>
  <circle class="mascot-lamp" cx="60" cy="9" r="6" fill="${lamp}"/>
  <rect x="24" y="24" width="72" height="66" rx="22" fill="#5aa6a1"/>
  <rect x="31" y="34" width="58" height="48" rx="16" fill="#e9f6f4"/>
  <rect x="16" y="46" width="9" height="20" rx="4" fill="#3e7f7c"/>
  <rect x="95" y="46" width="9" height="20" rx="4" fill="#3e7f7c"/>
  <g class="mascot-face">${face(m)}</g>
  <rect x="42" y="92" width="36" height="16" rx="7" fill="#3e7f7c"/>
  <circle cx="60" cy="100" r="3.2" fill="#e9f6f4"/>
</svg>`;
}
