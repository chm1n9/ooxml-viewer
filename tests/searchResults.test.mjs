import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {SearchQuery} from '@codemirror/search';
import {collectSearchResults,searchResultLabel} from '../src/lib/searchResults.ts';

const state=EditorState.create({doc:'cat CAT scatter cat\n猫 猫'});
test('counts matches using the same query semantics as CodeMirror and reports the selected index',()=>{
  const results=collectSearchResults(state,new SearchQuery({search:'cat'}));
  assert.equal(results.ranges.length,4);
  assert.equal(searchResultLabel(results,results.ranges[1]),'2 / 4');
  assert.equal(searchResultLabel(results,{from:1,to:1}),'4 results');
  assert.equal(collectSearchResults(state,new SearchQuery({search:'cat',caseSensitive:true})).ranges.length,3);
  assert.equal(collectSearchResults(state,new SearchQuery({search:'cat',wholeWord:true})).ranges.length,3);
  assert.equal(collectSearchResults(state,new SearchQuery({search:'猫'})).ranges.length,2);
});
test('empty, invalid and unmatched queries have no matches',()=>{
  for(const query of [new SearchQuery({search:''}),new SearchQuery({search:'[',regexp:true}),new SearchQuery({search:'missing'})]) {
    assert.equal(collectSearchResults(state,query).ranges.length,0);
  }
});
test('regular expressions and zero-length matches are bounded without affecting native navigation',()=>{
  const query=new SearchQuery({search:'(?=a)',regexp:true});
  const results=collectSearchResults(EditorState.create({doc:'aaaa'}),query,2);
  assert.equal(results.ranges.length,2);
  assert.equal(results.truncated,true);
  assert.equal(searchResultLabel(results,results.ranges[1]),'2 / 2+');
  const exact=collectSearchResults(EditorState.create({doc:'aa'}),query,2);
  assert.equal(exact.truncated,false);
});
