import { toast } from "./toast";

// Opens a private file from an API route that needs the login token (a med
// cert, a resume, a payslip): a PDF or picture in a new tab, anything else is
// downloaded. The tab is opened first, so the pop-up blocker allows it.
export async function openProtectedFile(url, filename = "file") {
  const tab = window.open("", "_blank");
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
    if (!res.ok) throw new Error(res.status === 404 ? "The file is missing." : "The file could not be opened.");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    if (tab && /^(application\/pdf|image\/)/.test(blob.type)) {
      tab.location.href = objectUrl;
    } else {
      tab?.close();
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (err) {
    tab?.close();
    toast.error(err.message);
  }
}
