import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import AccountSettings from "../../components/AccountSettings";
import SystemSettings from "../../components/SystemSettings";

// One page; this nav jumps to each section (ids set in SystemSettings), the
// same "#id" links as the sidebar, and the section in view is highlighted.
// "Rates and rules" holds the holiday and overtime pay rates too.
const SECTIONS = [
  ["settings-account", "Account"],
  ["settings-rates", "Rates and rules"],
  ["settings-admin-pin", "Admin PIN"],
  ["settings-retention", "Old records"],
];

// The section whose top has passed the top bar (the last one at the bottom of the page)
function sectionInView() {
  let current = SECTIONS[0][0];
  for (const [id] of SECTIONS) {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top <= 140) current = id;
  }
  const main = document.querySelector(".ice-main");
  if (main && main.scrollTop > 0 && main.scrollTop + main.clientHeight >= main.scrollHeight - 4) current = SECTIONS[SECTIONS.length - 1][0];
  return current;
}

export default function SettingsPage() {
  const [active, setActive] = useState(SECTIONS[0][0]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setActive(sectionInView()));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <AdminLayout pageTitle="Settings" breadcrumb="Settings">
      <div className="flex flex-col gap-6">
        <nav aria-label="Settings sections" className="-mb-2 flex flex-wrap gap-1.5 max-w-4xl">
          {SECTIONS.map(([id, label]) => {
            const on = active === id;
            return (
              <Link
                key={id}
                to={`/admin/settings#${id}`}
                aria-current={on ? "location" : undefined}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium cursor-pointer transition-colors ${on ? "bg-cyan-500 text-white" : "border border-black/[0.09] bg-white text-slate-600 hover:text-cyan-700"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div id="settings-account" className="scroll-mt-20"><AccountSettings /></div>
        <SystemSettings />
      </div>
    </AdminLayout>
  );
}
