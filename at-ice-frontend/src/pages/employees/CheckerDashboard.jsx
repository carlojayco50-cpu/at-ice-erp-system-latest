import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RoleShell from "../../components/RoleShell";
import { Icon, StatusBadge, ErrorBanner, CardSkeleton } from "../../components/MobileUi";
import { CARD_BUTTON } from "../../lib/mobileUi";
import { useLiveTick } from "../../lib/live";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";

const headers = () => ({ Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` });
const list = (d) => (Array.isArray(d) ? d : d?.data || []);

// Checker home: what needs doing now (trucks to count, low stock, stock
// movements waiting for the second Checker), each a tap away.
export default function CheckerDashboard() {
  const timedIn = useTimedIn();
  const [data, setData] = useState({ trucks: [], products: [], movements: [] });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [t, p, m] = await Promise.all(["ice-loadings/deliveries", "products", "stock-movements"].map((u) => fetch(`/api/${u}`, { headers: headers() })));
      if (!t.ok || !p.ok || !m.ok) throw new Error("Could not load today's work.");
      const [td, pd, md] = await Promise.all([t.json(), p.json(), m.json()]);
      setData({ trucks: list(td), products: list(pd), movements: list(md) });
      setStatus("ready");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }, []);
  const live = useLiveTick(["deliveries", "inventory", "stock"]);
  useEffect(() => { load(); }, [load, live]);

  const toCount = data.trucks.filter((d) => !d.loaded).length;
  const low = data.products.filter((p) => p.is_active !== false && Number(p.current_stock) <= Number(p.minimum_stock || 0));
  const waiting = data.movements.filter((m) => m.status === "pending").length;

  const tiles = [
    { to: "/checker/ice-loading", icon: "truck", title: "Ice loading", text: "Count sacks loaded per truck", badge: toCount ? [`${toCount} to count`, "pending"] : ["All counted", "done"] },
    { to: "/checker/inventory", icon: "box", title: "Inventory", text: "Stock levels and low stock alerts", badge: low.length ? [`${low.length} low`, "urgent"] : ["Stock OK", "done"] },
    { to: "/checker/stock-movements", icon: "swap", title: "Stock in / out", text: "Double-entry stock movements", badge: waiting ? [`${waiting} to confirm`, "pending"] : ["Up to date", "done"] },
    { to: "/checker/suppliers", icon: "users", title: "Suppliers", text: "Supplier records and contacts", badge: null },
  ];

  return (
    <RoleShell role="checker" title="Checker">
      <TimeInNotice timedIn={timedIn} />
      <div className="text-[14px] text-slate-500">
        {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      </div>

      {status === "loading" && <CardSkeleton rows={4} />}
      {status === "error" && <ErrorBanner onRetry={load}>{error}</ErrorBanner>}

      {status === "ready" && (
        <>
          {low.length > 0 && (
            <Link to="/checker/inventory?filter=low" className={`${CARD_BUTTON} block border-rose-200`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-slate-900">Low stock</div>
                  <div className="text-[14px] text-rose-700 mt-1 truncate">{low.slice(0, 3).map((p) => p.name).join(", ")}{low.length > 3 ? ` +${low.length - 3} more` : ""}</div>
                </div>
                <StatusBadge tone="urgent">{low.length}</StatusBadge>
              </div>
            </Link>
          )}
          <div className="grid grid-cols-1 gap-3">
            {tiles.map((t) => (
              <Link key={t.to} to={t.to} className={`${CARD_BUTTON} flex items-center gap-3`}>
                <span className="w-11 h-11 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center flex-shrink-0"><Icon name={t.icon} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-slate-900">{t.title}</span>
                  <span className="block text-[14px] text-slate-500">{t.text}</span>
                </span>
                {t.badge ? <StatusBadge tone={t.badge[1]}>{t.badge[0]}</StatusBadge> : <Icon name="chevron" className="text-slate-300" />}
              </Link>
            ))}
          </div>
        </>
      )}
    </RoleShell>
  );
}
