import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAccount, deleteMember, listTeam, setTeamAccess, updateMember } from "@/lib/mesh/api";
import type { MeshProfile, MemberRole, TeamAction } from "@/lib/mesh/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCell } from "@/lib/mesh/format";
import { isOwner } from "@/lib/mesh/roles";

export function PeopleAdmin({ myId, myRole }: { myId: string; myRole: MemberRole }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<MeshProfile | null>(null);
  const [removing, setRemoving] = useState<MeshProfile | null>(null);
  const [handingOff, setHandingOff] = useState<MeshProfile | null>(null);

  const team = useQuery({
    queryKey: ["mesh-team"],
    queryFn: () => listTeam(),
    refetchInterval: 5000,
  });

  const act = useMutation({
    mutationFn: (payload: { userId: string; action: TeamAction }) =>
      setTeamAccess({ data: payload }),
    onSuccess: async (rows) => {
      qc.setQueryData(["mesh-team"], rows);
      await qc.invalidateQueries({ queryKey: ["mesh-profile"] });
      toast("Team updated");
    },
    onError: (err: Error) => toast.error(err.message || "Could not update team."),
  });

  const rows = team.data ?? [];
  const pending = rows.filter((p) => p.accessStatus === "pending");
  const approved = rows.filter((p) => p.accessStatus === "approved");
  const denied = rows.filter((p) => p.accessStatus === "denied");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          Add people yourself, or approve anyone who requested a login. Nobody sees
          tickets or cells until they are approved. Owner and managers can delete
          a login; the owner cannot be deleted. The owner can transfer
          ownership to a manager. Requests they posted stay.
        </p>
        <Button onClick={() => setAddOpen(true)}>Add account</Button>
      </div>

      {team.isPending ? (
        <p className="text-sm text-muted">Loading the roster…</p>
      ) : (
        <>
          <Section title="Waiting" empty="No pending requests.">
            {pending.map((p) => (
              <MemberRow
                key={p.userId}
                profile={p}
                mine={p.userId === myId}
                ownerView={isOwner(myRole)}
                busy={act.isPending}
                onAct={(action) => act.mutate({ userId: p.userId, action })}
                onEdit={() => setEditing(p)}
                onDelete={() => setRemoving(p)}
                onTransfer={() => setHandingOff(p)}
              />
            ))}
          </Section>
          <Section title="Approved" empty="No one approved yet.">
            {approved.map((p) => (
              <MemberRow
                key={p.userId}
                profile={p}
                mine={p.userId === myId}
                ownerView={isOwner(myRole)}
                busy={act.isPending}
                onAct={(action) => act.mutate({ userId: p.userId, action })}
                onEdit={() => setEditing(p)}
                onDelete={() => setRemoving(p)}
                onTransfer={() => setHandingOff(p)}
              />
            ))}
          </Section>
          {denied.length > 0 ? (
            <Section title="Denied" empty="">
              {denied.map((p) => (
                <MemberRow
                  key={p.userId}
                  profile={p}
                  mine={p.userId === myId}
                  ownerView={isOwner(myRole)}
                  busy={act.isPending}
                  onAct={(action) => act.mutate({ userId: p.userId, action })}
                  onEdit={() => setEditing(p)}
                  onDelete={() => setRemoving(p)}
                  onTransfer={() => setHandingOff(p)}
                />
              ))}
            </Section>
          ) : null}
        </>
      )}

      <AccountForm
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add account"
        description="Creates a login and approves them immediately. Tell them the password out of band."
        submitLabel="Create account"
        onSubmit={async (draft) => {
          const rows = await createAccount({ data: draft });
          qc.setQueryData(["mesh-team"], rows);
        }}
        allowManager={isOwner(myRole)}
      />

      <AccountForm
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="Edit account"
        description="Change name, email, desk details, or set a new password."
        submitLabel="Save account"
        initial={editing ?? undefined}
        onSubmit={async (draft) => {
          if (!editing) return;
          const rows = await updateMember({
            data: {
              userId: editing.userId,
              displayName: draft.displayName,
              email: draft.email,
              extension: draft.extension,
              cell: draft.cell,
              password: draft.password || undefined,
            },
          });
          qc.setQueryData(["mesh-team"], rows);
          await qc.invalidateQueries({ queryKey: ["mesh"] });
        }}
      />

      <DeleteAccountDialog
        profile={removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          const rows = await deleteMember({ data: { userId: removing.userId } });
          qc.setQueryData(["mesh-team"], rows);
          await qc.invalidateQueries({ queryKey: ["mesh"] });
          setRemoving(null);
          toast("Account deleted");
        }}
      />

      <TransferOwnerDialog
        profile={handingOff}
        onClose={() => setHandingOff(null)}
        onConfirm={async () => {
          if (!handingOff) return;
          const rows = await setTeamAccess({
            data: { userId: handingOff.userId, action: "transfer_owner" },
          });
          qc.setQueryData(["mesh-team"], rows);
          await qc.invalidateQueries({ queryKey: ["mesh-profile"] });
          await qc.invalidateQueries({ queryKey: ["mesh"] });
          setHandingOff(null);
          toast(`${handingOff.displayName} is now the owner. You are a manager.`);
        }}
      />
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const has = items.filter(Boolean).length > 0;
  return (
    <section>
      <h3 className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">{title}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {has ? children : <li className="text-sm text-faint">{empty}</li>}
      </ul>
    </section>
  );
}

function MemberRow({
  profile,
  mine,
  ownerView,
  busy,
  onAct,
  onEdit,
  onDelete,
  onTransfer,
}: {
  profile: MeshProfile;
  mine: boolean;
  ownerView: boolean;
  busy: boolean;
  onAct: (action: TeamAction) => void;
  onEdit: () => void;
  onDelete: () => void;
  onTransfer: () => void;
}) {
  const canDelete =
    !mine &&
    profile.role !== "owner" &&
    (profile.role !== "manager" || ownerView);
  return (
    <li className="rounded-lg bg-surface-2 p-3 shadow-[0_0_0_1px_var(--color-line)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {profile.displayName}
            {mine ? <span className="text-faint"> · you</span> : null}
          </p>
          <p className="truncate font-mono text-[12px] text-muted">
            {profile.email || "No email on file"}
            {profile.extension ? ` · ext ${profile.extension}` : ""}
            {profile.cell ? ` · ${formatCell(profile.cell)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {profile.role === "owner" ? <Badge tone="claimed">Owner</Badge> : null}
          {profile.role === "manager" ? <Badge tone="today">Manager</Badge> : null}
          <Badge
            tone={
              profile.accessStatus === "approved"
                ? "filled"
                : profile.accessStatus === "denied"
                  ? "hot"
                  : "today"
            }
          >
            {profile.accessStatus}
          </Badge>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={busy} onClick={onEdit}>
          Edit
        </Button>
        {profile.accessStatus === "pending" ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => onAct("approve")}>
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct("deny")}>
              Deny
            </Button>
          </>
        ) : null}
        {profile.accessStatus === "denied" ? (
          <Button size="sm" disabled={busy} onClick={() => onAct("approve")}>
            Approve
          </Button>
        ) : null}
        {ownerView &&
        profile.accessStatus === "approved" &&
        profile.role === "member" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct("make_manager")}>
            Make manager
          </Button>
        ) : null}
        {profile.accessStatus === "approved" && !mine && profile.role !== "owner" ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAct("deny")}>
            Revoke
          </Button>
        ) : null}
        {ownerView && profile.role === "manager" && !mine ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onAct("remove_manager")}
          >
            Remove manager
          </Button>
        ) : null}
        {ownerView &&
        profile.role === "manager" &&
        profile.accessStatus === "approved" &&
        !mine ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={onTransfer}>
            Make owner
          </Button>
        ) : null}
        {canDelete ? (
          <Button size="sm" variant="hot" disabled={busy} onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function AccountForm({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initial,
  onSubmit,
  allowManager = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  initial?: MeshProfile;
  onSubmit: (draft: {
    displayName: string;
    email: string;
    password: string;
    extension: string;
    cell: string;
    role: MemberRole;
  }) => Promise<void>;
  allowManager?: boolean;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [extension, setExtension] = useState("");
  const [cell, setCell] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isEdit = Boolean(initial);

  useEffect(() => {
    if (!open) return;
    setDisplayName(initial?.displayName ?? "");
    setEmail(initial?.email ?? "");
    setPassword("");
    setExtension(initial?.extension ?? "");
    setCell(initial?.cell ?? "");
    setRole(initial?.role ?? "member");
    setError("");
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3.5"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await onSubmit({
                displayName: displayName.trim(),
                email: email.trim(),
                password,
                extension: extension.trim(),
                cell: cell.trim(),
                role,
              });
              toast(isEdit ? "Account saved" : "Account created");
              onOpenChange(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Name" htmlFor="acct-name">
            <Input
              id="acct-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          </Field>
          <Field label="Email" htmlFor="acct-email">
            <Input
              id="acct-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field
            label={isEdit ? "New password (optional)" : "Password"}
            htmlFor="acct-password"
          >
            <Input
              id="acct-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={isEdit ? undefined : 8}
              required={!isEdit}
              autoComplete="new-password"
              placeholder={isEdit ? "Leave blank to keep" : "At least 8 characters"}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ring Central ext" htmlFor="acct-ext">
              <Input
                id="acct-ext"
                value={extension}
                onChange={(e) => setExtension(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Cell" htmlFor="acct-cell">
              <Input
                id="acct-cell"
                value={cell}
                onChange={(e) => setCell(e.target.value)}
                inputMode="tel"
              />
            </Field>
          </div>
          {!isEdit && allowManager ? (
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["member", "manager"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRole(value)}
                    className={
                      role === value
                        ? "h-11 rounded-md bg-ink font-mono text-[12px] tracking-wide text-primary-fg uppercase"
                        : "h-11 rounded-md bg-surface-2 font-mono text-[12px] tracking-wide text-muted uppercase shadow-[0_0_0_1px_var(--color-line)]"
                    }
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-hot">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({
  profile,
  onClose,
  onConfirm,
}: {
  profile: MeshProfile | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Dialog
      open={Boolean(profile)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {profile?.displayName || "this account"}?</DialogTitle>
          <DialogDescription>
            They lose this login immediately. Requests they posted stay on the
            board. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-hot">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="hot"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onConfirm();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not delete.");
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TransferOwnerDialog({
  profile,
  onClose,
  onConfirm,
}: {
  profile: MeshProfile | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPhrase("");
    setBusy(false);
    setError("");
  }, [profile?.userId]);

  const ready = phrase.trim().toUpperCase() === "TRANSFER";

  return (
    <Dialog
      open={Boolean(profile)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make {profile?.displayName || "this manager"} the owner?</DialogTitle>
          <DialogDescription>
            You become a manager. They get Updates, can delete managers, and can
            transfer ownership again. Type TRANSFER to confirm.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            if (!ready || busy) return;
            setBusy(true);
            setError("");
            try {
              await onConfirm();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not transfer.");
              setBusy(false);
            }
          }}
        >
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="TRANSFER"
            autoComplete="off"
            aria-label="Type TRANSFER to confirm"
          />
          {error ? <p className="text-sm text-hot">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="hot" disabled={!ready || busy}>
              {busy ? "Transferring…" : "Transfer ownership"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
