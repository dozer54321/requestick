import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, Download, History, RefreshCw } from "lucide-react";
import { applyAppUpdate, getUpdateStatus } from "@/lib/mesh/api";
import type { ReleaseInfo } from "@/lib/mesh/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function UpdatesPanel() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<ReleaseInfo | null>(null);
  const status = useQuery({
    queryKey: ["mesh-updates"],
    queryFn: () => getUpdateStatus(),
    refetchInterval: (q) => {
      const job = q.state.data?.job.state;
      return job === "downloading" || job === "loading" || job === "restarting" ? 2000 : false;
    },
  });

  const apply = useMutation({
    mutationFn: (tag: string) => applyAppUpdate({ data: { tag } }),
    onSuccess: (next) => {
      qc.setQueryData(["mesh-updates"], next);
      toast("Switching versions. The board will come back in about 30 seconds.");
    },
    onError: (err: Error) => toast(err.message || "Could not switch versions."),
  });

  const data = status.data;
  const busy =
    apply.isPending ||
    data?.job.state === "downloading" ||
    data?.job.state === "loading" ||
    data?.job.state === "restarting";

  useEffect(() => {
    if (!data?.job.targetTag) return;
    if (data.currentVersion === data.job.targetTag && data.job.state === "idle") {
      toast(`Running ${data.currentVersion}.`);
    }
  }, [data?.currentVersion, data?.job.state, data?.job.targetTag]);

  if (status.isPending) {
    return <p className="text-sm text-muted">Checking GitHub…</p>;
  }

  if (status.isError || !data) {
    return (
      <p className="text-sm text-hot">
        {(status.error as Error)?.message || "Could not check for updates."}
      </p>
    );
  }

  const latest = data.releases[0] ?? null;

  function go(rel: ReleaseInfo) {
    setConfirm(null);
    apply.mutate(rel.tag);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="rounded-lg bg-surface p-5 shadow-ticket">
        <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">This install</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-ink">
          {data.currentVersion}
        </p>
        <p className="mt-2 text-sm text-muted">
          Updates are manual. Tickets, accounts, and the database stay put. The site restarts
          for about 30 seconds while the app container swaps.
        </p>
        {data.updateAvailable && latest ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={!data.canApply || busy}
              onClick={() => setConfirm(latest)}
            >
              <Download className="size-4" />
              Update to {latest.tag}
            </Button>
            <span className="text-sm text-muted">Newest on GitHub.</span>
          </div>
        ) : (
          <p className="mt-4 text-sm text-filled">You are on the newest release.</p>
        )}
        {busy ? (
          <p className="mt-3 font-mono text-[12px] tracking-wide text-claimed uppercase">
            {data.job.state === "downloading"
              ? `Downloading ${data.job.targetTag}…`
              : data.job.state === "loading"
                ? `Loading ${data.job.targetTag}…`
                : `Restarting on ${data.job.targetTag}…`}
          </p>
        ) : null}
        {data.job.state === "error" && data.job.error ? (
          <p className="mt-3 text-sm text-hot">{data.job.error}</p>
        ) : null}
        {!data.canApply && data.reason ? (
          <p className="mt-3 text-sm text-muted">{data.reason}</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => status.refetch()}
          disabled={busy}
        >
          <RefreshCw className="size-3.5" />
          Check GitHub
        </Button>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <History className="size-4 text-muted" />
          <h2 className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
            Versions
          </h2>
        </div>
        <ul className="flex flex-col gap-2">
          {data.releases.length === 0 ? (
            <li className="rounded-lg bg-surface px-4 py-3 text-sm text-muted shadow-ticket">
              No releases yet.
            </li>
          ) : (
            data.releases.map((rel) => {
              const current = rel.tag === data.currentVersion;
              return (
                <li
                  key={rel.tag}
                  className="flex flex-wrap items-center gap-3 rounded-lg bg-surface px-4 py-3 shadow-ticket"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold text-ink">{rel.tag}</p>
                    <p className="text-[12px] text-muted">
                      {formatWhen(rel.publishedAt)}
                      {rel.cached ? " · on this machine" : ""}
                      {current ? " · running" : ""}
                    </p>
                  </div>
                  {current ? (
                    <span className="font-mono text-[11px] tracking-wide text-filled uppercase">
                      Current
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!data.canApply || busy || !rel.hasImage}
                      onClick={() => setConfirm(rel)}
                    >
                      {rel.newer ? (
                        <>
                          <Download className="size-3.5" />
                          Update
                        </>
                      ) : (
                        <>
                          <ArrowDown className="size-3.5" />
                          Revert
                        </>
                      )}
                    </Button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </div>

      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm && confirm.tag === latest?.tag && confirm.newer
                ? `Update to ${confirm.tag}?`
                : `Switch to ${confirm?.tag}?`}
            </DialogTitle>
            <DialogDescription>
              Manual only — nothing installs itself. Tickets and logins stay. The board
              restarts for about 30 seconds. You can revert to an older version from this
              same list.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => confirm && go(confirm)}
              disabled={!confirm}
            >
              {confirm?.newer ? "Update" : "Revert"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
