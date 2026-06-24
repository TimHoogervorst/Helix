import { Link, Outlet } from "react-router-dom";

function Layout() {
  return (
    <>
      <nav>
        <Link to="/eln">OpenScience</Link>
        <Link to="/eln">Notebook</Link>
      </nav>
      <div className="page">
        <Outlet />
      </div>
    </>
  );
}

export default Layout;
