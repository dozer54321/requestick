import { UserButton } from "@/lib/auth/gates";
import { MeshMark } from "./mark";
import { useBranding } from "./brand-context";
import type { MeshProfile } from "@/lib/mesh/types";

export function AccessGate({ profile }: { profile: MeshProfile }) {
  const denied = profile.accessStatus === "denied";
  const brand = useBranding();
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <MeshMark />
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
              {brand.companyName}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {denied ? "Access denied" : "Waiting on an admin"}
            </h1>
          </div>
        </span>
        <UserButton />
      </div>
      <div className="rounded-xl bg-surface p-5 shadow-ticket">
        <p className="text-sm leading-relaxed text-ink-soft">
          {denied
            ? "An admin turned down this login. If you work here, have them approve you from Admin → People."
            : "You're in the waiting room. An admin has to approve you before you can see dealer tickets, part numbers, or anyone's cell. This page refreshes on its own."}
        </p>
        <dl className="mt-4 grid gap-2 font-mono text-[13px]">
          <div className="flex justify-between gap-4 border-t border-line pt-2">
            <dt className="text-faint">Name</dt>
            <dd>{profile.displayName}</dd>
          </div>
          {profile.email ? (
            <div className="flex justify-between gap-4 border-t border-line pt-2">
              <dt className="text-faint">Email</dt>
              <dd className="truncate">{profile.email}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-line pt-2">
            <dt className="text-faint">Status</dt>
            <dd className="uppercase tracking-wide">
              {denied ? "Denied" : "Pending"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
