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

let resultBlobUrl = null;

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

  showLoading("Loading AI model… (first run downloads ~80 MB, cached after)");

  try {
    const blob = await removeBackground(file, {
      model: "isnet_fp16",
      output: { format: "image/png" },
      progress: (key, current, total) => {
        if (total > 0) {
          const pct = Math.round((current / total) * 100);
          progressText.textContent = `${key === "compute:inference" ? "Removing background" : "Downloading model"} — ${pct}%`;
        }
      },
    });

    progressText.textContent = "Cropping transparent space…";
    const cropped = await cropTransparent(blob);

    if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
    resultBlobUrl = URL.createObjectURL(cropped);

    resultImg.src = resultBlobUrl;
    await resultImg.decode();
    resultImg.style.opacity = "1";
    hideLoading();
    downloadBtn.disabled = false;
    downloadBtn.dataset.blobUrl = resultBlobUrl;
    downloadBtn.dataset.filename = file.name.replace(/\.[^.]+$/, "") + "_nobg.png";
  } catch (err) {
    showError("Background removal failed: " + (err.message || err));
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
  clearError();
  if (resultBlobUrl) {
    URL.revokeObjectURL(resultBlobUrl);
    resultBlobUrl = null;
  }
  fileInput.value = "";
});
