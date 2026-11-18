import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRoute, pushRoute, replaceRoute, pushToBase, replaceToBase, buildPathname } from '../src/lib/routeHistory.ts';

function browserHistory(initial) {
  const stack = [new URL(initial,'https://viewer.example')];
  let index = 0;
  const sync = () => { globalThis.location = stack[index]; };
  sync();
  globalThis.history = {
    pushState(_state,_title,url) { stack.splice(++index); stack[index] = new URL(url,stack[index-1]); sync(); },
    replaceState(_state,_title,url) { stack[index] = new URL(url,stack[index]); sync(); },
  };
  return {
    get length() { return stack.length; },
    back() { if (index) index--; sync(); },
    forward() { if (index < stack.length-1) index++; sync(); },
  };
}

test('same-part diff creates history and back/forward restores mode and part', () => {
  const browser = browserHistory('/f/ppt/slides/slide4.xml');
  pushRoute('ppt/slides/slide4.xml','source-diff');
  assert.equal(location.search,'?view=source-diff');
  assert.deepEqual(getRoute(),{path:'ppt/slides/slide4.xml',view:'source-diff'});
  pushRoute('ppt/slides/slide4.xml','source-diff');
  assert.equal(browser.length,2);
  browser.back();
  assert.deepEqual(getRoute(),{path:'ppt/slides/slide4.xml',view:'editor'});
  browser.forward();
  assert.equal(getRoute().view,'source-diff');
  pushRoute('ppt/slides/slide5.xml');
  assert.deepEqual(getRoute(),{path:'ppt/slides/slide5.xml',view:'editor'});
  browser.back();
  assert.deepEqual(getRoute(),{path:'ppt/slides/slide4.xml',view:'source-diff'});
});

test('reload replaces diff route without adding history, including on the same part', () => {
  const browser = browserHistory('/f/part.xml?view=source-diff');
  replaceRoute('part.xml');
  assert.equal(location.search,'');
  assert.equal(browser.length,1);
  assert.equal(getRoute().view,'editor');
});

test('source diff can return to an empty editor and forward back into the diff', () => {
  const browser = browserHistory('/');
  pushRoute('new.xml','source-diff');
  pushToBase();
  assert.equal(getRoute(),null);
  browser.back();
  assert.deepEqual(getRoute(),{path:'new.xml',view:'source-diff'});
  replaceToBase();
  assert.equal(location.pathname,'/');
  assert.equal(location.search,'');
});

test('part names safely round-trip reserved characters without changing view parameters', () => {
  browserHistory('/');
  const path = 'folder with space/[a]#?&.xml';
  pushRoute(path,'source-diff');
  assert.equal(location.pathname,buildPathname(path));
  assert.deepEqual(getRoute(),{path,view:'source-diff'});
  assert.equal(location.hash,'');
});

test('invalid encodings fail safely and unsupported views fall back to the editor', () => {
  browserHistory('/f/%ZZ?view=source-diff');
  assert.equal(getRoute(),null);
  browserHistory('/f/part.xml?view=unknown');
  assert.equal(getRoute().view,'editor');
});
