import { useEffect, useId, useMemo, useState } from "react";
import { findByName, loadBarangays, loadPsgcIndex, matchPlaces } from "@/lib/psgc";

// The one address form used everywhere (employees, customers, suppliers):
// Region > Province > City/Municipality > Barangay dropdowns from the official
// PSGC lists (lib/psgc.js), each one listing only the places inside the one
// above it, plus text fields for the house/lot, street and subdivision.
//
// The form keeps names (region, province, city, barangay) and the barangay's
// PSGC code (barangay_code). Names filled in from elsewhere, e.g. the address
// under a map pin, an older record, or a scanned ID (components/ScanDropZone.jsx), are matched to the lists
// and the dropdowns select them by themselves, also when spelled another way
// ("Kalookan" -> Caloocan, "Bulakan" -> Bulacan, a one-letter typo; see
// findByName in lib/psgc.js), and are saved with the official spelling. A name
// that matches nothing is shown as "(not in the list)"; on a required address
// the form cannot be sent until a listed place is picked.
//
// Renders its fields straight into the parent's 2-column grid.
//   value     the form (only the address keys are read)
//   onChange  called with the changed keys, e.g. { city: "Malolos", barangay: "", barangay_code: "" }
//   required  Province, City, Barangay and Street are required
//   requiredPlaces  keys that are required even when `required` is off, e.g. ["province", "city"]
//   errors    { field: ["message"] } shown under each field
//   details   false hides Block and Lot, Street, Subdivision and Postal Code
//   inputClassName / labelClassName  to match the page's own fields

const KEEP = "__keep";
const NONE = [];

const DEFAULT_INPUT = "w-full px-3 py-1.5 border border-black/[0.09] rounded-md text-[13px] text-slate-800 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-60";
const DEFAULT_LABEL = "text-[11px] text-slate-500";

const cityLabel = (c) => (c.isCity && !/\bcity\b/i.test(c.name) ? `${c.name} City` : c.name);

export default function AddressFields({
  value,
  onChange,
  required = false,
  requiredPlaces = NONE,
  errors = {},
  details = true,
  inputClassName = DEFAULT_INPUT,
  labelClassName = DEFAULT_LABEL,
}) {
  const id = useId();
  const [index, setIndex] = useState(null);
  const [indexError, setIndexError] = useState("");
  const [brgy, setBrgy] = useState({ key: "", list: [], status: "idle" });

  useEffect(() => {
    let alive = true;
    loadPsgcIndex()
      .then((ix) => { if (alive) setIndex(ix); })
      .catch(() => { if (alive) setIndexError("The address lists could not load. Check the connection and reopen this form."); });
    return () => { alive = false; };
  }, []);

  const match = useMemo(
    () => (index ? matchPlaces(index, { region: value.region, province: value.province, city: value.city }) : {}),
    [index, value.region, value.province, value.city]
  );
  const region = match.region || null;
  const province = match.province || null;
  const city = match.city || null;

  // Barangays of the matched city
  const brgyKey = province && city ? `${province.code}|${city.code}` : "";
  useEffect(() => {
    if (!brgyKey) return;
    let alive = true;
    const [p, c] = brgyKey.split("|");
    setBrgy({ key: brgyKey, list: [], status: "loading" });
    loadBarangays(p, c)
      .then((list) => { if (alive) setBrgy({ key: brgyKey, list, status: "ready" }); })
      .catch(() => { if (alive) setBrgy({ key: brgyKey, list: [], status: "error" }); });
    return () => { alive = false; };
  }, [brgyKey]);
  const brgyList = brgy.key === brgyKey ? brgy.list : NONE;
  const brgyStatus = brgyKey ? (brgy.key === brgyKey ? brgy.status : "loading") : "idle";

  const barangay = useMemo(() => {
    if (!brgyList.length) return null;
    return (value.barangay_code && brgyList.find((b) => b.code === value.barangay_code))
      || findByName(brgyList, value.barangay);
  }, [brgyList, value.barangay_code, value.barangay]);

  // Names that matched are rewritten to the official ones, and the region and
  // barangay code are filled in, so what is saved always follows the lists.
  useEffect(() => {
    if (!index) return;
    const patch = {};
    if (region && value.region !== region.name) patch.region = region.name;
    if (province && value.province !== province.name) patch.province = province.name;
    if (city && value.city !== city.name) patch.city = city.name;
    if (barangay) {
      if (value.barangay !== barangay.name) patch.barangay = barangay.name;
      if (value.barangay_code !== barangay.code) patch.barangay_code = barangay.code;
    } else if (value.barangay_code && brgyStatus === "ready") {
      patch.barangay_code = "";
    }
    if (Object.keys(patch).length) onChange(patch);
  }, [index, region, province, city, barangay, brgyStatus, value.region, value.province, value.city, value.barangay, value.barangay_code, onChange]);

  const provinces = useMemo(() => (index && region ? index.provinces.filter((p) => p.regionCode === region.code) : []), [index, region]);
  const cities = useMemo(() => (index && province ? index.cities.filter((c) => c.provinceCode === province.code) : []), [index, province]);

  const pickRegion = (code) => {
    const r = index.regionByCode.get(code);
    const only = index.provinces.filter((p) => p.regionCode === code);
    // NCR has just "Metro Manila", so it is picked straight away.
    onChange({ region: r?.name || "", province: only.length === 1 ? only[0].name : "", city: "", barangay: "", barangay_code: "" });
  };
  const pickProvince = (code) => {
    const p = index.provinceByCode.get(code);
    onChange({ province: p?.name || "", region: p ? index.regionByCode.get(p.regionCode).name : value.region, city: "", barangay: "", barangay_code: "" });
  };
  const pickCity = (code) => {
    onChange({ city: index.cityByCode.get(code)?.name || "", barangay: "", barangay_code: "" });
  };
  const pickBarangay = (code) => {
    const b = brgyList.find((x) => x.code === code);
    onChange({ barangay: b?.name || "", barangay_code: b?.code || "" });
  };

  const loading = !index && !indexError;
  const selectCls = inputClassName;

  const select = (key, label, { options, selected, text, onPick, disabled, placeholder, isRequired }) => {
    // A required place must be one from the official list.
    const unlisted = !selected && text && index && (key !== "barangay" || brgyStatus === "ready")
      ? `"${text}" is not in the official list. Pick the ${label.toLowerCase()} from the list.`
      : "";
    return (
    <label className="flex flex-col gap-1" htmlFor={`${id}-${key}`}>
      <span className={labelClassName}>
        {label}{isRequired && <span className="text-red-500"> *</span>}
      </span>
      <select
        id={`${id}-${key}`}
        value={selected ? selected.code : text ? KEEP : ""}
        onChange={(e) => e.target.value !== KEEP && onPick(e.target.value)}
        required={isRequired}
        disabled={disabled}
        ref={(el) => el?.setCustomValidity(isRequired && unlisted ? unlisted : "")}
        aria-invalid={unlisted ? true : undefined}
        className={`${selectCls} ${unlisted ? "border-amber-400" : ""}`}
      >
        <option value="" disabled={isRequired}>{placeholder}</option>
        {!selected && text && <option value={KEEP}>{text} (not in the list)</option>}
        {options.map((o) => <option key={o.code} value={o.code}>{o.label || o.name}</option>)}
      </select>
      {errors[key] ? <span className="text-[10px] text-red-500">{errors[key][0]}</span>
        : unlisted && <span className="text-[10px] text-amber-600">{unlisted}</span>}
    </label>
    );
  };

  const input = (key, label, placeholder, extra = {}) => (
    <label className="flex flex-col gap-1" htmlFor={`${id}-${key}`}>
      <span className={labelClassName}>
        {label}{extra.isRequired && <span className="text-red-500"> *</span>}
      </span>
      <input
        id={`${id}-${key}`}
        value={value[key] || ""}
        onChange={(e) => onChange({ [key]: extra.clean ? extra.clean(e.target.value) : e.target.value })}
        required={extra.isRequired}
        placeholder={placeholder}
        inputMode={extra.inputMode}
        className={inputClassName}
      />
      {errors[key] && <span className="text-[10px] text-red-500">{errors[key][0]}</span>}
    </label>
  );

  return (
    <>
      {indexError && (
        <p role="alert" className="col-span-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-600">{indexError}</p>
      )}
      {select("region", "Region", {
        options: index ? index.regions : [],
        selected: region,
        text: value.region,
        onPick: pickRegion,
        disabled: !index,
        placeholder: loading ? "Loading…" : "Select region",
        isRequired: required,
      })}
      {select("province", "Province", {
        options: provinces,
        selected: province,
        text: value.province,
        onPick: pickProvince,
        disabled: !index || (!region && !value.province),
        placeholder: region ? "Select province" : "Select a region first",
        isRequired: required || requiredPlaces.includes("province"),
      })}
      {select("city", "City / Municipality", {
        options: cities.map((c) => ({ code: c.code, label: cityLabel(c) })),
        selected: city,
        text: value.city,
        onPick: pickCity,
        disabled: !index || (!province && !value.city),
        placeholder: province ? "Select city or municipality" : "Select a province first",
        isRequired: required || requiredPlaces.includes("city"),
      })}
      {select("barangay", "Barangay", {
        options: brgyList,
        selected: barangay,
        text: value.barangay,
        onPick: pickBarangay,
        disabled: !city && !value.barangay,
        placeholder: !city ? "Select a city first" : brgyStatus === "loading" ? "Loading…" : brgyStatus === "error" ? "Could not load barangays" : "Select barangay",
        isRequired: required,
      })}
      {details && (
        <>
          {input("block_lot", "House No. / Block and Lot", "e.g. Blk 5 Lot 12")}
          {input("street", "Street", "e.g. Quirino Highway", { isRequired: required })}
          {input("subdivision", "Subdivision / Village", "e.g. Citrus Subdivision")}
          {input("postal_code", "Postal Code", "e.g. 3023", { inputMode: "numeric", clean: (v) => v.replace(/\D/g, "").slice(0, 4) })}
        </>
      )}
    </>
  );
}
