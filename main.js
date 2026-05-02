import { removeBackground } from "@imgly/background-removal";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const previewSection = document.getElementById("previewSection");
const originalImg = document.getElementById("originalImg");
const resultImg = document.getElementById("resultImg");
const loadingOverlay = document.getElementById("loadingOverlay");
const progressText = document.getElementById("progressText");
const downloadBtn = document.getElementById("downloadBtn");
const resetBtn = document.getElementById("resetBtn");
const errorMsg = document.getElementById("errorMsg");
const manualCropBtn = document.getElementById("manualCropBtn");
const cropOverlay = document.getElementById("cropOverlay");
const cropCanvas = document.getElementById("cropCanvas");
const cropHint = document.getElementById("cropHint");
const applyCropBtn = document.getElementById("applyCropBtn");
const cancelCropBtn = document.getElementById("cancelCropBtn");

let resultBlobUrl = null;
let currentMode = "both";

// ── Manual crop ──────────────────────────────────────────────────────────────
let cropState = { active: false, start: null, current: null, dragging: false };

function enterCropMode() {
  const rect = resultImg.getBoundingClientRect();
  cropCanvas.width = Math.round(rect.width);
  cropCanvas.height = Math.round(rect.height);
  cropState = { active: true, start: null, current: null, dragging: false };
  cropHint.textContent = "Drag to select crop area";
  cropOverlay.hidden = false;
  drawCropCanvas();
}

function exitCropMode() {
  cropOverlay.hidden = true;
  cropState = { active: false, start: null, current: null, dragging: false };
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function getCanvasPos(e) {
  const rect = cropCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clamp(clientX - rect.left, 0, cropCanvas.width),
    y: clamp(clientY - rect.top,  0, cropCanvas.height),
  };
}

function drawCropCanvas() {
  const ctx = cropCanvas.getContext("2d");
  const W = cropCanvas.width, H = cropCanvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);

  const { start, current } = cropState;
  if (!start || !current) return;

  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const w = Math.abs(current.x - start.x);
  const h = Math.abs(current.y - start.y);
  if (w < 2 || h < 2) return;

  ctx.clearRect(x, y, w, h);

  // Rule-of-thirds guides
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(x + (w / 3) * i, y); ctx.lineTo(x + (w / 3) * i, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + (h / 3) * i); ctx.lineTo(x + w, y + (h / 3) * i); ctx.stroke();
  }

  ctx.strokeStyle = "#7c6ff7";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

  const hs = 7;
  ctx.fillStyle = "#fff";
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
    ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
  });
}

cropCanvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  cropState.start = getCanvasPos(e);
  cropState.current = { ...cropState.start };
  cropState.dragging = true;
  drawCropCanvas();
});

document.addEventListener("mousemove", (e) => {
  if (!cropState.dragging) return;
  cropState.current = getCanvasPos(e);
  drawCropCanvas();
});

document.addEventListener("mouseup", () => {
  if (!cropState.dragging) return;
  cropState.dragging = false;
  const w = cropState.current ? Math.abs(cropState.current.x - cropState.start.x) : 0;
  const h = cropState.current ? Math.abs(cropState.current.y - cropState.start.y) : 0;
  if (w > 5 && h > 5) {
    cropHint.textContent = "Adjust selection or click Apply Crop";
  } else {
    cropState.start = null;
    cropState.current = null;
    cropHint.textContent = "Drag to select crop area";
    drawCropCanvas();
  }
});

cropCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  cropState.start = getCanvasPos(e);
  cropState.current = { ...cropState.start };
  cropState.dragging = true;
  drawCropCanvas();
}, { passive: false });

cropCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (!cropState.dragging) return;
  cropState.current = getCanvasPos(e);
  drawCropCanvas();
}, { passive: false });

cropCanvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  cropState.dragging = false;
  const w = cropState.current ? Math.abs(cropState.current.x - cropState.start.x) : 0;
  const h = cropState.current ? Math.abs(cropState.current.y - cropState.start.y) : 0;
  if (!(w > 5 && h > 5)) {
    cropState.start = null; cropState.current = null;
    drawCropCanvas();
  }
  cropHint.textContent = w > 5 && h > 5 ? "Tap Apply Crop to confirm" : "Drag to select crop area";
}, { passive: false });

applyCropBtn.addEventListener("click", async () => {
  const { start, current } = cropState;
  if (!start || !current) return;

  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const w = Math.abs(current.x - start.x);
  const h = Math.abs(current.y - start.y);
  if (w < 5 || h < 5) return;

  const scaleX = resultImg.naturalWidth  / cropCanvas.width;
  const scaleY = resultImg.naturalHeight / cropCanvas.height;
  const cropX = Math.round(x * scaleX);
  const cropY = Math.round(y * scaleY);
  const cropW = Math.round(w * scaleX);
  const cropH = Math.round(h * scaleY);

  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;

  const img = new Image();
  img.src = resultBlobUrl;
  await new Promise((resolve) => { img.onload = resolve; });
  out.getContext("2d").drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  out.toBlob((blob) => {
    if (!blob) return;
    if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
    resultBlobUrl = URL.createObjectURL(blob);
    resultImg.src = resultBlobUrl;
    resultImg.decode().then(() => {
      downloadBtn.dataset.blobUrl = resultBlobUrl;
      exitCropMode();
    });
  }, "image/png");
});

cancelCropBtn.addEventListener("click", exitCropMode);
manualCropBtn.addEventListener("click", enterCropMode);
// ─────────────────────────────────────────────────────────────────────────────

const resultLabel = document.getElementById("resultLabel");
const modeLabels = { both: "Background Removed + Cropped", remove: "Background Removed", crop: "Cropped" };

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
    resultLabel.textContent = modeLabels[currentMode];
  });
});

function cropTransparent(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minX = width, minY = height, maxX = 0, maxY = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3];
          if (alpha > 20) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Nothing visible at all — return original
      if (minX > maxX || minY > maxY) { resolve(blob); return; }

      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const out = document.createElement("canvas");
      out.width = cropW;
      out.height = cropH;
      out.getContext("2d").drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      out.toBlob((cropped) => resolve(cropped ?? blob), "image/png");
    };
    img.src = url;
  });
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.hidden = false;
  loadingOverlay.style.display = "none";
}

function clearError() {
  errorMsg.hidden = true;
  errorMsg.textContent = "";
}

function showLoading(msg = "Loading AI model…") {
  loadingOverlay.style.display = "flex";
  progressText.textContent = msg;
}

function hideLoading() {
  loadingOverlay.style.display = "none";
}

async function processImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    showError("Please drop a valid image file (PNG, JPEG, WebP, etc.)");
    return;
  }

  clearError();

  // Show original preview immediately
  const originalUrl = URL.createObjectURL(file);
  originalImg.src = originalUrl;
  resultImg.src = "";
  resultImg.style.opacity = "0";
  previewSection.hidden = false;
  downloadBtn.disabled = true;

  const needsRemove = currentMode === "remove" || currentMode === "both";
  const needsCrop   = currentMode === "crop"   || currentMode === "both";

  showLoading(needsRemove
    ? "Loading AI model… (first run downloads ~80 MB, cached after)"
    : "Cropping transparent space…");

  try {
    let result = file;

    if (needsRemove) {
      result = await removeBackground(file, {
        model: "isnet_fp16",
        output: { format: "image/png" },
        progress: (key, current, total) => {
          if (total > 0) {
            const pct = Math.round((current / total) * 100);
            progressText.textContent = `${key === "compute:inference" ? "Removing background" : "Downloading model"} — ${pct}%`;
          }
        },
      });
    }

    if (needsCrop) {
      progressText.textContent = "Cropping transparent space…";
      result = await cropTransparent(result);
    }

    if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
    resultBlobUrl = URL.createObjectURL(result);

    resultImg.src = resultBlobUrl;
    await resultImg.decode();
    resultImg.style.opacity = "1";
    hideLoading();
    downloadBtn.disabled = false;
    manualCropBtn.disabled = false;
    downloadBtn.dataset.blobUrl = resultBlobUrl;
    const suffix = currentMode === "crop" ? "_cropped" : "_nobg";
    downloadBtn.dataset.filename = file.name.replace(/\.[^.]+$/, "") + suffix + ".png";
  } catch (err) {
    showError("Processing failed: " + (err.message || err));
    console.error(err);
  }
}

// Drag and drop
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  processImage(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) processImage(fileInput.files[0]);
});

downloadBtn.addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = downloadBtn.dataset.blobUrl;
  a.download = downloadBtn.dataset.filename;
  a.click();
});

resetBtn.addEventListener("click", () => {
  previewSection.hidden = true;
  originalImg.src = "";
  resultImg.src = "";
  downloadBtn.disabled = true;
  manualCropBtn.disabled = true;
  exitCropMode();
  clearError();
  if (resultBlobUrl) {
    URL.revokeObjectURL(resultBlobUrl);
    resultBlobUrl = null;
  }
  fileInput.value = "";
});
