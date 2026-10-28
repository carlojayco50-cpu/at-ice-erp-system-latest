// POST a FormData body with real upload progress. Resolves with the parsed JSON,
// rejects with the server's first validation message.
export function sendForm(url, body, { method = "POST", onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open(method, url);
    req.setRequestHeader("Accept", "application/json");
    req.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("token") || ""}`);
    req.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    req.onload = () => {
      let data = null;
      try { data = JSON.parse(req.responseText); } catch { /* not json */ }
      if (req.status >= 200 && req.status < 300) {
        onProgress?.(100);
        resolve(data);
        return;
      }
      const first = data?.errors ? Object.values(data.errors)[0]?.[0] : null;
      const err = new Error(first || data?.message || `Request failed (${req.status}).`);
      err.status = req.status;
      err.errors = data?.errors;
      reject(err);
    };
    req.onerror = () => reject(new Error("Network error. Check the connection and try again."));
    req.send(body);
  });
}
