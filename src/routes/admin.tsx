import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AdminPage } from "@/components/mesh/admin-page";
import { Landing } from "@/components/mesh/landing";

export const Route = createFileRoute("/admin")({ component: AdminRoute });

function AdminRoute() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-16">
        <div className="h-11 rounded-md bg-bg-deep/80" />
      </div>
    );
  }
  if (!user) return <Landing />;
  return <AdminPage />;
}
