import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {isTextPart,decodePart,encodePart,displayXml} from '../src/lib/partContent.ts';
import {loadOfficeFile} from '../src/lib/ooxml.ts';
import {readSourceDiff} from '../src/lib/sourceChanges.ts';

test('loader and diff share VML classification and BOM-marked UTF-16 decoding',async()=>{
  const text='<root><item>你好</item></root>';
  const bytes=new Uint8Array([255,254,...Buffer.from(text,'utf16le')]);
  const zip=new JSZip().file('word/drawing.vml',bytes);
  const file=new File([await zip.generateAsync({type:'uint8array'})],'sample.docx');
  const opened=await loadOfficeFile(file);
  assert.equal(opened.entries[0].isBinary,false);
  assert.equal(opened.entries[0].content,text);
  const diff=await readSourceDiff(zip,zip,{path:'word/drawing.vml',kind:'unchanged'});
  assert.equal(diff.before,opened.entries[0].content);
  assert.equal(diff.binary,false);
  assert.equal(isTextPart('PART.XML'),true);
  assert.equal(isTextPart('font.bin'),false);
  assert.equal(decodePart(new TextEncoder().encode(text)),text);
});

test('display formatting falls back when input cannot be parsed',()=>{
  assert.equal(displayXml('<x a='),'<x a=');
  assert.equal(displayXml(''),'');
});

test('exported bytes agree with UTF-16 declarations and preserve non-ASCII text',()=>{
  for (const encoding of ['UTF-16','UTF-16LE','UTF-16BE']) {
    const value=`<?xml version="1.0" encoding="${encoding}"?><x>你好 😀</x>`;
    const bytes=encodePart(value);
    assert.equal(decodePart(bytes),value);
    assert.equal(bytes[0],encoding === 'UTF-16BE' ? 254 : 255);
  }
  assert.equal(decodePart(encodePart('<x>你好</x>')),'<x>你好</x>');
});
