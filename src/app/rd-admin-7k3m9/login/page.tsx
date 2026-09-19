import { hasValidAdminSession } from "@/lib/admin/auth";
import { ADMIN_BASE_PATH } from "@/lib/admin/constants";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";

export default async function AdminLoginPage() {
  if (await hasValidAdminSession()) {
    redirect(ADMIN_BASE_PATH);
  }

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Red Dog internal tools.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
