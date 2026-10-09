import AdminLayout from "../../components/AdminLayout";
import AccountSettings from "../../components/AccountSettings";

export default function SettingsPage() {
  return (
    <AdminLayout pageTitle="Settings" breadcrumb="Account">
      <AccountSettings />
    </AdminLayout>
  );
}