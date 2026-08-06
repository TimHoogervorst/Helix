import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Dna } from "lucide-react";
import { register } from "../../../shell/src/user/api";
import { Button, Input } from "../../../shell/src/shared/primitives";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await register(username, email, password);
      // Hard redirect so CurrentUserProvider re-mounts and fetches the user
      window.location.href = "/library";
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "status" in err &&
        (err as { status: number }).status === 403
      ) {
        setError("Self-registration is currently disabled.");
      } else if (
        err instanceof Error &&
        "status" in err &&
        (err as { status: number }).status === 400
      ) {
        setError("Invalid input. Please check your username and password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-panel p-8">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <Dna className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="font-[--font-label] text-xl font-semibold tracking-tight">
            Helix
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Create a new account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Username</span>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              autoFocus
              minLength={3}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Password</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <Button
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>

          <p className="text-center text-[13px] text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
