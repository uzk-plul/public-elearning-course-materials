// Vergleicht Embedding-Modelle unter Spielbedingungen (Brett mit 12 Wörtern aus dem Pool).
// Nicht Teil des Spiels – nur zur Nachvollziehbarkeit der Modellwahl. Braucht einmalig:
//   npm install @huggingface/transformers@4.3.2   (in einem beliebigen Ordner)
// Aufruf im Repo-Root: node wortnetz/scripts/compare-models.mjs
// Lädt beim ersten Lauf ca. 550 MB Modelle von Hugging Face herunter.
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';
const pools = Object.fromEntries(JSON.parse(readFileSync(new URL('../data/wordlists.json', import.meta.url), 'utf8')).pools.map(p => [p.id, p.words]));
const PAIRS = {
  gemischt: [['Biene','Honig'],['Clown','Zirkus'],['Ritter','Burg'],['Tasten','Klavier'],['Bogen','Geige'],['Weltall','Rakete'],['Segel','Schiff'],['Tor','Fußball'],['Braut','Hochzeit'],['Thron','König'],['Norden','Kompass'],['Gold','Schatz'],['Flamme','Feuer'],['sauer','Zitrone']],
  alltag: [['Zähne','Zahnbürste'],['aufwachen','Wecker'],['schneiden','Schere'],['Nagel','Hammer'],['Wunde','Pflaster'],['Brief','Briefkasten'],['Film','Kino'],['braten','Pfanne'],['Tee','Tasse'],['Reise','Koffer']],
  uni: [['Bücher','Bibliothek'],['Essen','Mensa'],['abschreiben','Plagiat'],['Reagenzglas','Labor'],['Doktortitel','Promotion'],['Ausland','Erasmus'],['Mittelwert','Statistik'],['Fragebogen','Umfrage'],['Professor','Dozent'],['Rede','Vortrag']],
  ki: [['Google','Suchmaschine'],['Foto','Kamera'],['Batterie','Akku'],['Gesicht','Biometrie'],['erfunden','Halluzination'],['Spion','Überwachung'],['Gehirn','Neuron'],['König','Schach'],['Strom','Energie'],['Monitor','Bildschirm']],
  natur: [['Honig','Biene'],['Eichel','Eiche'],['Kamel','Wüste'],['Laub','Herbst'],['Kälte','Winter'],['Wellen','Meer'],['Banane','Affe'],['Wolle','Schaf'],['quaken','Frosch'],['Netz','Spinne'],['Lava','Vulkan']]
};
const cos=(a,b)=>{let s=0,na=0,nb=0;for(let i=0;i<a.length;i++){s+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}return s/Math.sqrt(na*nb)};
let seed=42; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
const MODELS=[['Xenova/paraphrase-multilingual-MiniLM-L12-v2',''],['Xenova/multilingual-e5-small','query: '],['jinaai/jina-embeddings-v2-base-de',''],['Xenova/distiluse-base-multilingual-cased-v2','']];
for (const [id,pre] of MODELS) {
  let ex; const t0=performance.now();
  try { ex = await pipeline('feature-extraction', id, { dtype: 'q8' }); } catch(e) { console.log(id, 'FEHLER', e.message.slice(0,120)); continue; }
  const E = async ws => { const o = await ex(ws.map(w=>pre+w),{pooling:'mean',normalize:true}); const d=o.dims[1]; return ws.map((_,i)=>Array.from(o.data.slice(i*d,(i+1)*d))); };
  for (const center of [false,true]) {
    let trials=0, top1=0, top4=0; seed=42; const tm=[];
    for (const [pid, pairs] of Object.entries(PAIRS)) {
      const words = pools[pid]; const vecs = await E(words);
      const mean = vecs[0].map((_,k)=>vecs.reduce((s,v)=>s+v[k],0)/vecs.length);
      const adj = v => center ? v.map((x,k)=>x-mean[k]) : v;
      const W = new Map(words.map((w,i)=>[w,adj(vecs[i])]));
      for (const [clue,target] of pairs) {
        const t1=performance.now(); const [cv] = await E([clue]); tm.push(performance.now()-t1); const c = adj(cv);
        const others = words.filter(w=>w!==target);
        for (let t=0;t<300;t++) {
          const board=[target]; while(board.length<12){const w=others[Math.floor(rnd()*others.length)]; if(!board.includes(w)) board.push(w);}
          const r = board.map(w=>[w,cos(c,W.get(w))]).sort((a,b)=>b[1]-a[1]);
          const rank=r.findIndex(x=>x[0]===target)+1; trials++; if(rank===1)top1++; if(rank<=4)top4++;
        }
      }
    }
    console.log(`${id.split('/')[1].padEnd(42)} ${center?'zentriert':'roh      '}  Platz 1: ${(100*top1/trials).toFixed(0)} %   unter Top 4: ${(100*top4/trials).toFixed(0)} %   (${(tm.reduce((a,b)=>a+b,0)/tm.length).toFixed(0)} ms/Hinweis, Laden ${((performance.now()-t0)/1000).toFixed(0)} s)`);
  }
}
