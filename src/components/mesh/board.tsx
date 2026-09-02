import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  ClipboardList,
  Download,
  Megaphone,
  MessageSquare,
  EyeOff,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Trash2,
} from "lucide-react";
import {
  actOnNeed,
  getMesh,
  getMyProfile,
  listTeam,
  postAnnouncement,
  postNeed,
  saveMyProfile,
  updateNeed,
  wipeBoard,
} from "@/lib/mesh/api";
import type {
  MeshNeed,
  MeshSnapshot,
  NeedAction,
  NeedPriority,
  SortMode,
  StatusFilter,
} from "@/lib/mesh/types";
import {
  dateHeading,
  dateKey,
  displayName,
  downloadTextFile,
  formatCell,
  needsToCsv,
  priorityLabel,
  profileById,
  rcCallHref,
  relativeLabel,
  smsBody,
  smsHref,
  statusLabel,
  stripPartEdges,
  finishPart,
  telHref,
  timeLabel,
} from "@/lib/mesh/format";
import {
  diffAlerts,
  fireAlerts,
  requestAlertPermission,
  restoreTitle,
} from "@/lib/mesh/notify";
import { isStaff } from "@/lib/mesh/roles";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/utils";
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
import { Textarea } from "@/components/ui/textarea";
import { MeshWordmark } from "./mark";
import { ProfileSetup } from "./profile-setup";
import { AccessGate } from "./access-gate";
import { BcTicketsDialog } from "./bc-tickets";

export function Board() {
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const prevRef = useRef<MeshSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [sort, setSort] = useState<SortMode>("date");
  const [postOpen, setPostOpen] = useState(false);
  const [stationOpen, setStationOpen] = useState(false);
  const [bcOpen, setBcOpen] = useState(false);
  const [bcPart, setBcPart] = useState("");
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [noticePerm, setNoticePerm] = useState<NotificationPermission>(
    typeof Notification === "undefined" ? "denied" : Notification.permission,
  );

  const profile = useQuery({
    queryKey: ["mesh-profile"],
    queryFn: () => getMyProfile(),
    refetchInterval: 5000,
  });

  const approved = profile.data?.accessStatus === "approved";

  const mesh = useQuery({
    queryKey: ["mesh"],
    queryFn: () => getMesh(),
    refetchInterval: 7000,
    enabled: approved,
  });

  const team = useQuery({
    queryKey: ["mesh-team"],
    queryFn: () => listTeam(),
    enabled: approved && isStaff(profile.data?.role),
    refetchInterval: 8000,
  });

  useEffect(() => {
    const data = mesh.data;
    if (!data) return;
    const alerts = diffAlerts(prevRef.current, data, profile.data?.displayName ?? "");
    const prevAnnounce = prevRef.current?.announcement?.id ?? 0;
    prevRef.current = data;
    if (alerts.length > 0) {
      fireAlerts(alerts, data.profiles, data.me);
      for (const a of alerts) {
        toast(a.title, { description: a.body });
      }
    }
    const note = data.announcement;
    if (note && note.id !== prevAnnounce) {
      let seen = 0;
      try {
        seen = Number(localStorage.getItem("mesh.lastAnnounce") || "0");
      } catch {
        seen = 0;
      }
      if (note.id !== seen) {
        toast(note.body, { description: `${note.by} · desk announcement` });
        fireAlerts(
          [
            {
              title: `Desk: ${note.by}`,
              body: note.body,
              tag: `announce-${note.id}`,
              hot: true,
            },
          ],
          data.profiles,
          data.me,
        );
        try {
          localStorage.setItem("mesh.lastAnnounce", String(note.id));
        } catch {
          /* ignore */
        }
      }
    }
  }, [mesh.data, profile.data?.displayName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setPostOpen(true);
      }
    };
    const onFocus = () => restoreTitle();
    window.addEventListener("keydown", onKey);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const mine = profile.data;
  const snapshot = mesh.data;

  const visible = useMemo(() => {
    if (!snapshot) return [];
    return filterNeeds(snapshot, filter, query, sort);
  }, [snapshot, filter, query, sort]);

  const grouped = useMemo(() => groupNeeds(visible, sort), [visible, sort]);

  async function enableAlerts() {
    const perm = await requestAlertPermission();
    setNoticePerm(perm);
    if (perm === "granted") {
      toast("Windows alerts on", { description: "You'll get a toast when a request updates." });
      if (mine && !mine.alertsOn) {
        await saveMyProfile({
          data: {
            displayName: mine.displayName,
            extension: mine.extension,
            cell: mine.cell,
            email: mine.email,
            alertsOn: true,
          },
        });
        await qc.invalidateQueries({ queryKey: ["mesh-profile"] });
      }
    } else {
      toast("Alerts blocked", { description: "Allow notifications in the browser if you want Windows toasts." });
    }
  }

  async function muteAlerts() {
    if (!mine) return;
    await saveMyProfile({
      data: {
        displayName: mine.displayName,
        extension: mine.extension,
        cell: mine.cell,
        email: mine.email,
        alertsOn: false,
      },
    });
    await qc.invalidateQueries({ queryKey: ["mesh-profile"] });
    toast("Alerts muted on this station");
  }

  function exportCsv() {
    if (!snapshot) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `requestick-${stamp}.csv`,
      needsToCsv(snapshot.needs, snapshot.profiles),
      "text/csv;charset=utf-8",
    );
  }

  if (profile.isPending || (profile.data === undefined && profile.isFetching)) {
    return <BoardSkeleton />;
  }

  if (profile.isError) {
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center px-4 py-10">
        <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
          Requestick
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Could not load Requestick</h1>
        <p className="mt-2 text-sm text-hot">
          {profile.error instanceof Error
            ? profile.error.message
            : "The sales board is temporarily unavailable."}
        </p>
        <Button className="mt-6 w-fit" onClick={() => void profile.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!mine?.displayName) {
    return <ProfileSetup initialName={mine?.displayName} />;
  }

  if (mine.accessStatus !== "approved") {
    return <AccessGate profile={mine} />;
  }

  const alertsOn = mine.alertsOn && noticePerm === "granted";
  const pendingCount = team.data?.filter((p) => p.accessStatus === "pending").length ?? 0;

  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <MeshWordmark compact />
          <div className="hidden items-center gap-2 font-mono text-[12px] text-muted sm:flex">
            <LiveDot error={mesh.isError} fetching={mesh.isFetching} />
            <span className="tabular-nums">
              {snapshot ? `${snapshot.openCount} open` : "—"}
              {snapshot && snapshot.claimedCount > 0 ? ` · ${snapshot.claimedCount} on it` : ""}
              {snapshot && snapshot.hotCount > 0 ? ` · ${snapshot.hotCount} hot` : ""}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => (alertsOn ? void muteAlerts() : void enableAlerts())}
              className="hidden sm:inline-flex"
            >
              {alertsOn ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
              {alertsOn ? "Alerts on" : "Windows alerts"}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="sm:hidden"
              onClick={() => (alertsOn ? void muteAlerts() : void enableAlerts())}
              aria-label={alertsOn ? "Mute alerts" : "Enable Windows alerts"}
            >
              {alertsOn ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            </Button>
            {isStaff(mine.role) ? (
              <Button asChild variant="outline" size="sm" className="relative">
                <Link to="/admin">
                  <Shield className="size-3.5" />
                  <span className="hidden sm:inline">Admin</span>
                  {pendingCount > 0 ? (
                    <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-hot px-1 font-mono text-[10px] text-primary-fg">
                      {pendingCount}
                    </span>
                  ) : null}
                </Link>
              </Button>
            ) : null}
            {isStaff(mine.role) ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setAnnounceOpen(true)}>
                  <Megaphone className="size-3.5" />
                  <span className="hidden sm:inline">Announce</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWipeOpen(true)}>
                  <Trash2 className="size-3.5" />
                  <span className="hidden sm:inline">Wipe</span>
                </Button>
              </>
            ) : null}
            {isStaff(mine.role) && snapshot?.bcConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBcPart("");
                  setBcOpen(true);
                }}
              >
                <ClipboardList className="size-3.5" />
                <span className="hidden sm:inline">Part search</span>
              </Button>
            ) : null}
            <Button variant="ghost" size="icon-sm" onClick={() => setStationOpen(true)} aria-label="Desk settings">
              <Settings2 className="size-4" />
            </Button>
            <div className="hidden max-w-40 truncate sm:block">
              <UserButton />
            </div>
            <div className="sm:hidden">
              <UserButton />
            </div>
          </div>
        </div>
      </header>

      {mesh.isError ? (
        <div className="border-b border-hot/30 bg-hot-bg px-4 py-2 text-center text-sm text-hot">
          Offline — reconnect to see the live board.{" "}
          <button type="button" className="underline" onClick={() => void mesh.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search part number, ticket, name"
              className="pl-10"
              aria-label="Search requests"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "open", label: "Open" },
                { value: "claimed", label: "On it" },
                { value: "filled", label: "Filled" },
                { value: "all", label: "All" },
                ...(isStaff(mine.role)
                  ? [{ value: "hidden" as const, label: "Hidden" }]
                  : []),
              ]}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="h-11 rounded-md bg-surface-2 px-3 font-mono text-[13px] text-ink shadow-[0_0_0_1px_var(--color-line)]"
              aria-label="Sort"
            >
              <option value="date">Date + PN</option>
              <option value="part">Part number</option>
              <option value="priority">Priority</option>
            </select>
            <Button variant="outline" size="icon" onClick={exportCsv} aria-label="Download CSV">
              <Download className="size-4" />
            </Button>
            <Button className="hidden sm:inline-flex" onClick={() => setPostOpen(true)}>
              <Plus className="size-4" />
              Post a need
            </Button>
          </div>
        </div>

        <p className="mt-3 hidden text-xs text-faint sm:block">
          Press <kbd className="rounded-sm bg-bg-deep px-1 font-mono">N</kbd> to post,{" "}
          <kbd className="rounded-sm bg-bg-deep px-1 font-mono">/</kbd> to search. Leave this tab open
          for Windows alerts.
        </p>

        {mesh.isPending && !snapshot ? (
          <BoardSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            filtered={Boolean(query) || filter !== "open"}
            onPost={() => setPostOpen(true)}
          />
        ) : (
          <div className="mt-5 flex flex-col gap-8 pb-8">
            {grouped.map((group) => (
              <section key={group.key}>
                <header className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="font-sans text-sm font-semibold tracking-tight text-ink">
                    {group.label}
                  </h2>
                  <span className="font-mono text-[11px] tracking-wider text-faint uppercase">
                    {group.items.length} {group.items.length === 1 ? "need" : "needs"}
                  </span>
                </header>
                <ul className="flex flex-col gap-2">
                  {group.items.map((need) => (
                    <li key={need.id}>
                      <NeedCard
                        need={need}
                        snapshot={snapshot!}
                        mineId={snapshot!.me}
                        myName={mine.displayName}
                        isAdmin={isStaff(mine.role)}
                        canLookupBc={isStaff(mine.role) && Boolean(snapshot?.bcConnected)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setPostOpen(true)}
        className="fixed right-4 bottom-4 z-20 grid size-14 place-items-center rounded-full bg-primary text-primary-fg shadow-ticket sm:hidden"
        aria-label="Post a need"
      >
        <Plus className="size-6" />
      </button>

      <PostNeedDialog
        open={postOpen}
        onOpenChange={setPostOpen}
        snapshot={snapshot}
      />

      <BcTicketsDialog
        open={bcOpen}
        onOpenChange={setBcOpen}
        partNumber={bcPart}
      />

      <AnnounceDialog open={announceOpen} onOpenChange={setAnnounceOpen} />
      <WipeDialog open={wipeOpen} onOpenChange={setWipeOpen} />

      <Dialog open={stationOpen} onOpenChange={setStationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your desk</DialogTitle>
            <DialogDescription>
              Name, Ring Central extension, and the cell the team should text.
            </DialogDescription>
          </DialogHeader>
          <ProfileSetup
            compact
            initialName={mine.displayName}
            initialExt={mine.extension}
            initialCell={mine.cell}
            onSaved={() => setStationOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LiveDot({ error, fetching }: { error: boolean; fetching: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "size-1.5 rounded-full",
          error ? "bg-hot" : "bg-filled",
          fetching && !error ? "animate-[mesh-pulse_1.2s_ease-in-out_infinite]" : "",
        )}
      />
      {error ? "Offline" : "Live"}
    </span>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex h-11 rounded-md bg-surface-2 p-1 shadow-[0_0_0_1px_var(--color-line)]">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-full rounded-sm px-2.5 font-mono text-[12px] tracking-wide uppercase",
            value === opt.value ? "bg-ink text-primary-fg" : "text-muted hover:text-ink",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ filtered, onPost }: { filtered: boolean; onPost: () => void }) {
  return (
    <div className="mt-10 rounded-xl bg-surface px-6 py-16 text-center shadow-ticket">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">
        {filtered ? "No matches" : "Board is clear"}
      </p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">
        {filtered ? "Nothing matches that search." : "No open requests on the desk."}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        {filtered
          ? "Try a different part number, ticket, or switch the filter to All."
          : "When a dealer ticket is missing a gun or a part, post it here instead of an email blast."}
      </p>
      {!filtered ? (
        <Button className="mt-6" onClick={onPost}>
          <Plus className="size-4" />
          Post the first need
        </Button>
      ) : null}
    </div>
  );
}

function NeedCard({
  need,
  snapshot,
  mineId,
  myName,
  isAdmin,
  canLookupBc,
}: {
  need: MeshNeed;
  snapshot: MeshSnapshot;
  mineId: string;
  myName: string;
  isAdmin: boolean;
  canLookupBc: boolean;
}) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const who = profileById(snapshot.profiles, need.createdBy);
  const claimer = profileById(snapshot.profiles, need.claimedBy);
  const filler = profileById(snapshot.profiles, need.filledBy);
  const act = useMutation({
    mutationFn: (action: NeedAction) => actOnNeed({ data: { id: need.id, action } }),
    onSuccess: (_need, action) => {
      void qc.invalidateQueries({ queryKey: ["mesh"] });
      if (action === "claim") toast("You're on it");
      if (action === "fill") toast("Marked filled");
      if (action === "release") toast("Released back to open");
      if (action === "drop") toast("Hidden from the board");
      if (action === "remove") toast("Removed");
    },
    onError: (err: Error) => toast.error(err.message || "Could not update."),
  });

  const callCell = who ? telHref(who.cell) : null;
  const textCell = who ? smsHref(who.cell, smsBody(need, myName)) : null;
  const callExt = who ? rcCallHref(who.extension) : null;
  const callHref = callExt ?? callCell;
  const callLabel = callExt ? `Call ${who?.extension}` : "Call";
  const muted = need.status === "filled" || need.status === "cancelled";

  return (
    <article
      className={cn(
        "rounded-lg bg-surface-2 p-4 shadow-ticket",
        muted && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={need.priority}>
              {need.priority === "later" ? "When you can" : priorityLabel(need.priority)}
            </Badge>
            <Badge tone={need.status}>{statusLabel(need.status)}</Badge>
            {need.ticketNumber ? (
              <span className="font-mono text-[12px] text-muted">Ticket {need.ticketNumber}</span>
            ) : null}
          </div>
          <h3 className="mt-2 font-mono text-[1.15rem] font-semibold tracking-tight text-ink">
            {canLookupBc ? (
              <button
                type="button"
                className="underline decoration-line underline-offset-4 hover:text-ink-soft"
                title="Open orders in Business Central"
                onClick={() => setOrdersOpen(true)}
              >
                {need.partNumber}
              </button>
            ) : (
              need.partNumber
            )}
          </h3>
          {need.description ? (
            <p className="mt-0.5 text-sm text-ink-soft">{need.description}</p>
          ) : null}
          {need.notes ? <p className="mt-1 text-sm text-muted">{need.notes}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-xs text-faint tabular-nums">qty {need.qty}</span>
          <span className="font-mono text-[11px] text-faint">{timeLabel(need.createdAt)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-ink-soft">
          <span className="font-medium text-ink">{who?.displayName ?? "Teammate"}</span>
          {who?.extension ? <span className="text-muted"> · ext {who.extension}</span> : null}
          {who?.cell ? (
            <span className="text-muted"> · {formatCell(who.cell)}</span>
          ) : null}
          {need.status === "claimed" && claimer ? (
            <p className="mt-0.5 text-xs text-claimed">
              {claimer.displayName} is on it
              {need.claimedAt ? ` · ${relativeLabel(need.claimedAt)}` : ""}
            </p>
          ) : null}
          {need.status === "filled" && filler ? (
            <p className="mt-0.5 text-xs text-filled">
              Filled by {filler.displayName}
              {need.filledAt ? ` · ${relativeLabel(need.filledAt)}` : ""}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {callHref ? (
            <Button asChild variant="outline" size="sm">
              <a href={callHref} title={callExt ? "Opens Ring Central" : "Call cell"}>
                <Phone className="size-3.5" />
                {callLabel}
              </a>
            </Button>
          ) : null}
          {textCell ? (
            <Button asChild variant="outline" size="sm">
              <a href={textCell}>
                <MessageSquare className="size-3.5" />
                Text
              </a>
            </Button>
          ) : null}

          {canLookupBc ? (
            <Button variant="outline" size="sm" onClick={() => setOrdersOpen(true)}>
              <ClipboardList className="size-3.5" />
              Orders
            </Button>
          ) : null}

          {need.status === "open" ? (
            <>
              <Button
                variant="claimed"
                size="sm"
                disabled={act.isPending}
                onClick={() => act.mutate("claim")}
              >
                On it
              </Button>
              <Button
                variant="filled"
                size="sm"
                disabled={act.isPending}
                onClick={() => act.mutate("fill")}
              >
                Filled
              </Button>
            </>
          ) : null}

          {need.status === "claimed" ? (
            <>
              {need.claimedBy === mineId || isAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={act.isPending}
                  onClick={() => act.mutate("release")}
                >
                  Release
                </Button>
              ) : null}
              <Button
                variant="filled"
                size="sm"
                disabled={act.isPending}
                onClick={() => act.mutate("fill")}
              >
                Filled
              </Button>
            </>
          ) : null}

          {(need.status === "filled" || need.status === "cancelled") &&
          (isAdmin ||
            need.createdBy === mineId ||
            need.filledBy === mineId ||
            need.claimedBy === mineId) ? (
            <Button
              variant="outline"
              size="sm"
              disabled={act.isPending}
              onClick={() => act.mutate("reopen")}
            >
              <RefreshCw className="size-3.5" />
              Reopen
            </Button>
          ) : null}

          {(need.createdBy === mineId || isAdmin) &&
          need.status !== "cancelled" &&
          need.status !== "filled" ? (
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
          ) : null}

          {(need.createdBy === mineId || isAdmin) && need.status !== "cancelled" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={act.isPending}
              onClick={() => act.mutate("drop")}
            >
              <EyeOff className="size-3.5" />
              Hide
            </Button>
          ) : null}

          {isAdmin && need.status === "cancelled" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={act.isPending}
              onClick={() => act.mutate("remove")}
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <EditNeedDialog need={need} open={editOpen} onOpenChange={setEditOpen} />
      {canLookupBc ? (
        <BcTicketsDialog
          open={ordersOpen}
          onOpenChange={setOrdersOpen}
          partNumber={need.partNumber}
        />
      ) : null}
    </article>
  );
}

function PostNeedDialog({
  open,
  onOpenChange,
  snapshot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: MeshSnapshot | undefined;
}) {
  const qc = useQueryClient();
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");
  const [qty, setQty] = useState("1");
  const [priority, setPriority] = useState<NeedPriority>("today");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const duplicates = useMemo(() => {
    if (!snapshot || !partNumber.trim()) return [];
    const pn = partNumber.trim().toUpperCase();
    return snapshot.needs.filter(
      (n) => n.partNumber === pn && (n.status === "open" || n.status === "claimed"),
    );
  }, [snapshot, partNumber]);

  const post = useMutation({
    mutationFn: () =>
      postNeed({
        data: {
          partNumber,
          description,
          ticketNumber,
          qty: Number(qty) || 1,
          priority,
          notes,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mesh"] });
      setPartNumber("");
      setDescription("");
      setTicketNumber("");
      setQty("1");
      setPriority("today");
      setNotes("");
      setError("");
      onOpenChange(false);
      toast("Posted");
    },
    onError: (err: Error) => setError(err.message || "Could not post."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    post.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post a need</DialogTitle>
          <DialogDescription>
            Part number is the only required field. Ticket, description, qty, and
            notes are optional.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pn">Part number (required)</Label>
              <Input
                id="pn"
                value={partNumber}
                onChange={(e) => setPartNumber(stripPartEdges(e.target.value))}
                onBlur={() => setPartNumber(finishPart(partNumber))}
                placeholder="44192-BLK"
                className="font-mono uppercase"
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket">Open ticket</Label>
              <Input
                id="ticket"
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          {duplicates.length > 0 ? (
            <p className="rounded-md bg-today-bg px-3 py-2 text-sm text-today">
              Already posted: {duplicates.length} open{" "}
              {duplicates.length === 1 ? "need" : "needs"} for this PN
              {duplicates[0]
                ? ` · ${displayName(snapshot?.profiles ?? [], duplicates[0].createdBy)}`
                : ""}
              .
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desc">What is it?</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[5.5rem_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qty">Qty</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                max={9999}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["hot", "Hot"],
                    ["today", "Today"],
                    ["later", "Later"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPriority(value)}
                    className={cn(
                      "h-11 rounded-md font-mono text-[12px] uppercase tracking-wide",
                      priority === value
                        ? value === "hot"
                          ? "bg-hot text-primary-fg"
                          : value === "today"
                            ? "bg-today text-primary-fg"
                            : "bg-later text-primary-fg"
                        : "bg-surface-2 text-muted shadow-[0_0_0_1px_var(--color-line)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Customer waiting, special finish, drop-ship…"
              rows={2}
            />
          </div>
          {error ? <p className="text-sm text-hot">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={post.isPending || !finishPart(partNumber)}>
              {post.isPending ? "Posting…" : "Post request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditNeedDialog({
  need,
  open,
  onOpenChange,
}: {
  need: MeshNeed;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [partNumber, setPartNumber] = useState(need.partNumber);
  const [description, setDescription] = useState(need.description);
  const [ticketNumber, setTicketNumber] = useState(need.ticketNumber);
  const [qty, setQty] = useState(String(need.qty));
  const [priority, setPriority] = useState<NeedPriority>(need.priority);
  const [notes, setNotes] = useState(need.notes);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPartNumber(need.partNumber);
    setDescription(need.description);
    setTicketNumber(need.ticketNumber);
    setQty(String(need.qty));
    setPriority(need.priority);
    setNotes(need.notes);
    setError("");
  }, [open, need]);

  const save = useMutation({
    mutationFn: () =>
      updateNeed({
        data: {
          id: need.id,
          partNumber,
          description,
          ticketNumber,
          qty: Number(qty) || 1,
          priority,
          notes,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mesh"] });
      onOpenChange(false);
      toast("Need updated");
    },
    onError: (err: Error) => setError(err.message || "Could not save."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit need</DialogTitle>
          <DialogDescription>
            Correct the part number, ticket, or qty after it is posted.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-pn-${need.id}`}>Part number</Label>
              <Input
                id={`edit-pn-${need.id}`}
                value={partNumber}
                onChange={(e) => setPartNumber(stripPartEdges(e.target.value))}
                onBlur={() => setPartNumber(finishPart(partNumber))}
                className="font-mono uppercase"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-ticket-${need.id}`}>Open ticket</Label>
              <Input
                id={`edit-ticket-${need.id}`}
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-desc-${need.id}`}>What is it?</Label>
            <Input
              id={`edit-desc-${need.id}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[5.5rem_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-qty-${need.id}`}>Qty</Label>
              <Input
                id={`edit-qty-${need.id}`}
                type="number"
                min={1}
                max={9999}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["hot", "Hot"],
                    ["today", "Today"],
                    ["later", "Later"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPriority(value)}
                    className={cn(
                      "h-11 rounded-md font-mono text-[12px] uppercase tracking-wide",
                      priority === value
                        ? value === "hot"
                          ? "bg-hot text-primary-fg"
                          : value === "today"
                            ? "bg-today text-primary-fg"
                            : "bg-later text-primary-fg"
                        : "bg-surface-2 text-muted shadow-[0_0_0_1px_var(--color-line)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-notes-${need.id}`}>Notes</Label>
            <Textarea
              id={`edit-notes-${need.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          {error ? <p className="text-sm text-hot">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function filterNeeds(
  snapshot: MeshSnapshot,
  filter: StatusFilter,
  query: string,
  sort: SortMode,
): MeshNeed[] {
  const q = query.trim().toLowerCase();
  let list = snapshot.needs.filter((n) => {
    if (filter === "open") return n.status === "open";
    if (filter === "claimed") return n.status === "claimed";
    if (filter === "filled") return n.status === "filled";
    if (filter === "hidden") return n.status === "cancelled";
    return n.status !== "cancelled";
  });
  if (q) {
    list = list.filter((n) => {
      const who = displayName(snapshot.profiles, n.createdBy).toLowerCase();
      return (
        n.partNumber.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.ticketNumber.toLowerCase().includes(q) ||
        who.includes(q)
      );
    });
  }
  const prio = { hot: 0, today: 1, later: 2 };
  const copy = [...list];
  if (sort === "part") {
    copy.sort(
      (a, b) =>
        a.partNumber.localeCompare(b.partNumber) ||
        +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  } else if (sort === "priority") {
    copy.sort(
      (a, b) =>
        prio[a.priority] - prio[b.priority] ||
        +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  } else {
    copy.sort(
      (a, b) =>
        +new Date(b.createdAt) - +new Date(a.createdAt) ||
        a.partNumber.localeCompare(b.partNumber),
    );
  }
  return copy;
}

function groupNeeds(needs: MeshNeed[], sort: SortMode): { key: string; label: string; items: MeshNeed[] }[] {
  const map = new Map<string, MeshNeed[]>();
  for (const need of needs) {
    let key: string;
    if (sort === "part") {
      key = need.partNumber;
    } else if (sort === "priority") {
      key = need.priority;
    } else {
      key = dateKey(need.createdAt);
    }
    const bucket = map.get(key);
    if (bucket) bucket.push(need);
    else map.set(key, [need]);
  }
  if (sort === "date") {
    for (const items of map.values()) {
      items.sort((a, b) => a.partNumber.localeCompare(b.partNumber));
    }
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    label: groupLabel(sort, key, items),
    items,
  }));
}

function groupLabel(sort: SortMode, key: string, items: MeshNeed[]): string {
  if (sort === "date") return dateHeading(items[0]?.createdAt ?? key);
  if (sort === "priority") {
    if (key === "hot") return "Hot";
    if (key === "today") return "Today";
    return "When you can";
  }
  return key;
}

function AnnounceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: () => postAnnouncement({ data: { body } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["mesh"] });
      toast("Announcement sent");
      setBody("");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || "Could not announce."),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Announce to the desk</DialogTitle>
          <DialogDescription>
            Everyone with the board open gets a toast and a Windows alert. Manual only.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="Parts truck is here — pull your fills."
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={send.isPending || body.trim().length < 2}>
              Send toast
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WipeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const wipe = useMutation({
    mutationFn: () => wipeBoard({ data: { confirm } }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["mesh"] });
      toast(`Wiped ${result.removed} request${result.removed === 1 ? "" : "s"}`);
      setConfirm("");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || "Could not wipe."),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirm("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Wipe the board?</DialogTitle>
          <DialogDescription>
            This permanently deletes every request, including hidden ones. Business
            Central is not touched. Type WIPE to confirm.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            wipe.mutate();
          }}
        >
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="WIPE"
            autoComplete="off"
            aria-label="Type WIPE to confirm"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="hot"
              disabled={wipe.isPending || confirm.trim().toUpperCase() !== "WIPE"}
            >
              Wipe tickets
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BoardSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-10 sm:px-6">
      <div className="h-11 rounded-md bg-bg-deep/80" />
      <div className="h-28 rounded-lg bg-surface shadow-ticket" />
      <div className="h-28 rounded-lg bg-surface shadow-ticket" />
      <div className="h-28 rounded-lg bg-surface shadow-ticket" />
    </div>
  );
}
