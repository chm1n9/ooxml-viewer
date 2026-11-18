import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, SETTINGS_STORAGE_KEY } from '../src/lib/settings.ts';

function storage(value = null) {
  let raw = value;
  return {
    getItem(key) { assert.equal(key, SETTINGS_STORAGE_KEY); return raw; },
    setItem(key, value) { assert.equal(key, SETTINGS_STORAGE_KEY); raw = value; },
  };
}

test('loads defaults and ignores the removed auto-reload preference', () => {
  globalThis.localStorage = storage();
  assert.deepEqual(loadSettings(), {autoCollapseTags:''});
  globalThis.localStorage = storage(JSON.stringify({autoCollapseTags:'w:p',autoReloadSource:true}));
  assert.deepEqual(loadSettings(), {autoCollapseTags:'w:p'});
});

test('persists tag preferences', () => {
  globalThis.localStorage = storage();
  saveSettings({autoCollapseTags:'a:p'});
  assert.deepEqual(loadSettings(), {autoCollapseTags:'a:p'});
});

test('draft edits do not alter saved values before Save', () => {
  globalThis.localStorage = storage(JSON.stringify({autoCollapseTags:''}));
  const draft=loadSettings();draft.autoCollapseTags='w:r';
  assert.deepEqual(loadSettings(), {autoCollapseTags:''});
});

test('invalid or blocked storage safely loads defaults; save failures can be reported', () => {
  for(const raw of ['bad JSON','null',JSON.stringify({autoReloadSource:'true'})]) {
    globalThis.localStorage=storage(raw);assert.deepEqual(loadSettings(),{autoCollapseTags:''});
  }
  globalThis.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  assert.deepEqual(loadSettings(),{autoCollapseTags:''});
  assert.throws(()=>saveSettings({autoCollapseTags:''}),/blocked/);
});
