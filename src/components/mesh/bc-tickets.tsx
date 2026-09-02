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
      <DialogContent className="flex h-[min(90dvh,48rem)] w-[min(100%-1.5rem,46rem)] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Open orders</DialogTitle>
          <DialogDescription>
            Open sales orders for this part only. Sales order number, salesperson
            code, status. Customer records are not loaded.
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
          Type a part number. No ticket required. Requestick only asks BC for
          open orders on that item.
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
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-2 font-mono text-[11px] tracking-wider text-faint uppercase">
        {orders.length} open {orders.length === 1 ? "order" : "orders"} · {part}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg bg-surface-2 shadow-[0_0_0_1px_var(--color-line)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr className="border-b border-line font-mono text-[11px] tracking-wider text-faint uppercase">
              <th className="px-3 py-2 font-medium">Sales order</th>
              <th className="px-3 py-2 font-medium">Salesperson code</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((row) => (
              <tr key={row.orderId} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2 font-mono text-sm font-medium text-ink">
                  {row.orderNumber}
                </td>
                <td className="px-3 py-2 font-mono text-sm text-ink">
                  {row.salespersonCode || "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge tone="open">{row.status || "Open"}</Badge>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[12px] text-faint tabular-nums">
                  {row.outstanding > 0 ? row.outstanding : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
