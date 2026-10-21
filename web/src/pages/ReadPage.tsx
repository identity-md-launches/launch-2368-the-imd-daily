import { useMemo } from "react";
import { useData } from "../lib/store";
import { Reader } from "../components/Reader";

/** #/read/<id>: the whole window is the reader. */
export function ReadPage({ id }: { id: string }) {
  const { status, issues } = useData();
  const issue = /^\d+$/.test(id) ? issues.find((i) => i.id === BigInt(id)) : undefined;
  const source = useMemo(() => (issue ? { url: issue.pdfURL } : null), [issue?.pdfURL]);
  if (status === "loading") return <p className="status-line on-dark" role="status">Finding issue {id}…</p>;
  if (!issue || !source)
    return <p className="status-line on-dark">No issue {id} on chain. <a href="#/archive">Open the archive</a></p>;
  return (
    <main id="main" className="read-page">
      <h1 className="sr-only">{issue.title}</h1>
      <Reader source={source} title={`No. ${issue.id} · ${issue.title}`} downloadUrl={issue.pdfURL}
        downloadName={`imd-daily-${issue.id}.pdf`} onClose={() => { location.hash = `#/issue/${issue.id}`; }} />
    </main>
  );
}
