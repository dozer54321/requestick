import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Phone, Search, ShieldCheck } from "lucide-react";
import { MeshWordmark } from "./mark";
import { useBranding } from "./brand-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const samples = [
  {
    pn: "44192-BLK",
    desc: "Glock 19 MOS, 9mm, black",
    ticket: "88421",
    who: "Mike R.",
    ext: "104",
    when: "2:14 PM",
    priority: "hot" as const,
    qty: 2,
  },
  {
    pn: "MAGPUL-PMAG-30",
    desc: "PMAG 30, gen M3, black",
    ticket: "88418",
    who: "Dana K.",
    ext: "112",
    when: "1:51 PM",
    priority: "today" as const,
    qty: 6,
  },
  {
    pn: "SPR-CAR-308",
    desc: "Carbine spring, 308",
    ticket: "88390",
    who: "Luis M.",
    ext: "107",
    when: "11:02 AM",
    priority: "later" as const,
    qty: 1,
  },
];

export function Landing() {
  const brand = useBranding();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <MeshWordmark />
        <Button asChild variant="outline" size="sm">
          <Link to="/login">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <section className="grid items-center gap-10 pt-4 pb-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-10">
          <div>
            <p className="font-mono text-[11px] tracking-[0.22em] text-muted uppercase">
              Inside sales · FFL to dealer
            </p>
            <h1 className="mt-3 max-w-xl text-[2.35rem] leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl">
              Dealer on the line and you need a gun or a part? Put it on Requestick.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-soft">
              Company-only board for the sales desk. Post the part number on an open
              ticket, ping the team, and skip the email chain. Admins add people,
              set the shop look, and can hook Business Central so you see who still
              has items on an open ticket.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/login">Sign in to {brand.companyName}</Link>
              </Button>
              <p className="text-sm text-muted">No Windows admin rights. Browser only.</p>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-xl bg-bg-deep/70" />
            <div className="flex flex-col gap-2.5">
              {samples.map((s, i) => (
                <article
                  key={s.pn}
                  className="mesh-rise rounded-lg bg-surface-2 p-4 shadow-ticket"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={s.priority}>{s.priority === "later" ? "When you can" : s.priority}</Badge>
                        <span className="font-mono text-[13px] font-medium tracking-wide text-muted">
                          Ticket {s.ticket}
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-lg font-semibold tracking-tight text-ink">
                        {s.pn}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-soft">{s.desc}</p>
                    </div>
                    <span className="font-mono text-xs text-faint tabular-nums">qty {s.qty}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
                    <span className="text-ink-soft">
                      {s.who} <span className="text-faint">· ext {s.ext}</span>
                    </span>
                    <span className="font-mono text-xs text-faint">{s.when}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            icon={<ShieldCheck className="size-4" />}
            title="Admin-gated"
            body="Outsiders can request a login. They see nothing until an admin approves them."
          />
          <Feature
            icon={<Bell className="size-4" />}
            title="Windows alerts"
            body="A toast and a ping when someone posts, grabs, or fills a part."
          />
          <Feature
            icon={<Phone className="size-4" />}
            title="Call or text"
            body="Ring Central extension and personal cell sit on the card. One click."
          />
          <Feature
            icon={<Search className="size-4" />}
            title="Date + part number"
            body="Grouped by the day it was posted, sorted by PN so you can scan fast."
          />
        </section>
      </main>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-[0_0_0_1px_var(--color-line)]">
      <div className="grid size-9 place-items-center rounded-md bg-bg-deep text-ink">{icon}</div>
      <h2 className="mt-3 text-sm font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
