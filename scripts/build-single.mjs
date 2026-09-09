// Fold the one-file build into a single HTML document, then strip the outer
// document shell so it can be published as an Artifact page body.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-single';
const assets = join(dir, 'assets');
const files = readdirSync(assets);
const js = files.find((f) => f.endsWith('.js'));
const css = files.find((f) => f.endsWith('.css'));
if (!js) throw new Error('no bundled js found');

const script = readFileSync(join(assets, js), 'utf8');
const style = css ? readFileSync(join(assets, css), 'utf8') : '';

const page = `<title>Last Call</title>
<style>
${style}
</style>
<div id="app"></div>
<script type="module">
${script}
</script>
`;

writeFileSync(join(dir, 'last-call.html'), page);
console.log(`wrote ${dir}/last-call.html  (${(page.length / 1024).toFixed(0)} KB)`);
