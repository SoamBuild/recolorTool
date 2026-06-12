const imageInput = document.getElementById("imageInput");
const dropZone = document.getElementById("dropZone");
const fileInfo = document.getElementById("fileInfo");
const hexInput = document.getElementById("hexInput");
const colorInput = document.getElementById("colorInput");
const modeSelect = document.getElementById("modeSelect");
const sensitivityInput = document.getElementById("sensitivityInput");
const sensitivityValue = document.getElementById("sensitivityValue");
const strengthInput = document.getElementById("strengthInput");
const strengthValue = document.getElementById("strengthValue");
const downloadBtn = document.getElementById("downloadBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const emptyState = document.getElementById("emptyState");
const canvasGrid = document.getElementById("canvasGrid");
const sourceCanvas = document.getElementById("sourceCanvas");
const resultCanvas = document.getElementById("resultCanvas");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const resultCtx = resultCanvas.getContext("2d", { willReadFrequently: true });

let originalImageData = null;
let originalFileName = "image";

function isValidHex(value) {
    return /^#[0-9a-fA-F]{6}$/.test(value);
}

function hexToRgb(hex) {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
    };
}

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.className = isError ? "status error" : "status";
}

function normalizeName(name) {
    return name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function resizeCanvas(canvas, width, height) {
    canvas.width = width;
    canvas.height = height;
}

function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("No se pudo leer el archivo desde el computador."));
        reader.readAsDataURL(file);
    });
}

function loadImageElement(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => resolve(img);
        img.onerror = () => {
            reject(new Error("No se pudo decodificar la imagen. Usa PNG, JPG, JPEG, WEBP, BMP o GIF. Si es HEIC, conviertela antes a JPG o PNG."));
        };

        img.src = dataUrl;
    });
}

async function drawFileToCanvas(file) {
    const lowerName = file.name.toLowerCase();
    const isHeic = lowerName.endsWith(".heic") || lowerName.endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif";

    if (isHeic) {
        throw new Error("El formato HEIC/HEIF no es compatible directamente con el navegador. Exporta o convierte la imagen a JPG o PNG.");
    }

    if (file.size > 25 * 1024 * 1024) {
        throw new Error("La imagen es muy pesada. Prueba con una version menor a 25 MB.");
    }

    if ("createImageBitmap" in window) {
        try {
            const bitmap = await createImageBitmap(file);

            resizeCanvas(sourceCanvas, bitmap.width, bitmap.height);
            resizeCanvas(resultCanvas, bitmap.width, bitmap.height);
            sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
            sourceCtx.drawImage(bitmap, 0, 0);
            bitmap.close();
            return;
        } catch (error) {
            // Fallback below.
        }
    }

    const dataUrl = await readAsDataUrl(file);
    const img = await loadImageElement(dataUrl);

    resizeCanvas(sourceCanvas, img.naturalWidth, img.naturalHeight);
    resizeCanvas(resultCanvas, img.naturalWidth, img.naturalHeight);
    sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceCtx.drawImage(img, 0, 0);
}

function getLuminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function distanceFromWhite(r, g, b) {
    const dr = 255 - r;
    const dg = 255 - g;
    const db = 255 - b;

    return Math.sqrt(dr * dr + dg * dg + db * db);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function shouldRecolorPixel(r, g, b, a, mode, sensitivity) {
    if (a === 0) {
        return false;
    }

    if (mode === "alpha") {
        return a > sensitivity;
    }

    if (mode === "dark") {
        const lum = getLuminance(r, g, b);
        return lum < 255 - sensitivity;
    }

    const dist = distanceFromWhite(r, g, b);
    return dist > sensitivity;
}

function getInkStrength(r, g, b, a, mode, sensitivity, strengthFactor) {
    let strength = 1;

    if (mode === "alpha") {
        strength = a / 255;
    } else if (mode === "dark") {
        strength = (255 - getLuminance(r, g, b)) / 255;
    } else {
        strength = distanceFromWhite(r, g, b) / 441.67295593;
    }

    const minBoost = sensitivity / 255;
    return clamp((strength + minBoost * 0.18) * strengthFactor, 0, 1);
}

function recolorImage() {
    if (!originalImageData) {
        return;
    }

    const hex = hexInput.value.trim();

    if (!isValidHex(hex)) {
        setStatus("Ingresa un color HEX valido, por ejemplo #fc6e03.", true);
        downloadBtn.disabled = true;
        return;
    }

    const target = hexToRgb(hex);
    const mode = modeSelect.value;
    const sensitivity = parseInt(sensitivityInput.value, 10);
    const strengthFactor = parseInt(strengthInput.value, 10) / 100;
    const src = originalImageData.data;
    const output = new ImageData(originalImageData.width, originalImageData.height);
    const dst = output.data;
    let changedPixels = 0;

    for (let i = 0; i < src.length; i += 4) {
        const r = src[i];
        const g = src[i + 1];
        const b = src[i + 2];
        const a = src[i + 3];

        if (shouldRecolorPixel(r, g, b, a, mode, sensitivity)) {
            const ink = getInkStrength(r, g, b, a, mode, sensitivity, strengthFactor);

            if (mode === "alpha") {
                dst[i] = target.r;
                dst[i + 1] = target.g;
                dst[i + 2] = target.b;
                dst[i + 3] = a;
            } else {
                dst[i] = Math.round(255 + (target.r - 255) * ink);
                dst[i + 1] = Math.round(255 + (target.g - 255) * ink);
                dst[i + 2] = Math.round(255 + (target.b - 255) * ink);
                dst[i + 3] = a;
            }

            changedPixels += 1;
        } else {
            dst[i] = r;
            dst[i + 1] = g;
            dst[i + 2] = b;
            dst[i + 3] = a;
        }
    }

    resultCtx.putImageData(output, 0, 0);
    downloadBtn.disabled = false;
    setStatus(`Listo. Pixeles modificados: ${changedPixels.toLocaleString("es-CL")}.`);
}

async function loadFile(file) {
    if (!file) {
        return;
    }

    try {
        setStatus("Leyendo imagen...");
        downloadBtn.disabled = true;
        resetBtn.disabled = true;

        originalFileName = normalizeName(file.name || "image");
        fileInfo.textContent = `${file.name || "imagen"} | ${(file.size / 1024 / 1024).toFixed(2)} MB | ${file.type || "tipo no informado"}`;

        await drawFileToCanvas(file);

        originalImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        emptyState.hidden = true;
        canvasGrid.hidden = false;
        resetBtn.disabled = false;

        recolorImage();
    } catch (error) {
        originalImageData = null;
        downloadBtn.disabled = true;
        resetBtn.disabled = false;
        setStatus(error.message, true);
    }
}

function syncTextToColor() {
    const value = hexInput.value.trim();

    if (isValidHex(value)) {
        colorInput.value = value;
        document.documentElement.style.setProperty("--accent", value);
    }

    recolorImage();
}

function syncColorToText() {
    hexInput.value = colorInput.value;
    document.documentElement.style.setProperty("--accent", colorInput.value);
    recolorImage();
}

function resetApp() {
    imageInput.value = "";
    fileInfo.textContent = "";
    originalImageData = null;
    originalFileName = "image";
    sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    emptyState.hidden = false;
    canvasGrid.hidden = true;
    downloadBtn.disabled = true;
    resetBtn.disabled = true;
    setStatus("Esperando imagen.");
}

function downloadResult() {
    if (!originalImageData) {
        return;
    }

    const link = document.createElement("a");
    const hex = hexInput.value.replace("#", "");

    link.download = `${originalFileName}_trace_${hex}.png`;
    link.href = resultCanvas.toDataURL("image/png");
    link.click();
}

imageInput.addEventListener("change", event => {
    loadFile(event.target.files[0]);
});

hexInput.addEventListener("input", syncTextToColor);
colorInput.addEventListener("input", syncColorToText);
modeSelect.addEventListener("change", recolorImage);

sensitivityInput.addEventListener("input", () => {
    sensitivityValue.textContent = sensitivityInput.value;
    recolorImage();
});

strengthInput.addEventListener("input", () => {
    strengthValue.textContent = `${strengthInput.value}%`;
    recolorImage();
});

downloadBtn.addEventListener("click", downloadResult);
resetBtn.addEventListener("click", resetApp);
dropZone.addEventListener("click", () => imageInput.click());

dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
    loadFile(event.dataTransfer.files[0]);
});
