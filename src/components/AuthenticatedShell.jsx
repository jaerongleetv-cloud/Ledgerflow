"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Layout from "@/components/Layout";

export default function AuthenticatedShell({ children }) {
  const router = useRouter();
  const { isAuthenticated, isLoadingAuth, authError } = useAuth();

  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isLoadingAuth, router]);

  if (isLoadingAuth || !isAuthenticated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (authError) {
    return <div className="mx-auto max-w-md p-6 text-sm text-red-600">{authError.message}</div>;
  }

  return <Layout>{children}</Layout>;
}
