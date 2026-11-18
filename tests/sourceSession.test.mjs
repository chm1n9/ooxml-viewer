import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createSourceSession } from '../src/lib/sourceSession.ts';

async function file(text, version) {
  return new File([await new JSZip().file('part.xml',text).generateAsync({type:'uint8array'})], 'source.pptx',{lastModified:version});
}
function fixture(deps = {}) {
  let changed;
  let stopped = 0;
  const session = createSourceSession({
    watch(_handle,_file,callback,status) { changed = callback; status('watching'); return () => stopped++; },
    snapshot: async zip => (await import('../src/lib/sourceChanges.ts')).snapshotSource(zip),
    compare: async (...args) => (await import('../src/lib/sourceChanges.ts')).readSourceComparison(...args),
    ...deps,
  });
  let state;
  const unsubscribe = session.subscribe(next => state = next);
  return {session, change:file => changed(file), get state(){return state},get stopped(){return stopped},dispose(){session.stop();unsubscribe()}};
}

test('external changes do not apply local edits; failed reload retains markers; success resets baseline', async () => {
  const f=fixture();
  const baseline=new JSZip().file('part.xml','<old/>');
  const initial=await file('<old/>',1), latest=await file('<new/>',2);
  const handle={kind:'file',getFile:async()=>latest};
  f.session.start(initial,baseline,handle);
  const localEdits='<my edits/>';
  await f.change(latest);
  assert.equal(await baseline.file('part.xml').async('string'),'<old/>');
  assert.equal(localEdits,'<my edits/>');
  assert.deepEqual(f.state.changes,[{path:'part.xml',kind:'modified'}]);
  const compared=f.state.latest;
  await f.session.reload(async()=>null);
  assert.equal(f.state.latest,compared);
  assert.equal(f.state.pending,latest);
  assert.equal(f.state.busy,false);
  await f.session.reload(async(file,isCurrent)=> {assert.equal(isCurrent(),true);return JSZip.loadAsync(await file.arrayBuffer())});
  assert.equal(f.state.pending,null);
  assert.equal(f.state.changes.length,0);
  assert.equal(await f.state.baseline.file('part.xml').async('string'),'<new/>');
  f.dispose();
});

test('a metadata-only save clears pending state; latest snapshots still compare to the fixed baseline',async()=>{
  const f=fixture();
  const original=await file('<old/>',1);
  f.session.start(original,new JSZip().file('part.xml','<old/>'),{kind:'file',getFile:async()=>original});
  await f.change(await file('<first/>',2));
  await f.change(await file('<second/>',3));
  assert.equal(await f.state.baseline.file('part.xml').async('string'),'<old/>');
  assert.equal(await f.state.latest.file('part.xml').async('string'),'<second/>');
  await f.change(await file('<old/>',4));
  assert.equal(f.state.pending,null);
  assert.equal(f.state.changes.length,0);
  f.dispose();
});

test('closing a session invalidates an in-flight comparison and releases its watcher',async()=>{
  let finish;
  const f=fixture({compare:()=>new Promise(resolve=>finish=resolve)});
  const initial=await file('<old/>',1);
  f.session.start(initial,new JSZip().file('part.xml','<old/>'),{kind:'file',getFile:async()=>initial});
  const work=f.change(await file('<new/>',2));
  while(!finish) await new Promise(resolve=>setImmediate(resolve));
  f.session.stop();
  finish({zip:new JSZip().file('part.xml','<new/>'),changes:[{path:'part.xml',kind:'modified'}]});
  assert.equal(await work,false);
  assert.equal(f.state.latest,null);
  assert.equal(f.state.checking,false);
  assert.equal(f.stopped,1);
  f.dispose();
});

test('a newer comparison wins and stale results cannot replace its markers',async()=>{
  const completions=[];
  const f=fixture({compare:()=>new Promise(resolve=>completions.push(resolve))});
  const initial=await file('<old/>',1);
  f.session.start(initial,new JSZip().file('part.xml','<old/>'),{kind:'file',getFile:async()=>initial});
  const first=f.change(await file('<first/>',2));
  while(completions.length<1) await new Promise(resolve=>setImmediate(resolve));
  const second=f.change(await file('<second/>',3));
  while(completions.length<2) await new Promise(resolve=>setImmediate(resolve));
  const latest=new JSZip().file('part.xml','<second/>');
  completions[1]({zip:latest,changes:[{path:'part.xml',kind:'modified'}]});
  await second;
  completions[0]({zip:new JSZip(),changes:[]});
  assert.equal(await first,false);
  assert.equal(f.state.latest,latest);
  assert.equal(f.state.changes.length,1);
  f.dispose();
});

test('a package replacement during reload invalidates the apply callback',async()=>{
  const f=fixture();
  const initial=await file('<old/>',1), latest=await file('<new/>',2);
  f.session.start(initial,new JSZip().file('part.xml','<old/>'),{kind:'file',getFile:async()=>latest});
  await f.change(latest);
  let finish, isCurrent;
  const work=f.session.reload(async(_file,current)=>{isCurrent=current;return new Promise(resolve=>finish=resolve)});
  while(!finish) await new Promise(resolve=>setImmediate(resolve));
  f.session.start(initial,new JSZip().file('part.xml','<replacement/>'));
  assert.equal(isCurrent(),false);
  finish(new JSZip().file('part.xml','<new/>'));
  await work;
  assert.equal(await f.state.baseline.file('part.xml').async('string'),'<replacement/>');
  assert.equal(f.state.busy,false);
  f.dispose();
});
