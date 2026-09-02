import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MeshMark } from "@/components/mesh/mark";
import { useBrand } from "@/components/mesh/brand-context";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const router = useRouter();
  const brand = useBrand();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "up") {
        const res = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email.split("@")[0] || "Sales",
        });
        if (res.error) throw new Error(res.error.message || "Could not create account.");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message || "Could not sign in.");
      }
      await router.invalidate();
      await router.navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center px-4 py-10">
      <Link to="/" className="mb-8 flex items-center gap-2.5 text-ink">
        <MeshMark />
        <span className="font-sans text-lg font-semibold tracking-tight">
          {brand.companyName}
        </span>
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "in" ? `Sign in to ${brand.companyName}` : "Request company access"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {brand.signupOpen
          ? "Sales desk only. After you sign up, an admin has to approve you before you can see the board."
          : "Sales desk only. Ask an admin to add your login from Admin → People."}
      </p>

      {authEnabled ? (
        <>
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3.5">
            {mode === "up" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-name">Name</Label>
                <Input
                  id="login-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="First name + last initial"
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                required
                minLength={8}
              />
            </div>
            {error ? <p className="text-sm text-hot">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
            </Button>
          </form>

          {brand.signupOpen ? (
            <button
              type="button"
              className="mt-3 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
              onClick={() => {
                setMode(mode === "in" ? "up" : "in");
                setError("");
              }}
            >
              {mode === "in" ? "Need an account? Create one" : "Already on Requestick? Sign in"}
            </button>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Open signup is off. An admin has to add you.
            </p>
          )}

          {import.meta.env.VITE_SELF_HOST === "true" ? null : (
            <>
              <div className="mt-8 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="font-mono text-[11px] tracking-wider text-faint uppercase">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <div className="mt-6 flex flex-col gap-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="outline"
                    onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                  >
                    Continue with {p.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="mt-8 text-sm text-muted">Sign-in is disabled.</p>
      )}
    </main>
  );
}
