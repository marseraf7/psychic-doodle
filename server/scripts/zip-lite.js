/*
 * Ghi file ZIP không cần công cụ ngoài (zlib của Node: deflateRawSync + crc32) – cho gói bản cổng game (build-portal.js).
 * Chỉ đủ cho việc này: file thường, tên UTF-8, < 4 GB, < 65 535 file (không ZIP64, không mã hoá).
 *   zipFiles([{ name: 'index.html', data: Buffer }]) → Buffer
 *   listDir(dir) → [{ name (đường dẫn tương đối, dấu '/'), file (đường dẫn đầy đủ) }] – sắp xếp, index.html đứng đầu
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Ngày giờ kiểu DOS cố định (1/1/2026 00:00): cùng nội dung → cùng file ZIP (dễ so, dễ lưu lâu)
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function zipFiles(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = packed.length < data.length;
    const body = useDeflate ? packed : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // phiên bản cần để giải nén
    local.writeUInt16LE(0x0800, 6); // tên UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(useDeflate ? 8 : 0, 10);
    cen.writeUInt16LE(DOS_TIME, 12);
    cen.writeUInt16LE(DOS_DATE, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, body);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}

function listDir(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.isFile()) out.push({ name: path.relative(dir, f).split(path.sep).join('/'), file: f });
    }
  };
  walk(dir);
  return out.sort((a, b) => (a.name === 'index.html' ? -1 : b.name === 'index.html' ? 1 : a.name < b.name ? -1 : 1));
}

module.exports = { zipFiles, listDir };
