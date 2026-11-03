import {localize,getLanguage} from './i18n.mjs';
let theme='light';try{theme=localStorage.getItem('switch-theme')==='dark'?'dark':'light';}catch{}
function render(){document.documentElement.dataset.theme=theme;document.querySelectorAll('[data-theme-toggle]').forEach(b=>{b.textContent=theme==='light'?'◐':'◑';b.setAttribute('aria-label',getLanguage()==='es'?'Activar modo '+(theme==='light'?'oscuro':'claro'):'Enable '+(theme==='light'?'dark':'light')+' mode');b.setAttribute('aria-pressed',String(theme==='dark'));});localize(document);}
document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.addEventListener('click',()=>{theme=theme==='light'?'dark':'light';try{localStorage.setItem('switch-theme',theme);}catch{}render();}));document.addEventListener('switch:language',render);render();
fetch('/api/deployment').then(r => r.ok ? r.json() : null).then(status => {
  if (status?.mode !== 'public_showcase') return;
  const notice = document.createElement('aside');
  notice.className = 'public-demo-status';
  notice.setAttribute('role', 'status');
  const update = () => { notice.textContent = status.newInference
    ? (getLanguage() === 'es' ? 'DEMO PÚBLICA · Observaciones Renfe y ensayo 3D. Meta empieza solo cuando se lo pides.' : 'PUBLIC DEMO · Renfe observations and 3D rehearsal. Meta starts only when you ask.')
    : (getLanguage() === 'es' ? 'DEMO PÚBLICA · Observaciones Renfe, ensayo 3D y ejecuciones reales guardadas de Meta. Nuevas consultas pausadas.' : 'PUBLIC DEMO · Renfe observations, 3D rehearsal and saved actual Meta runs. New requests are paused.'); };
  document.querySelector('header')?.insertAdjacentElement('afterend', notice);
  document.addEventListener('switch:language', update); update();
}).catch(() => {});
