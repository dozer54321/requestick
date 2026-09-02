import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listBcOpen, postNeed, getMesh } from "@/lib/mesh/api";
import type { BcLine, BcTicket, MeshProfile } from "@/lib/mesh/types";
import { matchSalesperson } from "@/lib/mesh/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function BcTicketsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%-1.5rem,44rem)]">
        <DialogHeader>
          <DialogTitle>Open in Business Central</DialogTitle>
          <DialogDescription>
            Salespeople with items still sitting on an order or quote. Pull a line
            onto the board when someone on the desk needs to chase it.
          </DialogDescription>
        </DialogHeader>
        <BcTicketsList />
      </DialogContent>
    </Dialog>
  );
}

export function BcTicketsList() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const tickets = useQuery({
    queryKey: ["mesh-bc-tickets"],
    queryFn: () => listBcOpen(),
  });
  const mesh = useQuery({
    queryKey: ["mesh"],
    queryFn: () => getMesh(),
  });

  const pull = useMutation({
    mutationFn: (payload: { ticket: BcTicket; line: BcLine }) =>
      postNeed({
        data: {
          partNumber: payload.line.partNumber,
          description: payload.line.description || payload.line.partNumber,
          ticketNumber: payload.ticket.number,
          qty: payload.line.outstanding || payload.line.qty || 1,
          priority: "today",
          notes: [payload.ticket.kind, payload.ticket.customer, payload.ticket.salesperson]
            .filter(Boolean)
            .join(" · "),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mesh"] });
      await qc.invalidateQueries({ queryKey: ["mesh-bc-tickets"] });
      toast("Posted");
    },
    onError: (err: Error) => toast.error(err.message || "Could not post."),
  });

  const profiles = mesh.data?.profiles ?? [];
  const groups = useMemo(
    () => groupBySalesperson(tickets.data ?? [], profiles, query),
    [tickets.data, profiles, query],
  );

  if (tickets.isPending) {
    return <p className="text-sm text-muted">Reading open tickets…</p>;
  }
  if (tickets.isError) {
    return (
      <p className="text-sm text-hot">
        {tickets.error instanceof Error
          ? tickets.error.message
          : "Could not read Business Central."}
      </p>
    );
  }
  if ((tickets.data ?? []).length === 0) {
    return (
      <p className="text-sm text-muted">
        No open sales orders or quotes came back. Check the company and that the
        app has permission to read sales documents.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter salesperson, customer, ticket, part"
        aria-label="Filter Business Central tickets"
      />
      {groups.length === 0 ? (
        <p className="text-sm text-faint">Nothing matches that filter.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <header className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold tracking-tight text-ink">{group.label}</h3>
              <span className="font-mono text-[11px] tracking-wider text-faint uppercase">
                {group.count} {group.count === 1 ? "line" : "lines"}
              </span>
            </header>
            <ul className="flex flex-col gap-2">
              {group.tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="rounded-lg bg-surface-2 p-3 shadow-[0_0_0_1px_var(--color-line)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={ticket.kind === "order" ? "claimed" : "today"}>
                          {ticket.kind}
                        </Badge>
                        <span className="font-mono text-[13px] font-medium text-ink">
                          {ticket.number}
                        </span>
                        {ticket.onMesh ? <Badge tone="filled">Posted</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-ink-soft">
                        {ticket.customer || "No customer name"}
                      </p>
                    </div>
                    {ticket.status ? (
                      <span className="font-mono text-[11px] text-faint uppercase">
                        {ticket.status}
                      </span>
                    ) : null}
                  </div>
                  {ticket.lines.length === 0 ? (
                    <p className="mt-2 text-sm text-faint">No item lines on this document.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
                      {ticket.lines.map((line) => (
                        <li
                          key={line.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-medium text-ink">
                              {line.partNumber}
                            </p>
                            <p className="truncate text-sm text-muted">{line.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-faint tabular-nums">
                              qty {line.outstanding || line.qty}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pull.isPending}
                              onClick={() => pull.mutate({ ticket, line })}
                            >
                              Post
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function groupBySalesperson(
  tickets: BcTicket[],
  profiles: MeshProfile[],
  query: string,
) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? tickets.filter((t) => {
        const blob = [
          t.salesperson,
          t.customer,
          t.number,
          t.kind,
          ...t.lines.map((l) => `${l.partNumber} ${l.description}`),
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      })
    : tickets;

  const map = new Map<string, BcTicket[]>();
  for (const ticket of filtered) {
    const key = ticket.salesperson.trim() || "Unassigned";
    const bucket = map.get(key);
    if (bucket) bucket.push(ticket);
    else map.set(key, [ticket]);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => {
      const who = matchSalesperson(key, profiles);
      const count = list.reduce((n, t) => n + Math.max(t.lines.length, 1), 0);
      return {
        key,
        label: who
          ? `${who.displayName}${who.extension ? ` · ext ${who.extension}` : ""}`
          : key,
        count,
        tickets: list,
      };
    });
}
