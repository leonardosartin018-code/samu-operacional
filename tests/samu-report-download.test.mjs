import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../samu-report-download.js',import.meta.url),'utf8');
const {createSamuPdfArchive}=
  await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('exporta um único ZIP contendo dois arquivos PDF íntegros',async()=>{
  const first=new TextEncoder().encode('%PDF-1.4\nLIVRO TESTE');
  const second=new TextEncoder().encode('%PDF-1.4\nRELATORIO TESTE');
  const entries=[
    {name:'SAMU_LIVRO_OFICIAL_2026-11-15_DIURNO.pdf',blob:new Blob([first])},
    {name:'SAMU_RELATORIO_COMPLETO_2026-11-15_DIURNO.pdf',blob:new Blob([second])}
  ];
  const zip=await createSamuPdfArchive(entries);
  assert.equal(zip.type,'application/zip');
  const bytes=new Uint8Array(await zip.arrayBuffer());
  const view=new DataView(bytes.buffer);
  let offset=0;
  for(let i=0;i<entries.length;i++){
    assert.equal(view.getUint32(offset,true),0x04034b50);
    assert.equal(view.getUint16(offset+8,true),0); // sem compressão redundante
    const length=view.getUint32(offset+18,true);
    const nameLength=view.getUint16(offset+26,true);
    const start=offset+30;
    const name=new TextDecoder().decode(bytes.slice(start,start+nameLength));
    assert.equal(name,entries[i].name);
    const data=bytes.slice(start+nameLength,start+nameLength+length);
    assert.equal(new TextDecoder().decode(data),
      i===0?'%PDF-1.4\nLIVRO TESTE':'%PDF-1.4\nRELATORIO TESTE');
    offset=start+nameLength+length;
  }
  const endOffset=bytes.length-22;
  assert.equal(view.getUint32(endOffset,true),0x06054b50);
  assert.equal(view.getUint16(endOffset+10,true),2);
  assert.equal(view.getUint32(endOffset+16,true),offset);
});

test('recusa nomes maliciosos e extensões que não sejam PDF',async()=>{
  await assert.rejects(()=>createSamuPdfArchive([{name:'outro.zip',blob:new Blob(['x'])}]));
  await assert.rejects(()=>createSamuPdfArchive([]));
});

test('é possível gerar arquivo de apenas um PDF, se necessário',async()=>{
  const zip=await createSamuPdfArchive([{name:'relatorio.pdf',blob:new Blob(['%PDF-1.4'])}]);
  assert.ok(zip.size>50);
});
