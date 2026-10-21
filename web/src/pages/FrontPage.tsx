import { useState } from "react";
import { useData } from "../lib/store";
import { searchIssues, type Issue } from "../lib/issues";
import { editorialDate, isoDate, plural } from "../lib/format";
import { chainNow } from "../lib/chain";
import { latchClosed, windowState } from "../lib/mint";
import { MintPanel } from "../components/MintPanel";
import { Stale } from "../components/Stale";

const dateText = (i: Issue) => `${editorialDate(i.editorialDate, true)} ${isoDate(i.editorialDate)}`;

export function FrontPage({ archiveOnly = false }: { archiveOnly?: boolean }) {
  const { status, issues, summaries, error, reload } = useData();
  const [q, setQ] = useState("");
  const latest = issues[0];

  if (status === "loading")
    return <p className="status-line" role="status">Reading the latest edition from Ethereum…</p>;
  if (status === "error")
    return (
      <section className="page-narrow">
        <h2 className="h-section">The archive could not be read</h2>
        <p>Ethereum did not answer: {error}</p>
        <button className="btn" onClick={reload}>Try again</button>
      </section>
    );

  const found = searchIssues(archiveOnly ? issues : issues.slice(1), q, summaries, dateText);

  return (
    <>
      <Stale />
      {!archiveOnly && (latest ? <Lead issue={latest} summary={summaries[latest.pdfHash.toLowerCase()]} /> : <EmptyFront />)}
      {issues.length > (archiveOnly ? 0 : 1) && (
        <section className="archive" aria-labelledby="archive-h">
          <div className="archive-head">
            <h2 id="archive-h" className="h-section">{archiveOnly ? "Archive" : "Earlier editions"}</h2>
            <div className="search">
              <label htmlFor="search">Search titles, summaries and dates</label>
              <input id="search" type="search" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. October 2026" />
            </div>
          </div>
          <p className="fine" role="status">{q ? `${plural(BigInt(found.length), "edition matches", "editions match")}.` : "Scanned pages are not searched as text."}</p>
          <ol className="stack">
            {found.map((i) => <ArchiveRow key={i.id.toString()} issue={i} summary={summaries[i.pdfHash.toLowerCase()]} />)}
          </ol>
        </section>
      )}
      {archiveOnly && issues.length === 0 && <EmptyFront />}
    </>
  );
}

function EmptyFront() {
  return (
    <section className="lead lead-empty" aria-labelledby="empty-h">
      <div className="lead-cover cover-blank" aria-hidden="true"><span>No. 1</span></div>
      <div className="lead-text">
        <h2 id="empty-h" className="h-lead">The first edition is still on the press</h2>
        <p className="deck">No issue has been published on chain yet. When the publisher prints No. 1, its front page appears here, free to read, with a 24-hour window to collect a copy at 0.1 IMD.</p>
        <p className="fine">This page reads the contract directly; it shows no sample issues.</p>
        <p><a href="#/about">How The IMD Daily works</a></p>
      </div>
    </section>
  );
}

function Lead({ issue, summary }: { issue: Issue; summary?: string }) {
  return (
    <article className="lead" aria-labelledby="lead-h">
      <a className="lead-cover" href={`#/read/${issue.id}`} aria-label={`Read ${issue.title}`}>
        <img src={issue.coverURL} alt={`Front page of No. ${issue.id}, ${issue.title}`} />
      </a>
      <div className="lead-text">
        <p className="dateline num">No. {issue.id.toString()} · {editorialDate(issue.editorialDate, true)}</p>
        <h2 id="lead-h" className="h-lead"><a href={`#/issue/${issue.id}`}>{issue.title}</a></h2>
        {summary && <p className="deck">{summary}</p>}
        <p className="read-actions">
          <a className="btn btn-primary" href={`#/read/${issue.id}`}>Read the edition</a>
          <a className="btn" href={issue.pdfURL} target="_blank" rel="noopener" download>Download PDF</a>
        </p>
        <MintPanel issue={issue} />
      </div>
    </article>
  );
}

function ArchiveRow({ issue, summary }: { issue: Issue; summary?: string }) {
  const st = latchClosed(issue.id, windowState(chainNow(), issue.publishedAt, issue.closesAt));
  return (
    <li className="stack-row">
      <a href={`#/issue/${issue.id}`} className="stack-cover" tabIndex={-1} aria-hidden="true">
        <img src={issue.coverURL} alt="" loading="lazy" />
      </a>
      <div>
        <p className="dateline num">No. {issue.id.toString()} · {editorialDate(issue.editorialDate)} · {st === "open" ? <span className="accent">Collecting now</span> : "Closed"} · {plural(issue.supply, "copy", "copies")}</p>
        <h3 className="h-sub"><a href={`#/issue/${issue.id}`}>{issue.title}</a></h3>
        {summary && <p className="summary">{summary}</p>}
        <p className="row-links"><a href={`#/read/${issue.id}`}>Read No. {issue.id.toString()}</a> <a href={issue.pdfURL} target="_blank" rel="noopener">Download PDF</a></p>
      </div>
    </li>
  );
}
