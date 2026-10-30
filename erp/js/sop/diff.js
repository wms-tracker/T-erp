/* เปรียบเทียบข้อความระดับคำ (รองรับภาษาไทยด้วย Intl.Segmenter) */

  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  function tokens(s) {
    s = String(s || '');
    if (seg) return Array.from(seg.segment(s), x => x.segment);
    return s.split(/(\s+)/).filter(Boolean);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  /** คืนค่า HTML ที่มี <ins>/<del> */
  function diffHtml(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a === b) return esc(a);
    let A = tokens(a), B = tokens(b);
    // ตัดส่วนหน้า/หลังที่เหมือนกันออกก่อน เพื่อลดขนาดตาราง LCS
    let pre = 0; while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
    let suf = 0; while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
    const head = A.slice(0, pre).join(''), tail = suf ? A.slice(A.length - suf).join('') : '';
    A = A.slice(pre, A.length - suf); B = B.slice(pre, B.length - suf);
    if (A.length * B.length > 4000000) return esc(head) + (A.length ? `<del>${esc(A.join(''))}</del>` : '') + (B.length ? `<ins>${esc(B.join(''))}</ins>` : '') + esc(tail);
    const n = A.length, m = B.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0, j = 0, cur = null, buf = '';
    const push = (t, s) => { if (t !== cur) { flush(); cur = t; } buf += s; };
    const flush = () => { if (!buf) return; out.push(cur === 'd' ? `<del>${esc(buf)}</del>` : cur === 'i' ? `<ins>${esc(buf)}</ins>` : esc(buf)); buf = ''; };
    while (i < n && j < m) {
      if (A[i] === B[j]) { push('s', A[i]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { push('d', A[i]); i++; }
      else { push('i', B[j]); j++; }
    }
    while (i < n) push('d', A[i++]);
    while (j < m) push('i', B[j++]);
    flush();
    return esc(head) + out.join('') + esc(tail);
  }
  export { diffHtml };
