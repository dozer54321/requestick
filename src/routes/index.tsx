import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Board } from "@/components/mesh/board";
import { Landing } from "@/components/mesh/landing";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user } = useCurrentUserState();
  if (user) return <Board />;
  return <Landing />;
}
