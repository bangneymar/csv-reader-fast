// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// Written from scratch from the competition RULES: same answers, byte for byte,
// much less work. Strategy:
//  - Most records are clean lines (no quote, no stray CR): slice the line and
//    let the native String.split(',') do the field splitting.
//  - Records that do hold a quote or a stray CR go through a slow path that
//    walks fields with indexOf/slice instead of one character at a time, and
//    reproduces the vendor's error policy exactly (stray_cr, quote_junk,
//    unterminated_quote, short_row, long_row, with the same line/row/order).
// No dependencies, no state kept between calls.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and its index in rows (null: header).
  let recordLine = 1;
  let recordRow = null;

  // Result holders for the field readers (avoids an object per field).
  let fVal = '';
  let fEnded = END;
  let fAdded = 0;

  // A segment of a quoted field that holds a CR or LF: each CRLF or lone CR
  // becomes one LF, and every line break in it counts one line.
  function fixSeg(s) {
    let out = '';
    let i = 0;
    let j = 0;
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (c === 13) {
        out += s.slice(j, i) + '\n';
        line += 1;
        i += i + 1 < s.length && s.charCodeAt(i + 1) === 10 ? 2 : 1;
        j = i;
      } else {
        if (c === 10) line += 1;
        i += 1;
      }
    }
    if (j < s.length) out += s.slice(j);
    return out;
  }

  // Reads unquoted characters onto `val` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Sets fVal/fEnded/fAdded.
  function readUnquoted(val) {
    let v = val;
    let added = 0;
    let seg = pos;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 44 || c === 10) {
        if (pos > seg) {
          v += text.slice(seg, pos);
          added += pos - seg;
        }
        pos += 1;
        if (c === 10) line += 1;
        fVal = v;
        fAdded = added;
        fEnded = c === 44 ? COMMA : LINE_BREAK;
        return;
      }
      if (c === 13) {
        if (pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
          if (pos > seg) {
            v += text.slice(seg, pos);
            added += pos - seg;
          }
          pos += 2;
          line += 1;
          fVal = v;
          fAdded = added;
          fEnded = LINE_BREAK;
          return;
        }
        if (pos > seg) {
          v += text.slice(seg, pos);
          added += pos - seg;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        seg = pos;
        continue;
      }
      pos += 1;
    }
    if (pos > seg) {
      v += text.slice(seg, pos);
      added += pos - seg;
    }
    fVal = v;
    fAdded = added;
    fEnded = END;
  }

  // Reads a quoted field whose opening quote is at pos. Sets fVal/fEnded/fAdded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let v = '';
    let start = pos + 1;
    for (;;) {
      const q = text.indexOf('"', start);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      let seg = text.slice(start, q);
      if (seg.indexOf('\r') !== -1 || seg.indexOf('\n') !== -1) seg = fixSeg(seg);
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        // Doubled quote: one quote in the value, keep scanning.
        v += seg;
        v += '"';
        start = q + 2;
        continue;
      }
      v += seg;
      pos = q + 1;
      if (pos >= n) {
        fVal = v;
        fAdded = 0;
        fEnded = END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fVal = v;
        fAdded = 0;
        fEnded = COMMA;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fVal = v;
        fAdded = 0;
        fEnded = LINE_BREAK;
        return;
      }
      if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fVal = v;
        fAdded = 0;
        fEnded = LINE_BREAK;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      readUnquoted(v);
      if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the whole record is one line whose fields hold no quote at
    // their start (a quote mid-field is a literal, and split-compatible) and
    // no CR except a CRLF ending. Scan commas with indexOf; bail to the slow
    // path (restoring pos) the moment a field breaks that.
    const eol = text.indexOf('\n', pos);
    const end = eol === -1 ? n : eol;
    const recStart = pos;
    let fields = null;
    {
      const f = [];
      let s = pos;
      let ok = true;
      for (;;) {
        const c = text.indexOf(',', s);
        if (c === -1 || c >= end) {
          let last = text.slice(s, end);
          if (last.charCodeAt(0) === 34) { ok = false; break; }
          const ri = last.indexOf('\r');
          if (ri !== -1) {
            if (ri === last.length - 1 && eol !== -1) last = last.slice(0, -1);
            else { ok = false; break; }
          }
          f.push(last);
          break;
        }
        const fld = text.slice(s, c);
        if (fld.charCodeAt(0) === 34 || fld.indexOf('\r') !== -1) { ok = false; break; }
        f.push(fld);
        s = c + 1;
      }
      if (ok) {
        fields = f;
        pos = eol === -1 ? n : eol + 1;
        if (eol !== -1) line += 1;
      } else {
        pos = recStart;
      }
    }
    if (fields !== null) {
    } else {
      // Slow path: field by field, exactly as the vendor reads them.
      fields = [];
      let quoted = false;
      do {
        quoted = text.charCodeAt(pos) === 34;
        if (quoted) readQuoted();
        else readUnquoted('');
        fields.push(fVal);
      } while (fEnded === COMMA);

      // A line that held only stray CRs is left with no characters: no record.
      if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
