import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { getAdminSettings, getMyProfile, saveBcConnection, saveBranding, probeBc } from "@/lib/mesh/api";
import { BRAND_PRESETS, brandingToCssVars, DEFAULT_BRANDING } from "@/lib/mesh/brand";
import type { BcCompany, BcConnectionPublic, Branding } from "@/lib/mesh/types";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MeshWordmark } from "./mark";
import { PeopleAdmin } from "./team-panel";
import { BcPartSearch } from "./bc-tickets";
import { useBrand } from "./brand-context";
import { UpdatesPanel } from "./updates-panel";
import { isOwner, isStaff } from "@/lib/mesh/roles";

type AdminTab = "people" | "look" | "central" | "updates";

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("people");
  const profile = useQuery({
    queryKey: ["mesh-profile"],
    queryFn: () => getMyProfile(),
  });
  const settings = useQuery({
    queryKey: ["mesh-admin"],
    queryFn: () => getAdminSettings(),
    enabled: isStaff(profile.data?.role),
  });

  const mine = profile.data;

  if (profile.isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-16">
        <div className="h-11 rounded-md bg-bg-deep/80" />
        <div className="mt-4 h-40 rounded-lg bg-surface shadow-ticket" />
      </div>
    );
  }

  if (!mine || !isStaff(mine.role) || mine.accessStatus !== "approved") {
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Owner and managers</h1>
        <p className="mt-2 text-sm text-muted">
          Accounts, branding, and Business Central sit behind an owner or manager login.
        </p>
        <Button asChild className="mt-6 w-fit">
          <Link to="/">Back to the board</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-16">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-ink">
            <MeshWordmark compact />
          </Link>
          <span className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
            Admin
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <ArrowLeft className="size-3.5" />
                Board
              </Link>
            </Button>
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6">
        <div className="flex h-11 w-full max-w-lg rounded-md bg-surface-2 p-1 shadow-[0_0_0_1px_var(--color-line)]">
          {(
            [
              ["people", "People"],
              ["look", "Look"],
              ["central", "Central"],
              ...(isOwner(mine.role) ? ([["updates", "Updates"]] as const) : []),
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "h-full flex-1 rounded-sm font-mono text-[12px] tracking-wide uppercase",
                tab === value ? "bg-ink text-primary-fg" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "people" ? <PeopleAdmin myId={mine.userId} myRole={mine.role} /> : null}
          {tab === "look" ? (
            <LookAdmin
              initial={settings.data?.branding}
              signupOpen={settings.data?.signupOpen ?? true}
              loading={settings.isPending}
            />
          ) : null}
          {tab === "central" ? (
            <CentralAdmin initial={settings.data?.bc} loading={settings.isPending} />
          ) : null}
          {tab === "updates" && isOwner(mine.role) ? <UpdatesPanel /> : null}
        </div>
      </div>
    </div>
  );
}

function LookAdmin({
  initial,
  signupOpen: initialSignup,
  loading,
}: {
  initial?: Branding;
  signupOpen: boolean;
  loading: boolean;
}) {
  const qc = useQueryClient();
  const live = useBrand();
  const seed = initial ?? live;
  const [companyName, setCompanyName] = useState(seed.companyName);
  const [tagline, setTagline] = useState(seed.tagline);
  const [logoData, setLogoData] = useState(seed.logoData);
  const [paper, setPaper] = useState(seed.paper);
  const [ink, setInk] = useState(seed.ink);
  const [accent, setAccent] = useState(seed.accent);
  const [signupOpen, setSignupOpen] = useState(initialSignup);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initial) return;
    setCompanyName(initial.companyName);
    setTagline(initial.tagline);
    setLogoData(initial.logoData);
    setPaper(initial.paper);
    setInk(initial.ink);
    setAccent(initial.accent);
  }, [initial]);

  useEffect(() => {
    setSignupOpen(initialSignup);
  }, [initialSignup]);

  const draft: Branding = useMemo(
    () => ({ companyName, tagline, logoData, paper, ink, accent }),
    [companyName, tagline, logoData, paper, ink, accent],
  );

  const save = useMutation({
    mutationFn: () =>
      saveBranding({
        data: { ...draft, signupOpen },
      }),
    onSuccess: async (brand) => {
      qc.setQueryData(["mesh-brand"], brand);
      await qc.invalidateQueries({ queryKey: ["mesh-admin"] });
      toast("Look saved — this is what the desk sees.");
    },
    onError: (err: Error) => setError(err.message || "Could not save."),
  });

  function onLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Use a PNG, SVG, or JPG.");
      return;
    }
    if (file.size > 250_000) {
      setError("Keep the mark under 250 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoData(String(reader.result ?? ""));
      setError("");
    };
    reader.readAsDataURL(file);
  }

  if (loading && !initial) {
    return <p className="text-sm text-muted">Loading look…</p>;
  }

  return (
    <form
      className="grid gap-8 lg:grid-cols-[1fr_18rem]"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        setError("");
        save.mutate();
      }}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Name, mark, and colors for this install. Sell Requestick to another shop by
          giving them their own copy — they set this screen themselves.
        </p>
        <Field label="Company name" htmlFor="brand-name">
          <Input
            id="brand-name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            minLength={2}
          />
        </Field>
        <Field label="Tagline" htmlFor="brand-tag">
          <Input
            id="brand-tag"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Request Ticket Tracker"
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-logo">Mark</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="brand-logo"
              type="file"
              accept="image/*"
              onChange={(e) => onLogo(e.target.files?.[0])}
            />
            {logoData ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setLogoData("")}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        <div>
          <Label>Palette</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {BRAND_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPaper(p.paper);
                  setInk(p.ink);
                  setAccent(p.accent);
                }}
                className="h-11 rounded-md bg-surface-2 px-3 font-mono text-[12px] tracking-wide text-ink uppercase shadow-[0_0_0_1px_var(--color-line)]"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ColorField label="Paper" value={paper} onChange={setPaper} />
          <ColorField label="Ink" value={ink} onChange={setInk} />
          <ColorField label="Accent" value={accent} onChange={setAccent} />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg bg-surface-2 px-4 py-3 shadow-[0_0_0_1px_var(--color-line)]">
          <div>
            <p className="text-sm font-medium text-ink">Open signup</p>
            <p className="text-sm text-muted">
              Off: only admins add people. On: staff can request a login.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={signupOpen}
            onClick={() => setSignupOpen(!signupOpen)}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150",
              signupOpen ? "bg-filled" : "bg-line-strong",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 size-6 rounded-full bg-surface-2 transition-transform duration-150",
                signupOpen && "translate-x-5",
              )}
            />
          </button>
        </div>
        {error ? <p className="text-sm text-hot">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save look"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const d = DEFAULT_BRANDING;
              setCompanyName(d.companyName);
              setTagline(d.tagline);
              setLogoData("");
              setPaper(d.paper);
              setInk(d.ink);
              setAccent(d.accent);
            }}
          >
            Reset to Requestick
          </Button>
        </div>
      </div>
      <LookPreview brand={draft} />
    </form>
  );
}

function LookPreview({ brand }: { brand: Branding }) {
  const vars = brandingToCssVars(brand);
  return (
    <aside
      className="h-fit rounded-xl p-4 shadow-ticket"
      style={{
        ...(vars as CSSProperties),
        background: vars["--color-surface"],
        color: vars["--color-ink"],
      }}
    >
      <p
        className="font-mono text-[11px] tracking-[0.16em] uppercase"
        style={{ color: vars["--color-muted"] }}
      >
        Preview
      </p>
      <div className="mt-3 flex items-center gap-2.5">
        {brand.logoData ? (
          <img src={brand.logoData} alt="" className="size-8 rounded-md object-contain" />
        ) : (
          <span
            className="grid size-8 place-items-center rounded-md font-mono text-[11px] font-semibold"
            style={{
              background: vars["--color-ink"],
              color: vars["--color-primary-fg"],
            }}
          >
            {(brand.companyName || "M").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <p className="text-[17px] font-semibold tracking-tight">{brand.companyName || "Company"}</p>
          <p
            className="font-mono text-[10px] tracking-[0.18em] uppercase"
            style={{ color: vars["--color-muted"] }}
          >
            {brand.tagline || "Request Ticket Tracker"}
          </p>
        </div>
      </div>
      <div
        className="mt-4 rounded-lg p-3"
        style={{
          background: vars["--color-surface-2"],
          boxShadow: `0 0 0 1px ${vars["--color-line"]}`,
        }}
      >
        <p className="font-mono text-sm font-semibold">44192-BLK</p>
        <p className="mt-0.5 text-sm" style={{ color: vars["--color-ink-soft"] }}>
          Sample need on the desk
        </p>
        <button
          type="button"
          className="mt-3 h-9 rounded-md px-3 font-mono text-[12px] uppercase"
          style={{
            background: vars["--color-primary"],
            color: vars["--color-primary-fg"],
          }}
        >
          On it
        </button>
      </div>
    </aside>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-11 shrink-0 cursor-pointer rounded-md bg-surface-2 p-1 shadow-[0_0_0_1px_var(--color-line)]"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono uppercase"
        />
      </div>
    </div>
  );
}

function CentralAdmin({
  initial,
  loading,
}: {
  initial?: BcConnectionPublic;
  loading: boolean;
}) {
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState(initial?.tenantId ?? "");
  const [environment, setEnvironment] = useState(initial?.environment ?? "Production");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [basicUser, setBasicUser] = useState(initial?.basicUser ?? "");
  const [basicPassword, setBasicPassword] = useState("");
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [companies, setCompanies] = useState<BcCompany[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initial) return;
    setTenantId(initial.tenantId);
    setEnvironment(initial.environment || "Production");
    setClientId(initial.clientId);
    setBaseUrl(initial.baseUrl);
    setBasicUser(initial.basicUser);
    setCompanyId(initial.companyId);
    setCompanyName(initial.companyName);
  }, [initial]);

  const payload = {
    tenantId,
    environment,
    companyId,
    companyName,
    clientId,
    clientSecret,
    baseUrl,
    basicUser,
    basicPassword,
  };

  const probe = useMutation({
    mutationFn: () => probeBc({ data: payload }),
    onSuccess: (rows) => {
      setCompanies(rows);
      setError("");
      if (rows.length === 1) {
        setCompanyId(rows[0].id);
        setCompanyName(rows[0].name);
      }
      toast(`Found ${rows.length} ${rows.length === 1 ? "company" : "companies"}`);
    },
    onError: (err: Error) => setError(err.message || "Could not reach Business Central."),
  });

  const save = useMutation({
    mutationFn: () => saveBcConnection({ data: payload }),
    onSuccess: async (settings) => {
      qc.setQueryData(["mesh-admin"], settings);
      await qc.invalidateQueries({ queryKey: ["mesh"] });
      toast("Business Central saved");
    },
    onError: (err: Error) => setError(err.message || "Could not save."),
  });

  const disconnect = useMutation({
    mutationFn: () => saveBcConnection({ data: { ...payload, clear: true } }),
    onSuccess: async (settings) => {
      qc.setQueryData(["mesh-admin"], settings);
      await qc.invalidateQueries({ queryKey: ["mesh"] });
      setTenantId("");
      setClientId("");
      setClientSecret("");
      setBaseUrl("");
      setBasicUser("");
      setBasicPassword("");
      setCompanyId("");
      setCompanyName("");
      setCompanies([]);
      toast("Disconnected");
    },
    onError: (err: Error) => setError(err.message || "Could not disconnect."),
  });

  if (loading && !initial) {
    return <p className="text-sm text-muted">Loading connection…</p>;
  }

  return (
    <div className="flex flex-col gap-10">
      {initial?.connected ? (
        <div className="flex min-h-0 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">Part search</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            No ticket needed. Open sales orders for one part number — order,
            salesperson code, status. The list scrolls.
          </p>
          <div className="flex h-[min(70vh,36rem)] flex-col rounded-xl bg-surface p-4 shadow-ticket">
            <BcPartSearch />
          </div>
        </div>
      ) : null}

      <form
        className="flex max-w-xl flex-col gap-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setError("");
          save.mutate();
        }}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Business Central</h2>
            <span className="rounded-sm bg-later-bg px-1.5 font-mono text-[11px] font-medium tracking-wider text-later uppercase">
              Read only
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Requestick only looks up open sales orders for a part number you
            type. It never dumps the whole company, and it never writes back.
            You still need an Entra / BC admin to mint the app — a sales login
            is not enough.
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-soft">
            <li>
              Cloud: Entra app registration + client secret. Under API permissions
              add <span className="font-medium text-ink">only</span>{" "}
              <span className="font-mono text-[12px]">API.Read.All</span> on
              Dynamics 365 Business Central (Application, not Delegated). Grant
              admin consent. Do{" "}
              <span className="font-medium text-ink">not</span> add{" "}
              <span className="font-mono text-[12px]">API.ReadWrite.All</span>.
            </li>
            <li>
              Paste Tenant ID, environment (usually Production), Application
              (client) ID, and the secret. Test & list companies, pick the company,
              Save.
            </li>
            <li>
              On-prem: skip SaaS fields. Use the API base URL and a BC user whose
              permission set is read-only (no insert/modify on sales documents).
            </li>
          </ol>
        </div>
        <Field label="Tenant ID (SaaS)" htmlFor="bc-tenant">
          <Input
            id="bc-tenant"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="font-mono"
          />
        </Field>
        <Field label="Environment" htmlFor="bc-env">
          <Input
            id="bc-env"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            placeholder="Production"
          />
        </Field>
        <Field label="Application (client) ID" htmlFor="bc-client">
          <Input
            id="bc-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field
          label={initial?.hasSecret ? "Client secret (leave blank to keep)" : "Client secret"}
          htmlFor="bc-secret"
        >
          <Input
            id="bc-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <div className="h-px bg-line" />
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
          On-prem (optional)
        </p>
        <Field label="API base URL" htmlFor="bc-url">
          <Input
            id="bc-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://bc.company.com:7048/bc/api/v2.0"
            className="font-mono"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Basic user" htmlFor="bc-user">
            <Input
              id="bc-user"
              value={basicUser}
              onChange={(e) => setBasicUser(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field
            label={initial?.hasBasicPassword ? "Password (keep if blank)" : "Password"}
            htmlFor="bc-pass"
          >
            <Input
              id="bc-pass"
              type="password"
              value={basicPassword}
              onChange={(e) => setBasicPassword(e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>
        {companies.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bc-company">Company</Label>
            <select
              id="bc-company"
              value={companyId}
              onChange={(e) => {
                const id = e.target.value;
                setCompanyId(id);
                setCompanyName(companies.find((c) => c.id === id)?.name ?? "");
              }}
              className="h-11 rounded-md bg-surface-2 px-3 text-sm text-ink shadow-[0_0_0_1px_var(--color-line)]"
            >
              <option value="">Select a company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : companyName ? (
          <p className="text-sm text-muted">
            Company: <span className="text-ink">{companyName}</span>
          </p>
        ) : null}
        {error ? <p className="text-sm text-hot">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={probe.isPending}
            onClick={() => {
              setError("");
              probe.mutate();
            }}
          >
            {probe.isPending ? "Testing…" : "Test & list companies"}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save connection"}
          </Button>
          {initial?.connected || initial?.hasSecret || initial?.hasBasicPassword ? (
            <Button
              type="button"
              variant="ghost"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
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
