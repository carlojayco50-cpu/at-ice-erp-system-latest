import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LOGIN_PATH } from "../lib/auth";
import { checkCamera, clearKioskToken, getKioskToken, isBlockedDevice, kioskHeaders } from "../lib/kiosk";
import {
  AccessRestrictedScreen,
  KioskLoading,
  KioskOfflineScreen,
  NoCameraScreen,
  PinModal,
} from "./KioskScreens";

// Wraps the Attendance Station. The kiosk itself (children) renders ONLY after
// all four checks pass, in this order:
//   1. device   a phone, tablet or narrow window is blocked
//   2. camera   the terminal must have a videoinput device
//   3. HR PIN   a valid kiosk token, from POST /api/kiosk/unlock
//   4. kiosk    children
// While it is open, the gate asks the server every minute whether the kiosk is
// still unlocked, so a PIN change locks it again within about a minute.
const RECHECK_MS = 60 * 1000;

// How many KioskGates are mounted. Used to lock the kiosk when the station is
// left, without locking it on React StrictMode's dev-only unmount and remount.
let mountedGates = 0;

export default function KioskGate({ children }) {
  const navigate = useNavigate();
  const goToLogin = () => navigate(LOGIN_PATH);

  const [blocked, setBlocked] = useState(() => isBlockedDevice());
  const [camera, setCamera] = useState({ status: "checking" });
  const [cameraRun, setCameraRun] = useState(0);
  // checking | locked | open | offline. With no saved token it starts as "locked".
  const [lock, setLock] = useState(() => (getKioskToken() ? "checking" : "locked"));
  const [lockRun, setLockRun] = useState(0);

  // Leaving the Attendance Station locks it: the next visit asks for the PIN.
  useEffect(() => {
    mountedGates += 1;
    return () => {
      mountedGates -= 1;
      setTimeout(() => {
        if (mountedGates === 0) clearKioskToken();
      }, 0);
    };
  }, []);

  // 1. Device: checked again when the window is resized.
  useEffect(() => {
    const onResize = () => setBlocked(isBlockedDevice());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 2. Camera: only on a device that passed the first check.
  useEffect(() => {
    if (blocked) return;
    let cancelled = false;
    checkCamera().then((result) => {
      if (!cancelled) setCamera(result);
    });
    return () => {
      cancelled = true;
    };
  }, [blocked, cameraRun]);

  const retryCamera = () => {
    setCamera({ status: "checking" });
    setCameraRun((n) => n + 1);
  };

  // 3. HR PIN: is the saved kiosk token still valid? Only after the camera check passed.
  const cameraOk = !blocked && camera.status === "ok";
  useEffect(() => {
    if (!cameraOk || lock !== "checking") return;
    let cancelled = false;
    fetch("/api/kiosk/status", { headers: kioskHeaders() })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setLock("open");
        } else {
          clearKioskToken();
          setLock("locked");
        }
      })
      .catch(() => {
        if (!cancelled) setLock("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [cameraOk, lock, lockRun]);

  const retryLock = () => {
    setLock("checking");
    setLockRun((n) => n + 1);
  };

  // While open: check every minute. A 403 means the PIN was changed or the token expired.
  useEffect(() => {
    if (!cameraOk || lock !== "open") return;
    const id = setInterval(() => {
      fetch("/api/kiosk/status", { headers: kioskHeaders() })
        .then((res) => {
          if (res.status === 403) {
            clearKioskToken();
            setLock("locked");
          }
        })
        .catch(() => {
          // a network blip does not lock the kiosk
        });
    }, RECHECK_MS);
    return () => clearInterval(id);
  }, [cameraOk, lock]);

  // 1. Device
  if (blocked) return <AccessRestrictedScreen onReturn={goToLogin} />;

  // 2. Camera
  if (camera.status === "checking") return <KioskLoading />;
  if (camera.status !== "ok") {
    return <NoCameraScreen status={camera.status} message={camera.message} onRetry={retryCamera} onReturn={goToLogin} />;
  }

  // 3. HR PIN
  if (lock === "checking") return <KioskLoading />;
  if (lock === "offline") return <KioskOfflineScreen onRetry={retryLock} onReturn={goToLogin} />;
  if (lock === "locked") return <PinModal onUnlocked={() => setLock("open")} onCancel={goToLogin} />;

  // 4. Kiosk
  return children;
}
