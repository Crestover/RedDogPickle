"use client";

import { useTransition } from "react";
import { adminLogoutAction } from "@/app/actions/admin";

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => adminLogoutAction())}
      disabled={isPending}
      className="text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
