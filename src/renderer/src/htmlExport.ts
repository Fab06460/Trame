import { escXml } from '@/svgParts'
import { fontFaces, pageToSvg } from '@/svgExport'
import { pageTransition, type PageTransition } from '@/transition'
import type { TrameDocument } from '@/types'

/** Textes de l'interface du fichier, dans la langue de l'éditeur au moment de l'export. */
export interface HtmlLabels {
  lang: string
  /** « Page {page} sur {total} » : `{page}` et `{total}` sont remplacés par le lecteur */
  page: string
  previous: string
  next: string
  fullscreen: string
  help: string
  noScript: string
}

export interface PresentationInput {
  title: string
  width: number
  height: number
  /** une page = un `<svg>` en ligne (sans prologue XML) */
  slides: string[]
  /** transition jouée à l'arrivée sur chaque page (déjà résolue : celle de la page, sinon celle du document) */
  transitions: PageTransition[]
  /** règles `@font-face` communes à toutes les pages */
  fonts: string
  labels: HtmlLabels
}

/**
 * Les identifiants d'un SVG (dégradés, ombres : `g1`, `s2`…) sont les mêmes d'une page à l'autre ; en ligne dans une même page HTML ils
 * se confondraient. On les préfixe donc par le numéro de la page.
 */
export function prefixIds(svg: string, prefix: string): string {
  return svg.replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
}

/** SVG d'une page prêt à être mis en ligne : sans prologue XML ni titre (la page HTML a le sien), identifiants propres à la page, lisible par les lecteurs d'écran. */
export function inlineSvg(svg: string, index: number): string {
  return prefixIds(svg.replace(/^<\?xml[^>]*\?>\s*/, '').replace(/<title>[\s\S]*?<\/title>/, ''), `p${index + 1}-`).replace('<svg ', '<svg focusable="false" ')
}

/** Valeur placée dans un <script> : jamais de « </script> » ni de « <!-- » possibles. */
const jsonForScript = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003c').replace(new RegExp('[\\u2028\\u2029]', 'g'), (c) => '\\u' + c.charCodeAt(0).toString(16))

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#0e0f12;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;touch-action:pan-y}
#frame{position:relative;aspect-ratio:var(--w)/var(--h);width:min(100vw,calc(100vh*var(--w)/var(--h)));max-height:100vh;overflow:hidden}
.slide{position:absolute;inset:0;display:none}
.slide.on{display:block}
.slide svg{display:block;width:100%;height:100%}
#bar{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:rgba(30,31,36,.85);font-size:13px;transition:opacity .3s}
body.idle #bar{opacity:0;pointer-events:none}
#bar button{font:inherit;color:#fff;background:transparent;border:1px solid rgba(255,255,255,.35);border-radius:999px;min-width:34px;height:30px;cursor:pointer}
#bar button:hover,#bar button:focus-visible{background:rgba(255,255,255,.18);outline:2px solid #fff;outline-offset:1px}
#bar button:disabled{opacity:.35;cursor:default}
#count{min-width:110px;text-align:center}
#help{position:fixed;top:10px;left:50%;transform:translateX(-50%);padding:5px 12px;border-radius:999px;background:rgba(30,31,36,.85);font-size:12px;transition:opacity .6s}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
noscript{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
`

/** Lecteur : navigation clavier, clic, balayage tactile, plein écran, lien direct (#3), transitions comme dans l'éditeur. */
const SCRIPT = `
(function(){
var D=JSON.parse(document.getElementById('data').textContent);
var slides=[].slice.call(document.querySelectorAll('.slide'));
var N=slides.length,cur=-1,busy=null;
var count=document.getElementById('count'),live=document.getElementById('live');
var prev=document.getElementById('prev'),next=document.getElementById('next');
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function label(i){return D.page.replace('{page}',i+1).replace('{total}',N)}
function finish(){if(busy){busy.forEach(function(a){try{a.cancel()}catch(e){}});busy=null}slides.forEach(function(s,i){s.classList.toggle('on',i===cur);s.style.zIndex='';s.setAttribute('aria-hidden',i===cur?'false':'true')})}
function show(to,instant){
  to=Math.max(0,Math.min(N-1,to));if(to===cur)return;
  finish();var from=cur;cur=to;
  var inc=slides[to],out=from>=0?slides[from]:null;
  inc.classList.add('on');inc.setAttribute('aria-hidden','false');
  var t=from<0?'none':(to<from?D.tr[from]:D.tr[to]),dir=to>=from?1:-1;
  if(!out||instant||reduce||t==='none'||!inc.animate){finish()}
  else{
    var o={duration:450,easing:'ease',fill:'both'},a=[];inc.style.zIndex=2;out.style.zIndex=1;
    if(t==='fade')a.push(inc.animate([{opacity:0},{opacity:1}],o));
    else if(t==='slide'){a.push(inc.animate([{transform:'translateX('+dir*100+'%)'},{transform:'none'}],o));a.push(out.animate([{transform:'none'},{transform:'translateX('+(-dir*100)+'%)'}],o))}
    else if(t==='cover')a.push(inc.animate([{transform:'translateX('+dir*100+'%)'},{transform:'none'}],o));
    else if(t==='zoom'){a.push(inc.animate([{transform:'scale(.85)',opacity:0},{transform:'none',opacity:1}],o));a.push(out.animate([{transform:'none',opacity:1},{transform:'scale(1.12)',opacity:0}],o))}
    busy=a;var token=a;a[0].onfinish=function(){if(busy===token)finish()};
  }
  count.textContent=label(to);live.textContent=label(to);
  prev.disabled=to===0;next.disabled=to===N-1;
  try{history.replaceState(null,'','#'+(to+1))}catch(e){}
}
function go(d){show(cur+d)}
function fs(){var d=document,e=d.documentElement;if(d.fullscreenElement){d.exitFullscreen()}else if(e.requestFullscreen){e.requestFullscreen().catch(function(){})}}
document.addEventListener('keydown',function(e){
  if(e.altKey||e.ctrlKey||e.metaKey)return;
  var k=e.key,h=true;
  if(k==='ArrowRight'||k==='ArrowDown'||k==='PageDown'||k===' '||k==='Enter')go(1);
  else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'||k==='Backspace')go(-1);
  else if(k==='Home')show(0);else if(k==='End')show(N-1);
  else if(k==='f'||k==='F')fs();
  else h=false;
  if(h)e.preventDefault();
});
var stage=document.getElementById('stage');
stage.addEventListener('click',function(e){if(e.target.closest('#bar'))return;var r=stage.getBoundingClientRect();go(e.clientX<r.left+r.width/4?-1:1)});
var sx=null,sy=null;
stage.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
stage.addEventListener('touchend',function(e){if(sx===null)return;var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;sx=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5){go(dx<0?1:-1);e.preventDefault()}},{passive:false});
prev.onclick=function(){go(-1)};next.onclick=function(){go(1)};
document.getElementById('full').onclick=fs;
var idle;function wake(){document.body.classList.remove('idle');clearTimeout(idle);idle=setTimeout(function(){document.body.classList.add('idle')},3000)}
['mousemove','keydown','touchstart'].forEach(function(n){document.addEventListener(n,wake,{passive:true})});wake();
setTimeout(function(){var h=document.getElementById('help');if(h)h.style.opacity=0},5000);
window.addEventListener('hashchange',function(){var n=parseInt(location.hash.slice(1),10);if(n>=1&&n<=N)show(n-1,true)});
var start=parseInt(location.hash.slice(1),10);show(start>=1&&start<=N?start-1:0,true);
})();
`

/** Le fichier HTML complet : une seule page autonome, sans réseau (la politique de sécurité interdit toute connexion). */
export function buildPresentationHtml(input: PresentationInput): string {
  const { labels: l } = input
  const data = { tr: input.transitions, page: l.page }
  return (
    `<!doctype html>\n<html lang="${escXml(l.lang)}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">\n` +
    `<title>${escXml(input.title)}</title>\n<style>${input.fonts}${STYLE}</style>\n</head>\n` +
    `<body style="--w:${input.width};--h:${input.height}">\n` +
    `<div id="stage"><div id="frame" role="group" aria-roledescription="carousel" aria-label="${escXml(input.title)}">\n` +
    input.slides.map((svg, i) => `<section class="slide" aria-label="${escXml(l.page.replace('{page}', String(i + 1)).replace('{total}', String(input.slides.length)))}">${svg}</section>`).join('\n') +
    `\n</div></div>\n` +
    `<div id="help">${escXml(l.help)}</div>\n` +
    `<div id="bar"><button id="prev" aria-label="${escXml(l.previous)}">←</button><span id="count"></span><button id="next" aria-label="${escXml(l.next)}">→</button><button id="full" aria-label="${escXml(l.fullscreen)}">⛶</button></div>\n` +
    `<div id="live" class="sr" aria-live="polite"></div>\n` +
    `<noscript>${escXml(l.noScript)}</noscript>\n` +
    `<script type="application/json" id="data">${jsonForScript(data)}</script>\n` +
    `<script>${SCRIPT}</script>\n</body>\n</html>\n`
  )
}

/** Présentation web d'un document : chaque page en SVG vectoriel (textes, polices incorporées une fois pour tout le document, images). */
export async function documentToHtml(doc: TrameDocument, labels: HtmlLabels): Promise<string> {
  const slides: string[] = []
  for (let i = 0; i < doc.pages.length; i++) slides.push(inlineSvg(await pageToSvg(doc, doc.pages[i], { embedFonts: false }), i))
  return buildPresentationHtml({
    title: doc.name,
    width: doc.width,
    height: doc.height,
    slides,
    transitions: doc.pages.map((_, i) => pageTransition(doc, i)),
    fonts: await fontFaces(doc.pages),
    labels
  })
}
