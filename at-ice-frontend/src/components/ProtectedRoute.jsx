import { Navigate, useLocation } from "react-router-dom";
import { CHANGE_PASSWORD_PATH, LOGIN_PATH, homePathFor } from "../lib/auth";

export default function ProtectedRoute({
  children,
  allowedRoles,
  allowedSubRoles,
}) {
  const location = useLocation();

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const subRole = localStorage.getItem("sub_role");

  if (!token) {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location }} />;
  }

  // New accounts (any role) must change their one-time password first.
  // (The server blocks their API calls until they do.)
  if (
    localStorage.getItem("must_change_password") === "1" &&
    location.pathname !== CHANGE_PASSWORD_PATH
  ) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }

  // A signed-in user who opens another role's page goes back to their own dashboard.
  const wrongRole = allowedRoles && !allowedRoles.includes(role);
  const wrongSubRole = allowedSubRoles && !allowedSubRoles.includes(subRole);
  if (wrongRole || wrongSubRole) {
    return <Navigate to={homePathFor(role, subRole) || LOGIN_PATH} replace />;
  }

  return children;
}
