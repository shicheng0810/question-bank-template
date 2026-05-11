import '../styles/site.css';
import shellHtml from './shell.html?raw';
import { initQuestionBankSite } from './site-app.js';

const app = document.getElementById('app');

if (!app) {
  throw new Error('Missing #app mount point');
}

app.innerHTML = shellHtml;

try {
  await initQuestionBankSite();
} catch (error) {
  console.error(error);
  app.innerHTML = `
    <div style="max-width:720px;margin:48px auto;padding:24px;border:1px solid rgba(31,41,51,.12);border-radius:20px;background:#fffaf3">
      <h1 style="margin:0 0 12px;font:700 28px/1.1 'Segoe UI',sans-serif;color:#143a52">题库站初始化失败</h1>
      <p style="margin:0;color:#5b6471;line-height:1.7">${String(error && error.message ? error.message : error)}</p>
    </div>
  `;
}
