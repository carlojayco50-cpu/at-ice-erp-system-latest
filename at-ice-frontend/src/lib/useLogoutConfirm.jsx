import { useCallback, useState } from "react";
import LogoutConfirmDialog from "../components/LogoutConfirmDialog";
import { playSplash } from "./splash";

// Asks "Are you sure you want to log out?" before running onConfirm, then
// plays the splash while the session is cleared.
// Usage: const [askLogout, logoutDialog] = useLogoutConfirm(handleLogout);
// then call askLogout from the Log Out button and render {logoutDialog}.
export function useLogoutConfirm(onConfirm) {
  const [open, setOpen] = useState(false);
  const ask = useCallback(() => setOpen(true), []);
  const dialog = (
    <LogoutConfirmDialog
      open={open}
      onCancel={() => setOpen(false)}
      onConfirm={() => {
        setOpen(false);
        playSplash();
        onConfirm();
      }}
    />
  );
  return [ask, dialog];
}

