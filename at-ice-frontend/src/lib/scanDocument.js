// Reads a resume or CV, or a Driver's license, to fill in a form (POST
// /api/scan-document, a Groq model on the server): the person's name, mobile
// number, email, home address and license number and expiry.
//   kind "resume":  PDF or Word (.docx) only. Its text is read here and sent;
//                   a scanned PDF with no text goes as a picture of page 1.
//   kind "license": a photo (JPG, PNG) or PDF of the driver's license, sent as
//                   one JPEG. The server turns down anything that is not one.

// Kept small: Groq's free tier allows only ~7,000 input tokens a minute and
// the picture's size decides most of a scan's tokens. 1280 px still reads an
// ID or a resume page.
const MAX_SIDE = 1280;
const MAX_CHARS = 3.8 * 1024 * 1024; // the server takes up to 4 MB of base64
// Resume text sent to the server (it reads up to 12,000 characters).
const MAX_TEXT = 12000;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const SCAN_ACCEPT = {
  resume: ".pdf,.docx,application/pdf," + DOCX,
  license: "image/jpeg,image/png,image/webp,application/pdf",
};

function canvasToJpeg(canvas) {
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= MAX_CHARS) return url;
  }
  throw new Error("The picture is too large. Use a smaller or clearer picture.");
}

function scaledCanvas(width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  return { canvas, scale };
}

async function imageToJpeg(file) {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This picture could not be opened. Use a JPG or PNG.");
  });
  const { canvas } = scaledCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNGs become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvasToJpeg(canvas);
}

// pdf.js is loaded only when a PDF is picked. Its worker is bundled by Vite
// as a .js file (nginx may not serve .mjs as JavaScript).
let pdfWorker = null;
async function openPdf(file) {
  const [pdfjs, { default: PdfWorker }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?worker"),
  ]);
  pdfWorker ??= new PdfWorker();
  pdfjs.GlobalWorkerOptions.workerPort = pdfWorker;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    return { doc: await task.promise, task };
  } catch {
    task.destroy();
    throw new Error("This PDF could not be opened.");
  }
}

async function pdfToJpeg(file) {
  const { doc, task } = await openPdf(file);
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const { canvas } = scaledCanvas(base.width * 3, base.height * 3);
    const viewport = page.getViewport({ scale: canvas.width / base.width });
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // "print" draws in one go; the default waits on animation frames, which
    // stop while the tab is in the background.
    await page.render({ canvas, canvasContext: ctx, viewport, intent: "print" }).promise;
    return canvasToJpeg(canvas);
  } finally {
    task.destroy();
  }
}

// The text of a PDF (every page, up to MAX_TEXT); "" for a scanned PDF.
async function pdfText(file) {
  const { doc, task } = await openPdf(file);
  try {
    let text = "";
    for (let n = 1; n <= doc.numPages && text.length < MAX_TEXT; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      text += content.items.map((i) => i.str + (i.hasEOL ? "\n" : " ")).join("") + "\n";
    }
    return text.replace(/[ \t]+/g, " ").trim().slice(0, MAX_TEXT);
  } finally {
    task.destroy();
  }
}

// The text of a Word .docx (mammoth is loaded only when one is picked).
async function docxText(file) {
  const { default: mammoth } = await import("mammoth/mammoth.browser.js");
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value.replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT);
  } catch {
    throw new Error("This Word file could not be opened. Save it again as .docx or PDF.");
  }
}

// What is sent for a file: { text } or { image }. A wrong file type gets a clear message.
async function scanBody(file, kind) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (kind === "license") {
    if (!isPdf && !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      throw new Error("Upload a photo (JPG, PNG) or a PDF of the driver's license.");
    }
    return { image: isPdf ? await pdfToJpeg(file) : await imageToJpeg(file) };
  }
  if (/\.doc$/i.test(file.name) || file.type === "application/msword") {
    throw new Error("Old Word files (.doc) cannot be read. Save it as .docx or PDF, then drop it again.");
  }
  const isDocx = file.type === DOCX || /\.docx$/i.test(file.name);
  if (!isPdf && !isDocx) throw new Error("A resume must be a PDF or a Word file (.docx).");
  if (isDocx) {
    const text = await docxText(file);
    if (text.length < 20) throw new Error("This Word file is empty.");
    return { text };
  }
  const text = await pdfText(file);
  // A scanned PDF has no text: its first page is read as a picture.
  return text.length >= 80 ? { text } : { image: await pdfToJpeg(file) };
}

// { person: { first_name, middle_initial, last_name, suffix, phone, email, license_number, license_expiry } | null,
//   address: { block_lot, street, subdivision, barangay, city, province, postal_code } | null }
// Fields not found in the document are "".
export async function scanDocument(file, kind = "resume") {
  if (file.size > 20 * 1024 * 1024) throw new Error("The file is too large (over 20 MB).");
  const body = await scanBody(file, kind);
  const res = await fetch("/api/scan-document", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
    },
    body: JSON.stringify({ kind, ...body }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.errors ? Object.values(data.errors)[0][0] : data?.message || "The document could not be read. Try again.");
  }
  return data;
}

// The values the document showed, by form key; empty ones are left out so
// they do not wipe what is already typed. A found address replaces the whole
// address, and the dropdowns match its names to the PSGC lists.
export function filledFrom({ person, address = null }, keys) {
  const patch = {};
  for (const [formKey, scanKey] of Object.entries(keys)) {
    if (person?.[scanKey]) patch[formKey] = person[scanKey];
  }
  if (address) Object.assign(patch, address, { region: "", barangay_code: "" });
  return patch;
}

// The biodata the document showed (birthday, sex, civil status, emergency
// contact, highest attainment, school, course, work history, license
// restriction codes), merged into the form `f` (lib/biodata.js values). Found
// values replace what is there; the work history fills in only when the form
// has none typed yet, and restriction codes are added to the ticked ones.
export function biodataFilledFrom({ biodata } = {}, f = {}) {
  const patch = {};
  if (!biodata) return patch;
  for (const [key, value] of Object.entries(biodata)) {
    if (key === "work_history") {
      const typed = (f.work_history || []).some((w) => String(w.company || "").trim());
      if (!typed && value.length) patch.work_history = value.map((w) => ({ company: w.company || "", position: w.position || "", from: w.from || "", to: w.to || "" }));
    } else if (key === "license_restrictions") {
      patch.license_restrictions = [...new Set([...(f.license_restrictions || []), ...value])];
    } else if (value !== "" && value != null) {
      patch[key] = String(value);
    }
  }
  return patch;
}
