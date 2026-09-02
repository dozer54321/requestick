import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchBcPart } from "@/lib/mesh/api";
import type { BcPartOrder } from "@/lib/mesh/types";
import { finishPart, stripPartEdges } from "@/lib/mesh/format";
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
  partNumber = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partNumber?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[min(100%-1.5rem,36rem)] max-h-[min(88vh,40rem)] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Open orders</DialogTitle>
          <DialogDescription>
            Sales orders still open for this part. Order number, salesperson code,
            status. Customer data is not pulled.
          </DialogDescription>
        </DialogHeader>
        <BcPartSearch
          key={partNumber || "search"}
          initialPart={partNumber}
          autoSearch={Boolean(partNumber)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function BcPartSearch({
  initialPart = "",
  autoSearch = false,
}: {
  initialPart?: string;
  autoSearch?: boolean;
}) {
  const [draft, setDraft] = useState(finishPart(initialPart));
  const [part, setPart] = useState(autoSearch ? finishPart(initialPart) : "");

  const orders = useQuery({
    queryKey: ["mesh-bc-part", part],
    queryFn: () => searchBcPart({ data: { partNumber: part } }),
    enabled: part.length > 0,
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPart(finishPart(draft));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(stripPartEdges(e.target.value))}
          onBlur={() => setDraft(finishPart(draft))}
          placeholder="Part number"
          className="font-mono uppercase"
          aria-label="Part number"
        />
        <Button type="submit" disabled={!finishPart(draft)}>
          Search
        </Button>
      </form>
      {!part ? (
        <p className="text-sm text-muted">
          Enter a part number. Requestick only asks BC for open orders on that item.
        </p>
      ) : orders.isPending ? (
        <p className="text-sm text-muted">Looking up {part}…</p>
      ) : orders.isError ? (
        <p className="text-sm text-hot">
          {orders.error instanceof Error
            ? orders.error.message
            : "Could not read Business Central."}
        </p>
      ) : (
        <PartOrderList part={part} orders={orders.data ?? []} />
      )}
    </div>
  );
}

function PartOrderList({ part, orders }: { part: string; orders: BcPartOrder[] }) {
  if (orders.length === 0) {
    return (
      <p className="text-sm text-muted">
        No open sales orders for <span className="font-mono text-ink">{part}</span>.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="font-mono text-[11px] tracking-wider text-faint uppercase">
        {orders.length} open {orders.length === 1 ? "order" : "orders"} · {part}
      </p>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg bg-surface-2 shadow-[0_0_0_1px_var(--color-line)]">
        {orders.map((row) => (
          <li
            key={row.orderId}
            className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium text-ink">
                {row.orderNumber}
                {row.salespersonCode ? (
                  <span className="text-muted"> · {row.salespersonCode}</span>
                ) : (
                  <span className="text-faint"> · no salesperson</span>
                )}
              </p>
              {row.description ? (
                <p className="truncate text-xs text-faint">{row.description}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone="open">{row.status || "Open"}</Badge>
              {row.outstanding > 0 ? (
                <span className="font-mono text-[11px] text-faint tabular-nums">
                  qty {row.outstanding}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
