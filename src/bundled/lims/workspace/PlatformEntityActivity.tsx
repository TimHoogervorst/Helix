import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get } from "../../../shell/src/api/client";
import type { RecordActivity, RecordPage } from "../../../mod-api/src/records";
import { Button } from "../../../shell/src/shared/primitives/Button";

/** Platform records keep their activity under the record identity, not a LIMS row ID. */
export default function PlatformEntityActivity({ recordId }: { recordId: string }) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<RecordActivity[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    get<RecordPage<RecordActivity>>(`/records/${encodeURIComponent(recordId)}/actions/?page=${page}`)
      .then((result) => {
        if (cancelled) return;
        setItems((previous) => page === 1 ? result.results : [...previous, ...result.results]);
        setNext(result.next);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recordId, page, retry]);

  return <div className="space-y-3 text-sm">
    {items.map((item) => <div key={item.id}>
      <p>{item.descriptions.join(" ") || item.action}</p>
      <time className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</time>
    </div>)}
    {loading && <p role="status">Loading activity…</p>}
    {error && <div role="alert">Could not load activity. <Button variant="ghost" onClick={() => setRetry((value) => value + 1)}>Retry</Button></div>}
    {!loading && !error && !items.length && <p className="text-muted-foreground">No activity yet.</p>}
    {!loading && !error && next && <Button variant="ghost" onClick={() => setPage(next)}>Load more</Button>}
    <Link className="text-primary underline" to={`/records/${encodeURIComponent(recordId)}`}>Record history</Link>
  </div>;
}
