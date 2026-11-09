import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const serve = process.argv.includes('--serve');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

const opts = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: !serve,
  sourcemap: serve,
  outfile: 'dist/app.js',
  format: 'esm',
  target: ['safari15', 'chrome100'],
  loader: { '.css': 'css' },
  define: { 'process.env.NODE_ENV': serve ? '"development"' : '"production"' },
  jsx: 'automatic',
};

if (serve) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 5173 });
  console.log(`Loomwright running at http://localhost:${port}`);
} else {
  await esbuild.build(opts);
  console.log('Built to dist/');
}
