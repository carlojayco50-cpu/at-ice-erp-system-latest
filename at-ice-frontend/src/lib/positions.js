// Positions people apply for at Bella Erin. Same list as the backend
// (App\Models\Applicant::POSITIONS); the public form (/apply) accepts only these.
export const APPLICANT_POSITIONS = ["Checker", "Salesman", "Maintenance", "Driver", "Guard", "Bagger", "Admin Staff"];

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

// While testing on this computer (localhost), a phone cannot open
// "localhost", so the dev server's LAN address is used instead (set in
// vite.config.js). A deployed site uses its own address.
export function isLocalTesting() {
  return LOCAL_HOSTS.includes(window.location.hostname);
}

// The public job application form that the QR code in HRIS > Interviews opens.
// With an employee ID it is that employee's referral link
// (/job-applications/EMP-0001): the applicant is recorded as referred by them.
export function applyUrl(referrerId = "") {
  const path = referrerId ? `/job-applications/${encodeURIComponent(referrerId)}` : "/apply";
  const lan = import.meta.env.VITE_LAN_HOST;
  if (lan && isLocalTesting()) {
    return `${window.location.protocol}//${lan}${window.location.port ? `:${window.location.port}` : ""}${path}`;
  }
  return `${window.location.origin}${path}`;
}
