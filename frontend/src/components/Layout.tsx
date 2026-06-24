import { Link, Outlet } from "react-router-dom";

function Layout() {
  return (
    <>
      <nav>
        <Link to="/eln">OpenScience</Link>
        <Link to="/eln">Notebook</Link>
        <Link to="/lims">LIMS</Link>
        <div className="nav-spacer" />
        <Link to="/settings" className="nav-gear" title="Settings">
          ⚙️
        </Link>
      </nav>
      <div className="page">
        <Outlet />
      </div>
    </>
  );
}

export default Layout;
