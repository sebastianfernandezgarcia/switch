import {localize,getLanguage} from './i18n.mjs';
let theme='light';try{theme=localStorage.getItem('switch-theme')==='dark'?'dark':'light';}catch{}
function render(){document.documentElement.dataset.theme=theme;document.querySelectorAll('[data-theme-toggle]').forEach(b=>{b.textContent=theme==='light'?'◐':'◑';b.setAttribute('aria-label',getLanguage()==='es'?'Activar modo '+(theme==='light'?'oscuro':'claro'):'Enable '+(theme==='light'?'dark':'light')+' mode');b.setAttribute('aria-pressed',String(theme==='dark'));});localize(document);}
document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.addEventListener('click',()=>{theme=theme==='light'?'dark':'light';try{localStorage.setItem('switch-theme',theme);}catch{}render();}));document.addEventListener('switch:language',render);render();
