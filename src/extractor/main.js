import shellHtml from '../app/shell.html?raw';
import '../app/core.js';

const app = document.getElementById('app');

if (!app) {
  throw new Error('Missing #app mount point');
}

app.innerHTML = shellHtml;
