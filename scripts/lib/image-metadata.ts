/**
 * Detecta metadados que podem vazar informação (EXIF com GPS/câmera/autor, XMP)
 * em JPEG, PNG e WebP, sem dependências. Remova com: exiftool -all= arquivo
 */
export type MetadataFinding = 'EXIF' | 'XMP' | 'unsupported-format';

const XMP_NS = Buffer.from('http://ns.adobe.com/xap/1.0/');

function jpeg(buf: Buffer): MetadataFinding[] {
  const found = new Set<MetadataFinding>();
  let offset = 2; // depois do SOI (FFD8)
  while (offset + 4 <= buf.length && buf[offset] === 0xff) {
    const marker = buf[offset + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) break; // início dos dados da imagem / fim
    const length = buf.readUInt16BE(offset + 2);
    if (marker === 0xe1) {
      const payload = buf.subarray(offset + 4, offset + 2 + length);
      if (payload.subarray(0, 6).equals(Buffer.from('Exif\0\0', 'binary'))) found.add('EXIF');
      if (payload.subarray(0, XMP_NS.length).equals(XMP_NS)) found.add('XMP');
    }
    offset += 2 + length;
  }
  return [...found];
}

function png(buf: Buffer): MetadataFinding[] {
  const found = new Set<MetadataFinding>();
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'eXIf') found.add('EXIF');
    if ((type === 'iTXt' || type === 'tEXt' || type === 'zTXt') && data.toString('latin1').startsWith('XML:com.adobe.xmp')) {
      found.add('XMP');
    }
    if ((type === 'tEXt' || type === 'zTXt') && data.toString('latin1').startsWith('Raw profile type exif')) {
      found.add('EXIF');
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return [...found];
}

function webp(buf: Buffer): MetadataFinding[] {
  const found = new Set<MetadataFinding>();
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const type = buf.toString('latin1', offset, offset + 4);
    const length = buf.readUInt32LE(offset + 4);
    if (type === 'EXIF') found.add('EXIF');
    if (type === 'XMP ') found.add('XMP');
    offset += 8 + length + (length % 2);
  }
  return [...found];
}

export function imageMetadata(path: string, buf: Buffer): MetadataFinding[] {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  if (ext === 'svg' || ext === 'ico' || ext === 'gif') return [];
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpeg(buf);
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return png(buf);
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return webp(buf);
  return ['unsupported-format'];
}
