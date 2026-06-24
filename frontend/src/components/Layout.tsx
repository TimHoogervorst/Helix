import { Link, Outlet, useNavigate } from "react-router-dom";

function Layout() {
  const navigate = useNavigate();
  const token = localStorage.getItem("auth_token");

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    navigate("/login");
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "1rem" }}>
      <nav
        style={{
          display: "flex",
          gap: "1rem",
          padding: "0.5rem 0",
          borderBottom: "1px solid #ddd",
          marginBottom: "1.5rem",
          alignItems: "center",
        }}
      >
        <Link to="/eln" style={{ fontWeight: "bold", textDecoration: "none" }}>
          OpenScience
        </Link>
        <Link to="/eln">Notebook</Link>
        {token ? (
          <button onClick={handleLogout} style={{ marginLeft: "auto" }}>
            Logout
          </button>
        ) : (
          <Link to="/login" style={{ marginLeft: "auto" }}>
            Login
          </Link>
        )}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
