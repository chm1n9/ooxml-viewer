import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { sourceTreeEntries, sourceFolderKeys, buildFileTree, nodeId } from '../src/lib/fileTree.ts';
import { snapshotSource, compareSourceFile, compareSourceSnapshots, readSourceComparison, readSourceDiff, sourceReloadPath, sourcePreviewChange } from '../src/lib/sourceChanges.ts';

function basePackage() {
  const zip = new JSZip();
  zip.file('word/document.xml', '<document>original</document>');
  zip.file('word/styles.xml', '<styles/>');
  zip.file('word/fonts/font1.bin', new Uint8Array([0, 255, 17, 33]));
  zip.file('word/media/image1.bin', new Uint8Array([10, 20, 30]));
  return zip;
}

test('source tree adds preview-only parts without changing editable or exported entries', () => {
  const entries = [
    {path:'word/document.xml',content:'local edit',isBinary:false},
    {path:'word/styles.xml',content:'<styles/>',isBinary:false},
  ];
  const changes = [
    {path:'word/document.xml',kind:'modified'},
    {path:'word/styles.xml',kind:'removed'},
    {path:'word/new/part.xml',kind:'added'},
    {path:'word/new/font.bin',kind:'added'},
  ];
  const display = sourceTreeEntries(entries, changes);
  assert.equal(entries.length,2);
  assert.equal(display.length,4);
  assert.equal(display[0],entries[0]);
  assert.equal(display[0].content,'local edit');
  assert.equal(display[1],entries[1]);
  assert.equal(display[2].sourceOnly,true);
  assert.equal(display[2].isBinary,false);
  assert.equal(display[3].isBinary,true);
  assert.deepEqual([...sourceFolderKeys(changes)],['word','word/new']);
  assert.deepEqual(sourceTreeEntries(entries,[]),entries);
  assert.equal(sourceFolderKeys([]).size,0);
  assert.equal(buildFileTree(display)[0].children[0].children[1].sourceOnly,true);
});

test('tree keys distinguish an old file from a newly added same-name folder', () => {
  const nodes = buildFileTree([
    {path:'part',content:'',isBinary:true},
    {path:'part/new.xml',content:'',isBinary:false,sourceOnly:true},
  ]);
  assert.equal(nodes.length,2);
  assert.notEqual(nodeId(nodes[0]),nodeId(nodes[1]));
});
async function asFile(zip, options = {}) {
  return new File([await zip.generateAsync({ type: 'uint8array', ...options })], 'source.docx');
}

test('detects changed XML/binary content, additions and removals', async () => {
  const baseline = await snapshotSource(basePackage());
  const originalSnapshot = new Map(baseline);
  const updated = basePackage();
  updated.file('word/document.xml', '<document>updated</document>');
  updated.file('word/fonts/font1.bin', new Uint8Array([0, 255, 18, 33]));
  updated.file('word/new.xml', '<new/>');
  updated.remove('word/styles.xml');
  assert.deepEqual(await compareSourceFile(baseline, await asFile(updated)), [
    { path: 'word/document.xml', kind: 'modified' },
    { path: 'word/fonts/font1.bin', kind: 'modified' },
    { path: 'word/new.xml', kind: 'added' },
    { path: 'word/styles.xml', kind: 'removed' },
  ]);
  assert.deepEqual(baseline, originalSnapshot);
});

test('ignores directory entries, compression, timestamps and ZIP entry order', async () => {
  const original = basePackage();
  const baseline = await snapshotSource(original);
  const repacked = new JSZip();
  repacked.folder('empty/');
  for (const [path, entry] of Object.entries(original.files).reverse()) {
    if (!entry.dir) repacked.file(path, await entry.async('uint8array'), { date: new Date('2020-01-01') });
  }
  assert.deepEqual(await compareSourceFile(baseline, await asFile(repacked, { compression: 'DEFLATE' })), []);
});

test('a source reload establishes a fresh comparison baseline', async () => {
  const updated = basePackage();
  updated.file('word/document.xml', '<document>new baseline</document>');
  const baseline = await snapshotSource(updated);
  assert.deepEqual(await compareSourceFile(baseline, await asFile(updated)), []);
  updated.file('word/styles.xml', '<styles>changed again</styles>');
  assert.deepEqual(await compareSourceFile(baseline, await asFile(updated)), [{ path: 'word/styles.xml', kind: 'modified' }]);
});

test('handles empty/binary files and sorts file paths naturally', async () => {
  const before = new JSZip().file('empty.bin', new Uint8Array());
  const after = new JSZip().file('empty.bin', new Uint8Array([0])).file('slide10.xml', '<x/>').file('slide2.xml', '<x/>');
  assert.deepEqual((await compareSourceFile(await snapshotSource(before), await asFile(after))).map(change => change.path), ['empty.bin', 'slide2.xml', 'slide10.xml']);
  assert.deepEqual(compareSourceSnapshots(new Map(), new Map()), []);
});

test('rejects a truncated archive instead of showing incomplete change results', async () => {
  const file = await asFile(basePackage());
  const bytes = new Uint8Array(await file.arrayBuffer());
  await assert.rejects(compareSourceFile(new Map(), new File([bytes.slice(0, bytes.length / 2)], 'partial.docx')));
});


test('reads the exact source snapshots without changing either package', async () => {
  const before = basePackage();
  const updated = basePackage().file('word/document.xml', '<document>disk update</document>');
  const comparison = await readSourceComparison(await snapshotSource(before), await asFile(updated));
  updated.file('word/document.xml', '<document>a later save</document>');
  const result = await readSourceDiff(before, comparison.zip, comparison.changes[0]);
  assert.equal(result.binary, false);
  assert.equal(result.before, '<document>original</document>');
  assert.equal(result.after, '<document>disk update</document>');
  assert.equal(await before.file('word/document.xml').async('string'), result.before);
});

test('added and removed XML use an empty opposite side', async () => {
  const empty = new JSZip(), part = new JSZip().file('new.xml', '<new/>');
  assert.deepEqual(await readSourceDiff(empty, part, {path:'new.xml',kind:'added'}), {
    binary:false,before:'',after:'<new/>',beforeBytes:0,afterBytes:6,
  });
  assert.deepEqual(await readSourceDiff(part, empty, {path:'new.xml',kind:'removed'}), {
    binary:false,before:'<new/>',after:'',beforeBytes:6,afterBytes:0,
  });
});

test('binary previews report sizes without exposing bytes as text', async () => {
  const before = new JSZip().file('font.fntdata',new Uint8Array([0,255]));
  const after = new JSZip().file('font.fntdata',new Uint8Array([0,254,255]));
  assert.deepEqual(await readSourceDiff(before,after,{path:'font.fntdata',kind:'modified'}), {
    binary:true,before:'',after:'',beforeBytes:2,afterBytes:3,
  });
});

test('decodes BOM-marked UTF-16 XML and rejects stale/missing entries', async () => {
  const bytes = new Uint8Array([255,254,...Buffer.from('<x/>','utf16le')]);
  const before = new JSZip().file('part.xml',bytes);
  const after = new JSZip().file('part.xml','<y/>');
  const result = await readSourceDiff(before,after,{path:'part.xml',kind:'modified'});
  assert.equal(result.before,'<x/>'); assert.equal(result.after,'<y/>');
  await assert.rejects(readSourceDiff(before,after,{path:'missing.xml',kind:'modified'}));
  await assert.rejects(readSourceDiff(before,after,{path:'part.xml',kind:'added'}));
});


test('reload prefers the viewed diff part and falls back to the surviving editor part', () => {
  const paths = ['word/document.xml', 'word/styles.xml', 'word/new.xml'];
  assert.equal(sourceReloadPath(paths, 'word/document.xml', null), 'word/document.xml');
  assert.equal(sourceReloadPath(paths, 'word/document.xml', 'word/styles.xml'), 'word/styles.xml');
  assert.equal(sourceReloadPath(paths, null, 'word/new.xml'), 'word/new.xml');
  assert.equal(sourceReloadPath(paths, 'word/document.xml', 'word/deleted.xml'), 'word/document.xml');
  assert.equal(sourceReloadPath(paths, 'word/deleted.xml', 'word/missing.xml'), null);
});

test('live source previews accumulate against the loaded baseline and follow the latest save', async () => {
  const baseline = basePackage();
  const snapshot = await snapshotSource(baseline);
  const path = 'word/document.xml';
  for (const text of ['first save','second save','original']) {
    const latest = await readSourceComparison(snapshot, await asFile(basePackage().file(path, `<document>${text}</document>`)));
    const change = sourcePreviewChange(path, latest.changes);
    const diff = await readSourceDiff(baseline, latest.zip, change);
    assert.equal(diff.before,'<document>original</document>');
    assert.equal(diff.after,`<document>${text}</document>`);
    assert.equal(change.kind,text === 'original' ? 'unchanged' : 'modified');
    if (text === 'original') assert.equal(latest.changes.length,0);
  }
});

test('a preview-only addition can disappear in a later save without leaving a stale diff', async () => {
  const baseline = basePackage();
  const snapshot = await snapshotSource(baseline);
  const added = await readSourceComparison(snapshot,await asFile(basePackage().file('new.xml','<new/>')));
  assert.equal(sourcePreviewChange('new.xml',added.changes).kind,'added');
  const restored = await readSourceComparison(snapshot,await asFile(basePackage()));
  const diff = await readSourceDiff(baseline,restored.zip,sourcePreviewChange('new.xml',restored.changes));
  assert.equal(diff.before,'');
  assert.equal(diff.after,'');
  assert.equal(restored.changes.length,0);
});
