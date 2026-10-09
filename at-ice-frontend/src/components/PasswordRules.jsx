import { PASSWORD_RULES } from "../lib/password";

// Live checklist of the password rules, shown under every field where a password is set or changed.
export default function PasswordRules({ password = "" }) {
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.key} className={`text-[11px] flex items-center gap-1.5 ${ok ? "text-emerald-600" : "text-slate-400"}`}>
            <span aria-hidden="true">{ok ? "✓" : "•"}</span>
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
