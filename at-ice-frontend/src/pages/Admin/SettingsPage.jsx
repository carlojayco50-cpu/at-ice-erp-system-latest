import AdminLayout from "../../components/AdminLayout";
import AccountSettings from "../../components/AccountSettings";
import SystemSettings from "../../components/SystemSettings";

export default function SettingsPage() {
  return (
    <AdminLayout pageTitle="Settings" breadcrumb="Account">
      <div className="flex flex-col gap-6">
        <AccountSettings />
        <SystemSettings />
      </div>
    </AdminLayout>
  );
}
