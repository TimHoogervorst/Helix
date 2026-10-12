import { useParams } from "react-router-dom";
import ElnWorkspace from "./ElnWorkspace";

/** Page wrapper for the ELN workspace — extracts the entry ID from the route
 *  and renders the full editor + metadata panel. */
function ElnWorkspacePage() {
  const { displayId, id } = useParams<{ displayId?: string; id?: string }>();
  return <ElnWorkspace entryId={displayId ?? id} />;
}

export default ElnWorkspacePage;
