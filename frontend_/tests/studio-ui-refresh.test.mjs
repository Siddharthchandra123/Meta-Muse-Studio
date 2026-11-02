import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const catalog=read('src/app/studio/catalog/page.tsx');
const compare=read('src/app/studio/compare/page.tsx');
const studio=read('src/app/studio/page.tsx');
const theme=read('src/components/StudioThemeToggle.tsx');
const styles=read('src/app/studio/ui-refresh.css');

test('Studio, Catalog and Compare share the UI refresh and theme control',()=>{
  for(const page of [studio,catalog,compare]){
    assert.match(page,/StudioThemeToggle/);
    assert.match(page,/ui-refresh\.css/);
  }
  assert.match(styles,/data-muse-studio-theme='light'/);
});

test('Theme preference is locally persisted with an accessible control',()=>{
  assert.match(theme,/localStorage\.setItem/);
  assert.match(theme,/localStorage\.getItem/);
  assert.match(theme,/aria-label=/);
  assert.match(theme,/delete document\.documentElement\.dataset\.museStudioTheme/);
  assert.doesNotMatch(theme,/MODEL_API_KEY|api\.meta\.ai/);
});

test('Catalog sorting and view controls are real interactive state, not fake buttons',()=>{
  assert.match(catalog,/setSort\(/);
  assert.match(catalog,/sort==='access'/);
  assert.match(catalog,/setView\(/);
  assert.match(catalog,/sc-list-view/);
  assert.match(catalog,/aria-pressed/);
  assert.match(catalog,/sc-selection-dock/);
  assert.match(catalog,/setCompareIds\(\[\]\)/);
});

test('Comparison insight depends on both finished responses and reported metrics',()=>{
  assert.match(compare,/bothCompleted=results\.left\.state==='completed'&&results\.right\.state==='completed'/);
  assert.match(compare,/totalA\+totalB/);
  assert.match(compare,/Includes network overhead/);
  assert.match(compare,/setSideResult/);
  assert.match(compare,/Promise\.all\(tasks\)/);
});

test('UI refresh keeps reduced-motion, focus and mobile considerations',()=>{
  assert.match(styles,/prefers-reduced-motion:reduce/);
  assert.match(styles,/:focus-visible/);
  assert.match(styles,/@media\(max-width:580px\)/);
  assert.match(styles,/.sc-selection-dock/);
});
