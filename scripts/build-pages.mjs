import { mkdir, copyFile, writeFile } from 'node:fs/promises';

// Lista explícita: publica apenas os recursos da interface, sem metadados Git,
// testes, arquivos locais ou dados de estudos.
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await mkdir(new URL('src/', output), { recursive: true });
for (const file of ['index.html', 'src/app.js', 'src/model.js', 'src/style.css']) {
  await copyFile(new URL(file, root), new URL(file, output));
}
await writeFile(new URL('.nojekyll', output), '');
console.log('Arquivos públicos preparados em dist/: index.html, src/ e .nojekyll.');
