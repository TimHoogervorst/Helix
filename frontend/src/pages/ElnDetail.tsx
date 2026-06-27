import { useParams } from "react-router-dom";
import ElnEditor from "../components/ElnEditor";
import ConsoleWorkspacePanel from "../console/core/ConsoleWorkspacePanel";

function ElnDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="page">
      <ConsoleWorkspacePanel backUrl={`/library?select=${id}`}>
        <ElnEditor entryId={id} />
      </ConsoleWorkspacePanel>
    </div>
  );
}

export default ElnDetail;
