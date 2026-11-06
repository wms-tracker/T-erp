function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Rasterizes the live 2D-plan SVG to a PNG at 2x pixel density, filling in the app's dark
 *  background first since the SVG itself is transparent. */
export function exportSvgToPng(svg: SVGSVGElement, filename: string) {
  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(rect.width));
  clone.setAttribute("height", String(rect.height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const svgString = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }));

  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0e1318";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((blob) => blob && downloadBlob(blob, filename), "image/png");
  };
  img.src = svgUrl;
}

/** Grabs the current frame of a (WebGL) canvas as a PNG. Requires `preserveDrawingBuffer: true`
 *  on the renderer, otherwise the buffer may already be cleared by the time toBlob() reads it. */
export function exportCanvasToPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => blob && downloadBlob(blob, filename), "image/png");
}
