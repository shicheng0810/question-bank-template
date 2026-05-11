import '../styles/site.css';
import '../styles/extractor.css';
import shellHtml from '../app/shell.html?raw';

const app = document.getElementById('app');

if (!app) {
  throw new Error('Missing #app mount point');
}

app.innerHTML = shellHtml;

await import('../app/core.js');
