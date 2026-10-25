// Shared by the Driver and the Salesman screens: the phone's GPS position and
// pressing Arrived at a store (the server checks the position is within
// delivery.arrival_radius_m of the store pin; App\Http\Controllers\DeliveryRouteController).

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This phone cannot share its location. Open the system on a phone with GPS."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.code === 1
        ? "Allow location for this site, then press Arrived again."
        : "Could not get your location. Go outside or turn on GPS, then try again.")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

// POST the position to an arrive URL; resolves with the server's answer or
// throws its message (e.g. "You are about 420 m from …").
export async function pressArrived(url) {
  const position = await currentPosition();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
    body: JSON.stringify(position),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Could not record your arrival.");
  return data;
}

export const kmLabel = (km) => (km == null ? null : km < 1 ? `${Math.round(km * 1000)} m from plant` : `${km.toFixed(1)} km from plant`);
