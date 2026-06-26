import { useParams } from "react-router-dom";
import ElnEditor from "../components/ElnEditor";

function ElnDetail() {
  const { id } = useParams<{ id: string }>();
  return <ElnEditor entryId={id} />;
}

export default ElnDetail;
