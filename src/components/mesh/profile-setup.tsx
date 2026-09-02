import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveMyProfile } from "@/lib/mesh/api";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MeshMark } from "./mark";

export function ProfileSetup({
  initialName = "",
  initialExt = "",
  initialCell = "",
  compact = false,
  onSaved,
}: {
  initialName?: string;
  initialExt?: string;
  initialCell?: string;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState(
    initialName || user?.displayName || "",
  );
  const [extension, setExtension] = useState(initialExt);
  const [cell, setCell] = useState(initialCell);
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: (payload: {
      displayName: string;
      extension: string;
      cell: string;
      email: string;
      alertsOn: boolean;
    }) => saveMyProfile({ data: payload }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mesh"] });
      await qc.invalidateQueries({ queryKey: ["mesh-profile"] });
      onSaved?.();
    },
    onError: (err: Error) =>
      setError(err?.message || String(err) || "Could not save your desk card."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    save.mutate({
      displayName: displayName.trim(),
      extension: extension.trim(),
      cell: cell.trim(),
      email: user?.primaryEmail ?? "",
      alertsOn: true,
    });
  }

  return (
    <div className={compact ? "" : "mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center px-4 py-10"}>
      {!compact ? (
        <div className="mb-8 flex items-center gap-3">
          <MeshMark />
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
              Desk card
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">How should the desk reach you?</h1>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name on the board" htmlFor="station-name">
          <Input
            id="station-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="First name + last initial"
            autoComplete="name"
            required
            minLength={2}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ring Central ext" htmlFor="station-ext">
            <Input
              id="station-ext"
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
              placeholder="104"
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>
          <Field label="Cell for text" htmlFor="station-cell">
            <Input
              id="station-cell"
              value={cell}
              onChange={(e) => setCell(e.target.value)}
              placeholder="(616) 555-0100"
              inputMode="tel"
              autoComplete="tel"
            />
          </Field>
        </div>
        <p className="text-sm text-muted">
          Extension is for Ring Central. Cell is your personal phone — teammates use it
          to text, not to spam. You can change this later. First person through this
          screen becomes the admin and has to approve everyone else.
        </p>
        {error ? <p className="text-sm text-hot">{error}</p> : null}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending
            ? "Saving…"
            : compact
              ? "Save desk card"
              : "Continue"}
        </Button>
      </form>
    </div>
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
