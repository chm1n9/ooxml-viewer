import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPackageIndex} from '../src/lib/packageIndex.ts';
import {resolveTarget} from '../src/lib/relsGraph.ts';

test('root and nested relationship parts resolve relative to their owner directory',()=>{
  assert.equal(resolveTarget('_rels/part.xml.rels','other.xml'),'other.xml');
  assert.equal(resolveTarget('_rels/.rels','ppt/presentation.xml'),'ppt/presentation.xml');
  assert.equal(resolveTarget('ppt/slides/_rels/slide1.xml.rels','../theme/theme1.xml'),'ppt/theme/theme1.xml');
});

test('ordinary edits retain the tree and relation index; editing one rels reparses only its edges',()=>{
  const reads=[];
  const entries=[
    {path:'part.xml',content:'<x/>',isBinary:false},
    {path:'other.xml',content:'<y/>',isBinary:false},
    {path:'_rels/part.xml.rels',content:'other.xml',isBinary:false},
    {path:'_rels/other.xml.rels',content:'part.xml',isBinary:false},
  ];
  const index=createPackageIndex(entries,(path,content,existing)=>{
    reads.push(path);
    return existing.has(content) ? new Map([['rId1',content]]) : new Map();
  });
  assert.equal(reads.length,2);
  const tree=index.treeEntries, otherTargets=index.targetsFor('other.xml');
  assert.equal(index.update('part.xml','<changed/>'),false);
  assert.equal(reads.length,2);
  assert.equal(index.treeEntries,tree);
  assert.equal(index.treeEntries[0].content,'');
  assert.deepEqual([...index.references.get('part.xml')],['other.xml']);
  assert.deepEqual([...index.referencedBy.get('other.xml')],['part.xml']);
  assert.equal(index.update('_rels/part.xml.rels','part.xml'),true);
  assert.equal(reads.length,3);
  assert.equal(index.targetsFor('other.xml'),otherTargets);
  assert.equal(index.referencedBy.has('other.xml'),false);
  assert.deepEqual([...index.referencedBy.get('part.xml')].sort(),['other.xml','part.xml']);
  assert.equal(index.update('_rels/part.xml.rels','part.xml'),false);
  assert.equal(reads.length,3);
  assert.equal(index.targetsFor('_rels/part.xml.rels').get('rId1'),'part.xml');
});

test('missing targets do not create navigable references and a new package resets its structure',()=>{
  const parse=(_path,content,paths)=>paths.has(content) ? new Map([['r',content]]) : new Map();
  const original=createPackageIndex([{path:'_rels/.rels',content:'missing.xml',isBinary:false}],parse);
  assert.equal(original.references.size,0);
  const replacement=createPackageIndex([{path:'new.xml',content:'<new/>',isBinary:false}],parse);
  assert.equal(original.paths.has('new.xml'),false);
  assert.equal(replacement.paths.has('_rels/.rels'),false);
});
