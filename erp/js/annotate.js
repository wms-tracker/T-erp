// ===================================================================
// annotate.js — full-screen canvas editor for marking damage points on
// an evidence photo (สเปกข้อ 25: circle/arrow/line/rectangle/text).
// openAnnotator(imageSrc) returns Promise<Blob|null> — the drawn-on
// image as a new Blob, or null if the user cancelled. The caller is
// responsible for keeping this separate from the original file (per
// spec: "เก็บรูป Original และรูปที่ Annotate แยกกัน") — this module
// never touches the original.
// ===================================================================

const TOOLS = [
  { id: "circle", label: "⭕ วงกลม" },
  { id: "arrow", label: "➡️ ลูกศร" },
  { id: "line", label: "／ เส้น" },
  { id: "rect", label: "▭ สี่เหลี่ยม" },
  { id: "text", label: "🅰️ ข้อความ" },
];
const INK = "#e02424";

export function openAnnotator(imageSrc) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "annotate-overlay";
    overlay.innerHTML = `
      <style>
        .annotate-overlay{position:fixed;inset:0;z-index:80;background:rgba(10,12,24,0.92);display:flex;flex-direction:column;}
        .at-toolbar{display:flex;align-items:center;gap:6px;padding:10px 14px;flex-wrap:wrap;background:rgba(0,0,0,0.3);}
        .at-tool{border:2px solid transparent;background:rgba(255,255,255,0.1);color:#fff;font-size:0.8rem;padding:7px 11px;border-radius:9px;cursor:pointer;font-family:inherit;}
        .at-tool.active{background:#fff;color:#111;border-color:#fff;}
        .at-spacer{flex:1;}
        .at-icon-btn{border:none;background:rgba(255,255,255,0.12);color:#fff;font-size:0.8rem;padding:7px 11px;border-radius:9px;cursor:pointer;font-family:inherit;}
        .at-icon-btn:hover{background:rgba(255,255,255,0.22);}
        .annotate-canvas-wrap{flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:14px;min-height:0;}
        #at-canvas{max-width:100%;max-height:100%;background:#000;border-radius:6px;touch-action:none;cursor:crosshair;box-shadow:0 8px 30px rgba(0,0,0,0.5);}
        .at-footer{display:flex;justify-content:flex-end;gap:10px;padding:12px 14px;background:rgba(0,0,0,0.3);}
        .at-hint{color:rgba(255,255,255,0.55);font-size:0.74rem;padding:0 14px 8px;text-align:center;}
      </style>
      <div class="at-toolbar">
        ${TOOLS.map((t, i) => `<button type="button" class="at-tool ${i === 0 ? "active" : ""}" data-tool="${t.id}">${t.label}</button>`).join("")}
        <span class="at-spacer"></span>
        <button type="button" class="at-icon-btn" id="at-undo">↩ ย้อนกลับ</button>
        <button type="button" class="at-icon-btn" id="at-clear">🗑 ล้างทั้งหมด</button>
      </div>
      <div class="annotate-canvas-wrap"><canvas id="at-canvas"></canvas></div>
      <p class="at-hint">ลากบนรูปเพื่อวาด — เลือกเครื่องมือ "ข้อความ" แล้วแตะจุดที่ต้องการใส่ข้อความ</p>
      <div class="at-footer">
        <button type="button" class="btn btn-outline" id="at-cancel">ยกเลิก</button>
        <button type="button" class="btn btn-primary" id="at-save">✔ บันทึกการวาด</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const canvas = overlay.querySelector("#at-canvas");
    const ctx = canvas.getContext("2d");
    let tool = "circle";
    let history = [];
    let drawing = false;
    let startX = 0, startY = 0;

    function pushHistory() {
      history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (history.length > 25) history.shift();
    }

    function loadImage() {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const maxW = Math.min(img.naturalWidth, window.innerWidth - 40);
        const maxH = Math.min(img.naturalHeight, window.innerHeight - 180);
        const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        pushHistory();
      };
      img.onerror = () => {
        overlay.querySelector(".at-hint").textContent = "โหลดรูปไม่สำเร็จ — อาจเป็นเพราะ CORS ของแหล่งรูปนี้ ปิดหน้าต่างนี้แล้วลองใหม่";
      };
      img.src = imageSrc;
    }
    loadImage();

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      const scaleX = canvas.width / r.width;
      const scaleY = canvas.height / r.height;
      return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
    }

    function drawShape(t, x0, y0, x1, y1) {
      ctx.strokeStyle = INK;
      ctx.fillStyle = INK;
      ctx.lineWidth = Math.max(2, canvas.width / 220);
      if (t === "circle") {
        const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
        ctx.beginPath();
        ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (t === "rect") {
        ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      } else if (t === "line") {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      } else if (t === "arrow") {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        const angle = Math.atan2(y1 - y0, x1 - x0);
        const headLen = Math.max(10, canvas.width / 30);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - headLen * Math.cos(angle - Math.PI / 6), y1 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x1 - headLen * Math.cos(angle + Math.PI / 6), y1 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    }

    overlay.querySelectorAll(".at-tool").forEach((b) => {
      b.addEventListener("click", () => {
        tool = b.dataset.tool;
        overlay.querySelectorAll(".at-tool").forEach((x) => x.classList.toggle("active", x === b));
      });
    });

    canvas.addEventListener("pointerdown", (e) => {
      if (!history.length) return; // image hasn't loaded yet
      const { x, y } = pos(e);
      if (tool === "text") {
        const text = prompt("ใส่ข้อความ:");
        if (text) {
          ctx.fillStyle = INK;
          ctx.font = `bold ${Math.max(16, canvas.width / 26)}px sans-serif`;
          ctx.fillText(text, x, y);
          pushHistory();
        }
        return;
      }
      drawing = true;
      startX = x; startY = y;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const { x, y } = pos(e);
      ctx.putImageData(history[history.length - 1], 0, 0);
      drawShape(tool, startX, startY, x, y);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!drawing) return;
      drawing = false;
      const { x, y } = pos(e);
      ctx.putImageData(history[history.length - 1], 0, 0);
      drawShape(tool, startX, startY, x, y);
      pushHistory();
    });

    overlay.querySelector("#at-undo").addEventListener("click", () => {
      if (history.length > 1) { history.pop(); ctx.putImageData(history[history.length - 1], 0, 0); }
    });
    overlay.querySelector("#at-clear").addEventListener("click", () => {
      if (history.length) { ctx.putImageData(history[0], 0, 0); history = [history[0]]; }
    });
    overlay.querySelector("#at-cancel").addEventListener("click", () => { overlay.remove(); resolve(null); });
    overlay.querySelector("#at-save").addEventListener("click", () => {
      canvas.toBlob((blob) => { overlay.remove(); resolve(blob); }, "image/jpeg", 0.9);
    });
  });
}
