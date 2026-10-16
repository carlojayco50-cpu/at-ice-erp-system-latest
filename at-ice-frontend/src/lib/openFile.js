import { toast } from "./toast";
import { previewProtectedFile } from "./preview";

// Opens a private file from an API route that needs the login token (a med
// cert, a resume, a payslip) in the attachment preview first; the preview has
// Open in new tab and Download.
export async function openProtectedFile(url, filename = "") {
  try {
    await previewProtectedFile(url, filename);
  } catch (err) {
    toast.error(err.message);
  }
}

// Downloads a private file straight away (an export such as a CSV, which is
// not an attachment to look at).
export async function downloadProtectedFile(url, filename = "file") {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
    if (!res.ok) throw new Error(res.status === 404 ? "The file is missing." : "The file could not be downloaded.");
    const objectUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (err) {
    toast.error(err.message);
  }
}
