// Sign-out icon at the bottom of the Admin, HR and Customer sidebars (and
// their slide-out menu on phones), where it was before the profile menu was
// added. It asks to confirm through the layout's useLogoutConfirm dialog,
// like the Sign out in the top-right profile menu.
export default function SidebarSignOut({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Sign out"
      aria-label="Sign out"
      className="rail-label ml-auto text-red-500 hover:text-red-600 transition-colors cursor-pointer p-1"
    >
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  );
}
