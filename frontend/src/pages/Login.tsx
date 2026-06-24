import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { post } from "../api/client";

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const data = await post<{ token: string }>("/core/auth/login/", {
        username,
        password,
      });
      localStorage.setItem("auth_token", data.token);
      navigate("/eln");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto" }}>
      <h1>Login</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1rem" }}>
          <label>
            Username:
            <br />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{ width: "100%", padding: "0.5rem", fontSize: "1rem" }}
            />
          </label>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label>
            Password:
            <br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", padding: "0.5rem", fontSize: "1rem" }}
            />
          </label>
        </div>
        <button type="submit" disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}

export default Login;
