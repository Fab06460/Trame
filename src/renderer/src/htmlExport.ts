import { escXml } from '@/svgParts'
import { fontFaces, pageToSvg } from '@/svgExport'
import { pageTransition, type PageTransition } from '@/transition'
import { pageLinks } from '@/links'
import { clipElements, clipRange, clipSpeed, clipVolume } from '@/videoClips'
import type { TrameDocument, TramePage } from '@/types'

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
  /** « Aller à la page {n} » : `{n}` est remplacé par le numéro de la page visée */
  goPage: string
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
  /** octets (en base64) des clips vidéo posés dans les pages, par identifiant ; absent = aucun clip joué */
  clips?: Record<string, ClipPayload>
}

/** Un clip embarqué dans le fichier : type de média et octets en base64. */
export interface ClipPayload {
  mime: string
  data: string
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
.clip{position:absolute;object-fit:fill;opacity:0;transform-origin:0 0;background:transparent}
.clip.on{opacity:var(--o,1)}
.clip[data-manual]{cursor:pointer}
.lk{position:absolute;display:block;border-radius:4px}
.lk:hover,.lk:focus-visible{outline:2px solid rgba(255,255,255,.85);outline-offset:1px}
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
var urls={},blobs={};
[].forEach.call(document.querySelectorAll('script[data-clip-data]'),function(s){blobs[s.getAttribute('data-clip-data')]=s});
function srcOf(id){
  if(urls[id])return urls[id];var s=blobs[id];if(!s)return null;
  var b=atob(s.textContent.trim()),n=b.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=b.charCodeAt(i);
  s.textContent='';return urls[id]=URL.createObjectURL(new Blob([u],{type:s.getAttribute('data-mime')}));
}
function range(v){return{s:+v.getAttribute('data-start'),e:+v.getAttribute('data-end')}}
var raf=0;
function tick(){raf=0;var any=false;
  if(cur>=0)[].forEach.call(slides[cur].querySelectorAll('video.clip'),function(v){
    if(v.paused||!v.src)return;any=true;var r=range(v);
    if(v.currentTime>=r.e-.02){if(v.hasAttribute('data-loop'))v.currentTime=r.s;else{v.pause();v.currentTime=Math.max(r.s,r.e-.05)}}
  });
  if(any)raf=requestAnimationFrame(tick);
}
function arm(v){
  if(v.src)return true;var u=srcOf(v.getAttribute('data-clip'));if(!u)return false;
  v.src=u;v.muted=v.hasAttribute('data-muted');v.volume=+v.getAttribute('data-vol');
  v.defaultPlaybackRate=v.playbackRate=+v.getAttribute('data-speed');v.preservesPitch=false;
  v.addEventListener('loadedmetadata',function(){if(v.paused)v.currentTime=range(v).s});
  v.addEventListener('play',function(){var r=range(v);if(v.currentTime<r.s-.01||v.currentTime>=r.e-.05)v.currentTime=r.s;v.controls=false;v.classList.add('on');if(!raf)raf=requestAnimationFrame(tick)});
  v.addEventListener('ended',function(){if(v.hasAttribute('data-loop')){v.currentTime=range(v).s;v.play().catch(function(){})}});
  return true;
}
function leaveClips(s){[].forEach.call(s.querySelectorAll('video.clip'),function(v){v.pause();v.controls=false;v.classList.remove('on');if(v.src)v.currentTime=range(v).s})}
function enterClips(s){[].forEach.call(s.querySelectorAll('video.clip'),function(v){
  if(!arm(v)||v.hasAttribute('data-manual'))return;
  var p=v.play();if(p&&p.catch)p.catch(function(){v.controls=true;v.classList.add('on')});
})}
function label(i){return D.page.replace('{page}',i+1).replace('{total}',N)}
function finish(){if(busy){busy.forEach(function(a){try{a.cancel()}catch(e){}});busy=null}slides.forEach(function(s,i){s.classList.toggle('on',i===cur);s.style.zIndex='';s.setAttribute('aria-hidden',i===cur?'false':'true')})}
function show(to,instant){
  to=Math.max(0,Math.min(N-1,to));if(to===cur)return;
  finish();var from=cur;cur=to;
  var inc=slides[to],out=from>=0?slides[from]:null;
  if(out)leaveClips(out);
  inc.classList.add('on');inc.setAttribute('aria-hidden','false');enterClips(inc);
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
  if((e.key==='Enter'||e.key===' ')&&e.target.closest&&e.target.closest('a.lk'))return;
  var k=e.key,h=true;
  if(k==='ArrowRight'||k==='ArrowDown'||k==='PageDown'||k===' '||k==='Enter')go(1);
  else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'||k==='Backspace')go(-1);
  else if(k==='Home')show(0);else if(k==='End')show(N-1);
  else if(k==='f'||k==='F')fs();
  else h=false;
  if(h)e.preventDefault();
});
var stage=document.getElementById('stage');
stage.addEventListener('click',function(e){if(e.target.closest('#bar'))return;var lk=e.target.closest('a.lk');if(lk){var g=lk.getAttribute('data-go');if(g!==null){e.preventDefault();show(parseInt(g,10))}return}var cv=e.target.closest('video.clip');if(cv){if(cv.controls)return;if(cv.hasAttribute('data-manual')){if(cv.paused){cv.play().catch(function(){})}else{cv.pause()}return}}var r=stage.getBoundingClientRect();go(e.clientX<r.left+r.width/4?-1:1)});
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
  const clips = Object.entries(input.clips ?? {})
  const media = clips.length ? ' media-src blob:;' : ''
  return (
    `<!doctype html>\n<html lang="${escXml(l.lang)}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:;${media} font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">\n` +
    `<title>${escXml(input.title)}</title>\n<style>${input.fonts}${STYLE}</style>\n</head>\n` +
    `<body style="--w:${input.width};--h:${input.height}">\n` +
    `<div id="stage"><div id="frame" role="group" aria-roledescription="carousel" aria-label="${escXml(input.title)}">\n` +
    input.slides.map((svg, i) => `<section class="slide" aria-label="${escXml(l.page.replace('{page}', String(i + 1)).replace('{total}', String(input.slides.length)))}">${svg}</section>`).join('\n') +
    `\n</div></div>\n` +
    `<div id="help">${escXml(l.help)}</div>\n` +
    `<div id="bar"><button id="prev" aria-label="${escXml(l.previous)}">←</button><span id="count"></span><button id="next" aria-label="${escXml(l.next)}">→</button><button id="full" aria-label="${escXml(l.fullscreen)}">⛶</button></div>\n` +
    `<div id="live" class="sr" aria-live="polite"></div>\n` +
    `<noscript>${escXml(l.noScript)}</noscript>\n` +
    clips.map(([id, c]) => `<script type="text/plain" data-clip-data="${escXml(id)}" data-mime="${escXml(c.mime)}">${c.data}</script>\n`).join('') +
    `<script type="application/json" id="data">${jsonForScript(data)}</script>\n` +
    `<script>${SCRIPT}</script>\n</body>\n</html>\n`
  )
}

/** Les zones cliquables d'une page : un lien `<a>` par élément lié, placé en pourcentages de la page (donc à la bonne place à toute taille). */
export function linkZones(doc: Pick<TrameDocument, 'pages' | 'width' | 'height'>, page: TramePage, goPage: string): string {
  return pageLinks(doc, page)
    .map(({ target, box }) => {
      const pos = `left:${pct(box.x / doc.width)}%;top:${pct(box.y / doc.height)}%;width:${pct(box.width / doc.width)}%;height:${pct(box.height / doc.height)}%`
      return target.kind === 'url'
        ? `<a class="lk" href="${escXml(target.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escXml(target.url)}" style="${pos}"></a>`
        : `<a class="lk" href="#${target.index + 1}" data-go="${target.index}" aria-label="${escXml(goPage.replace('{n}', String(target.index + 1)))}" style="${pos}"></a>`
    })
    .join('')
}

const pct = (v: number): string => Number((v * 100).toFixed(3)).toString()

/** Les clips de la page dont les octets sont dans le document (et non masqués). */
const pageClips = (doc: Pick<TrameDocument, 'clips'>, page: TramePage) => clipElements(page.elements).filter((e) => !!e.video && !!doc.clips?.[e.video.id])

/**
 * Un lecteur `<video>` par clip, à la place de son image d'aperçu (déjà dans le SVG de la page) et avec ses réglages en attributs. Il n'a pas
 * encore de source : le lecteur de la page y met le clip quand la page s'affiche pour la première fois, et le joue (à l'arrivée ou au clic).
 */
export function clipVideos(doc: Pick<TrameDocument, 'clips' | 'width' | 'height'>, page: TramePage): string {
  return pageClips(doc, page)
    .map((el) => {
      const v = el.video!
      const { start, end } = clipRange(v)
      const style = `left:${pct(el.x / doc.width)}%;top:${pct(el.y / doc.height)}%;width:${pct(el.width / doc.width)}%;height:${pct(el.height / doc.height)}%;--o:${Number(el.opacity.toFixed(3))};${el.rotation ? `transform:rotate(${Number(el.rotation.toFixed(3))}deg)` : ''}`
      const flags = `${v.loop ? ' data-loop' : ''}${v.manual ? ' data-manual' : ''}${v.muted ? ' data-muted' : ''}`
      return `<video class="clip" data-clip="${escXml(v.id)}" data-start="${start}" data-end="${end}" data-speed="${clipSpeed(v)}" data-vol="${clipVolume(v)}"${flags} preload="none" playsinline${el.alt ? ` aria-label="${escXml(el.alt)}"` : ' aria-hidden="true"'} style="${style}"></video>`
    })
    .join('')
}

/** Les octets (base64) de chaque clip posé dans une page du document, une seule fois par clip même s'il sert plusieurs fois. */
export function clipPayloads(doc: Pick<TrameDocument, 'clips' | 'pages'>): Record<string, ClipPayload> {
  const out: Record<string, ClipPayload> = {}
  for (const page of doc.pages) {
    for (const el of pageClips(doc, page)) {
      const id = el.video!.id
      if (out[id]) continue
      const url = doc.clips![id]
      const head = /^data:(video\/[a-z0-9.+-]+);base64,/i.exec(url.slice(0, 100))
      if (head) out[id] = { mime: head[1].toLowerCase(), data: url.slice(head[0].length) }
    }
  }
  return out
}

/** Taille ajoutée au fichier par les clips (en octets du fichier HTML : le base64 y est écrit tel quel). */
export const clipsHtmlSize = (doc: Pick<TrameDocument, 'clips' | 'pages'>): number => Object.values(clipPayloads(doc)).reduce((n, c) => n + c.data.length, 0)

export interface HtmlOptions {
  /** embarquer et jouer les clips vidéo ; sinon chaque clip reste son image d'aperçu */
  clips: boolean
}

/** Présentation web d'un document : chaque page en SVG vectoriel (textes, polices incorporées une fois pour tout le document, images). */
export async function documentToHtml(doc: TrameDocument, labels: HtmlLabels, options: HtmlOptions = { clips: false }): Promise<string> {
  const slides: string[] = []
  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i]
    slides.push(inlineSvg(await pageToSvg(doc, page, { embedFonts: false }), i) + (options.clips ? clipVideos(doc, page) : '') + linkZones(doc, page, labels.goPage))
  }
  const clips = options.clips ? clipPayloads(doc) : undefined
  return buildPresentationHtml({
    title: doc.name,
    width: doc.width,
    height: doc.height,
    slides,
    transitions: doc.pages.map((_, i) => pageTransition(doc, i)),
    fonts: await fontFaces(doc.pages),
    labels,
    ...(clips && Object.keys(clips).length ? { clips } : {})
  })
}
