/*
 * Download único do Livro e relatório como dois PDFs dentro de um ZIP.
 * ZIP sem compressão adicional: os PDFs já vêm comprimidos.
 * Sem CDN e sem enviar dados operacionais para outros serviços.
 */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view, index, value) {
  view.setUint16(index, value, true);
}
function write32(view, index, value) {
  view.setUint32(index, value >>> 0, true);
}
function zipTimestamp(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

export async function createSamuPdfArchive(files) {
  if (!Array.isArray(files) || !files.length || files.length > 100) {
    throw new Error('Informe os arquivos PDF do relatório.');
  }
  const encoder = new TextEncoder();
  const parts = [], directory = [];
  const {time, day} = zipTimestamp(new Date());
  let offset = 0;

  for (const file of files) {
    const filename = String(file.name || '').replace(/[\\/]/g, '_');
    if (!/^[a-z0-9_. -]+\.pdf$/i.test(filename)) {
      throw new Error('Nome inválido para o PDF no arquivo ZIP.');
    }
    const nameBytes = encoder.encode(filename);
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    if (bytes.length > 0xffffffff || offset > 0xffffffff) {
      throw new Error('Relatório muito grande para exportar em ZIP.');
    }
    const checksum = crc32(bytes);

    const local = new Uint8Array(30);
    const lv = new DataView(local.buffer);
    write32(lv, 0, 0x04034b50);
    write16(lv, 4, 20); // versão ZIP
    write16(lv, 6, 0x0800); // nome UTF-8
    write16(lv, 8, 0); // STORE (PDF já comprimido)
    write16(lv, 10, time);
    write16(lv, 12, day);
    write32(lv, 14, checksum);
    write32(lv, 18, bytes.length);
    write32(lv, 22, bytes.length);
    write16(lv, 26, nameBytes.length);
    write16(lv, 28, 0);
    parts.push(local, nameBytes, bytes);

    const central = new Uint8Array(46);
    const cv = new DataView(central.buffer);
    write32(cv, 0, 0x02014b50);
    write16(cv, 4, 20);
    write16(cv, 6, 20);
    write16(cv, 8, 0x0800);
    write16(cv, 10, 0);
    write16(cv, 12, time);
    write16(cv, 14, day);
    write32(cv, 16, checksum);
    write32(cv, 20, bytes.length);
    write32(cv, 24, bytes.length);
    write16(cv, 28, nameBytes.length);
    write16(cv, 30, 0);
    write16(cv, 32, 0);
    write16(cv, 34, 0);
    write16(cv, 36, 0);
    write32(cv, 38, 0);
    write32(cv, 42, offset);
    directory.push(central, nameBytes);

    offset += local.length + nameBytes.length + bytes.length;
  }
  const centralSize = directory.reduce((total, part) => total + part.length, 0);
  if (offset + centralSize > 0xffffffff) throw new Error('ZIP maior que o limite suportado.');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  write32(ev, 0, 0x06054b50);
  write16(ev, 4, 0);
  write16(ev, 6, 0);
  write16(ev, 8, files.length);
  write16(ev, 10, files.length);
  write32(ev, 12, centralSize);
  write32(ev, 16, offset);
  write16(ev, 20, 0);
  return new Blob([...parts, ...directory, end], {type: 'application/zip'});
}

export function downloadSamuFile(blob, filename) {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('O documento não foi gerado corretamente. Tente novamente.');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
