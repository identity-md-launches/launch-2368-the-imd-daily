import { useState } from "react";
import { useData, useTick } from "../lib/store";
import { searchIssues, type Issue } from "../lib/issues";
import { editorialDate, isoDate, plural } from "../lib/format";
import { chainNow } from "../lib/chain";
import { latchClosed, windowState } from "../lib/mint";
import { MintPanel } from "../components/MintPanel";
import { Stale } from "../components/Stale";
import { Artwork } from "../components/Artwork";
import { DownloadLink } from "../components/DownloadLink";

const dateText = (i: Issue) => `${editorialDate(i.editorialDate, true)} ${isoDate(i.editorialDate)}`;

export function FrontPage({ archiveOnly = false }: { archiveOnly?: boolean }) {
  const { status, issues, summaries, error, reload } = useData();
  const [q, setQ] = useState("");
  const latest = issues[0];

  if (status === "loading") return <section className="loading-edition" aria-busy="true">
    <h2 className="h-section">The world of IMD.</h2>
    <p role="status">Reading the latest edition from Ethereum…</p>
    <p className="fine">Free to read. Yours to collect.</p>
  </section>;
  if (status === "error") return <section className="page-narrow">
    <h2 className="h-section">The archive could not be read</h2>
    <p>Ethereum did not answer: {error}</p>
    <button className="btn" onClick={reload}>Try again</button>
  </section>;

  const found = searchIssues(issues, q, summaries, dateText);
  const summary = latest && summaries[latest.pdfHash.toLowerCase()];
  return <>
    <Stale />
    {!archiveOnly && (latest ? <Lead issue={latest} /> : <EmptyFront />)}
    {issues.length > 0 && <div className={`below-lead${archiveOnly ? " archive-full" : ""}`}>
      <section className="archive" aria-labelledby="archive-h">
        <div className="archive-head">
          <div><h2 id="archive-h" className="h-section">The archive<span className="section-dot">.</span></h2>
            <p className="fine">A permanent place for every edition.</p></div>
          {!archiveOnly && <a className="text-link" href="#/archive">View all editions <span aria-hidden="true">↗</span></a>}
        </div>
        {archiveOnly && <div className="search">
          <label htmlFor="search">Search titles, summaries and dates</label>
          <input id="search" type="search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. October 2026" />
          <p className="fine" role="status">{q ? `${plural(BigInt(found.length), "edition matches", "editions match")}.` : "Scanned pages are not searched as text."}</p>
        </div>}
        <ol className="edition-shelf">{found.map(i => <ArchiveEdition key={i.id.toString()} issue={i} />)}</ol>
      </section>
      {!archiveOnly && summary && <section className="editorial-summary" aria-labelledby="summary-h">
        <p className="summary-label">Inside the current edition</p>
        <h2 id="summary-h" className="h-section">From the editor’s desk<span className="section-dot">.</span></h2>
        <p className="summary">{summary}</p>
        <a className="text-link" href={`#/issue/${latest.id}`}>Edition details <span aria-hidden="true">↗</span></a>
      </section>}
    </div>}
    {archiveOnly && issues.length === 0 && <EmptyFront />}
  </>;
}

function EmptyFront() {
  return <section className="empty-newsroom" aria-labelledby="empty-h">
    <div><p className="press-label">Independent community press</p>
      <h2 id="empty-h" className="h-lead">The first edition is still on the press.</h2>
      <p>No issue has been published on chain yet. Its real front page will appear here when it is ready.</p>
      <a className="btn" href="#/about">About the paper</a></div>
    <Artwork name="reporter" eager />
  </section>;
}

function Lead({ issue }: { issue: Issue }) {
  useTick();
  const state = latchClosed(issue.id, windowState(chainNow(), issue.publishedAt, issue.closesAt));
  return <>
    <section className="newsroom-lead" aria-label="Latest edition">
      <div className="newsroom-intro">
        <div className="intro-copy"><p className="press-label">Independent community press</p>
          <h2 className="intro-title">The world of IMD.<br /><span>One edition<br className="intro-break" /> at a time.</span></h2>
          <p className="intro-deck">Free to read. Yours to collect.</p></div>
        <Artwork name="reporter" className="reporter-art" eager />
        <span className="intro-caption">Reporting from the world of IMD.</span>
      </div>
      <article className="current-edition">
        <div className="cover-caption"><span><span className={`status-dot ${state === "open" ? "is-open" : ""}`} />Latest edition</span><a href={`#/issue/${issue.id}`} className="num">No. {issue.id.toString()} <span aria-hidden="true">↗</span></a></div>
        <a className="edition-cover" href={`#/read/${issue.id}`} aria-label={`Read ${issue.title}`}>
          <img src={issue.coverURL} alt={`Real front page of No. ${issue.id}, ${issue.title}`} fetchPriority="high" />
        </a>
        <div className="read-actions">
          <a className="btn btn-read" href={`#/read/${issue.id}`}>Read the edition <span aria-hidden="true">↗</span></a>
          <DownloadLink className="btn btn-download" url={issue.pdfURL} filename={`imd-daily-${issue.id}.pdf`}>Download PDF <span aria-hidden="true">↓</span></DownloadLink>
        </div>
      </article>
      <MintPanel issue={issue} />
    </section>
    <div className="metadata-strip num" aria-label="Edition information">
      <span>Issue <strong>No. {issue.id.toString()}</strong></span>
      <time dateTime={isoDate(issue.editorialDate)}>{editorialDate(issue.editorialDate, true)}</time>
      <span>Free PDF reading</span>
      <span className={state === "open" ? "accent" : ""}><span className={`status-dot ${state === "open" ? "is-open" : ""}`} />{state === "open" ? "Open edition" : state === "closed" ? "Closed" : "Awaiting publication"}</span>
    </div>
  </>;
}

function ArchiveEdition({ issue }: { issue: Issue }) {
  useTick(10000);
  const state = latchClosed(issue.id, windowState(chainNow(), issue.publishedAt, issue.closesAt));
  return <li className="archive-edition">
    <a className="archive-cover" href={`#/read/${issue.id}`} aria-label={`Read ${issue.title}`}><img src={issue.coverURL} alt={`Cover of issue ${issue.id}`} loading="lazy" /></a>
    <div><p className="dateline num">No. {issue.id.toString()} · {state === "open" ? <span className="accent">Open edition</span> : "Closed"}</p>
      <h3 className="h-sub"><a href={`#/issue/${issue.id}`}>{editorialDate(issue.editorialDate)}</a></h3>
      <p className="fine">{issue.title}</p>
      <a className="text-link" href={`#/read/${issue.id}`}>Read edition <span aria-hidden="true">↗</span></a>
    </div>
  </li>;
}
