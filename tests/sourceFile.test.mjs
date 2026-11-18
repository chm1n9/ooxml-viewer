import assert from 'node:assert/strict';
import {watchSourceFile,droppedSource,pickSourceFile} from '../src/lib/sourceFile.ts';
let queue=new Map(),serial=0;
globalThis.setTimeout=fn=>{queue.set(++serial,fn);return serial};
globalThis.clearTimeout=id=>queue.delete(id);
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
const step=async()=>{const [id,fn]=queue.entries().next().value;queue.delete(id);fn();await flush()};
const make=n=>new File(['source '+n],'test.docx',{lastModified:n});
let current=make(1),calls=[],states=[],accept=true,fail=false;
const handle={kind:'file',getFile:async()=>{if(fail)throw new DOMException('locked','NotReadableError');return current}};
let stop=watchSourceFile(handle,current,async f=>{calls.push(f.lastModified);return accept},s=>states.push(s),1);
await step();assert.deepEqual(calls,[]);
current=make(2);await step();assert.deepEqual(calls,[]);await step();assert.deepEqual(calls,[2]);
await step();assert.deepEqual(calls,[2]);
current=make(3);accept=false;await step();await step();assert.equal(states.at(-1),'retrying');
accept=true;await step();assert.deepEqual(calls,[2,3,3]);
fail=true;await step();assert.equal(states.at(-1),'retrying');fail=false;await step();assert.equal(states.at(-1),'watching');
stop();assert.equal(queue.size,0);
// Cancelling during an outstanding read must suppress callbacks and new timers.
let resolveRead;stop=watchSourceFile({kind:'file',getFile:()=>new Promise(resolve=>{resolveRead=resolve})},make(1),async()=>{throw Error('stale callback')},()=>{},1);
await step();stop();resolveRead(make(9));await flush();assert.equal(queue.size,0);
// Permission loss stops polling.
stop=watchSourceFile({kind:'file',getFile:async()=>{throw new DOMException('denied','NotAllowedError')}},make(1),async()=>true,s=>states.push(s),1);
await step();assert.equal(states.at(-1),'unavailable');assert.equal(queue.size,0);stop();
// Both drag entry paths, including synchronous handle errors.
const transfer={files:[make(4)],items:[{kind:'file',getAsFileSystemHandle:async()=>handle}]};
assert.equal((await droppedSource(transfer)).handle,handle);
assert.equal((await droppedSource({...transfer,items:[]})).file.lastModified,4);
assert.equal((await droppedSource({...transfer,items:[{kind:'file',getAsFileSystemHandle(){throw Error('blocked')}}]})).file.lastModified,4);
// Picker supported, unsupported, cancellation, blocked API fallback.
globalThis.window={showOpenFilePicker:async()=>[handle]};assert.equal((await pickSourceFile()).handle,handle);
globalThis.window={};assert.equal(await pickSourceFile(),undefined);
globalThis.window={showOpenFilePicker:async()=>{throw new DOMException('cancel','AbortError')}};assert.equal(await pickSourceFile(),null);
globalThis.window={showOpenFilePicker:async()=>{throw new DOMException('blocked','SecurityError')}};assert.equal(await pickSourceFile(),undefined);
console.log('Passed: stable changes, retries, recoveries, no duplicates, cancellation, permission loss, drag/picker/fallback paths');
// Native observer path: no idle polling; stable event-driven checks and cleanup.
let native,reads=0;
class Observer {
 constructor(callback){this.callback=callback;this.disconnected=0;native=this}
 async observe(){}
 disconnect(){this.disconnected++}
 emit(type){this.callback([{type}])}
}
globalThis.FileSystemObserver=Observer;current=make(1);calls=[];
const counted={kind:'file',getFile:async()=>{reads++;return current}};
stop=watchSourceFile(counted,current,async file=>{calls.push(file.lastModified);return true},s=>states.push(s),1);
await flush();await step();assert.equal(queue.size,0);assert.equal(reads,1);
current=make(2);native.emit('modified');await step();assert.deepEqual(calls,[]);await step();assert.deepEqual(calls,[2]);assert.equal(queue.size,0);
native.emit('unknown');await step();assert.equal(queue.size,0);
native.emit('errored');assert.ok(native.disconnected);await step();assert.equal(queue.size,1);stop();assert.equal(queue.size,0);
// Construction and observation failures both fall back to polling.
for(const broken of [class{constructor(){throw Error('unsupported')}},class extends Observer{async observe(){throw Error('unsupported handle')}}]){
 globalThis.FileSystemObserver=broken;current=make(1);calls=[];
 stop=watchSourceFile(counted,current,async file=>{calls.push(file.lastModified);return true},()=>{},1);
 await flush();current=make(7);await step();await step();assert.deepEqual(calls,[7]);stop();assert.equal(queue.size,0);
}
// Late initialization cannot restart a stopped watcher and is disconnected again.
let resolveObserve;
globalThis.FileSystemObserver=class extends Observer{observe(){return new Promise(resolve=>{resolveObserve=resolve})}};
stop=watchSourceFile(counted,current,async()=>true,()=>{},1);stop();resolveObserve();await flush();assert.equal(queue.size,0);assert.ok(native.disconnected>=2);
delete globalThis.FileSystemObserver;
console.log('Passed: native events, no idle polling, unknown events, runtime fallback, initialization failures, pending-observe cleanup');
