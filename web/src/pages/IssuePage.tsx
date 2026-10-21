import { useData } from "../lib/store";
import { addressUrl, DAILY, txUrl, tokenUrl } from "../config";
import { dateTime, editorialDate } from "../lib/format";
import { MintPanel } from "../components/MintPanel";
import { Stale } from "../components/Stale";

/** Permalink for one issue: #/issue/<id>. */
export function IssuePage({ id }: { id: string }) {
  const { status, issues, summaries, publications } = useData();
  if (status === "loading") return <p className="status-line" role="status">Reading issue {id} from Ethereum…</p>;
  const issue = /^\d+$/.test(id) ? issues.find((i) => i.id === BigInt(id)) : undefined;
  if (!issue)
    return (
      <section className="page-narrow">
        <h2 className="h-section">No issue {id} on chain</h2>
        <p>The contract has {issues.length} published {issues.length === 1 ? "issue" : "issues"}. <a href="#/archive">Open the archive</a></p>
      </section>
    );
  const pub = publications[issue.id.toString()];
  const summary = summaries[issue.pdfHash.toLowerCase()];
  return (
    <article className="lead issue-page" aria-labelledby="issue-h">
      <Stale />
      <a className="lead-cover" href={`#/read/${issue.id}`} aria-label={`Read ${issue.title}`}>
        <img src={issue.coverURL} alt={`Front page of No. ${issue.id}, ${issue.title}`} />
      </a>
      <div className="lead-text">
        <p className="dateline num">No. {issue.id.toString()} · {editorialDate(issue.editorialDate, true)}</p>
        <h2 id="issue-h" className="h-lead">{issue.title}</h2>
        {summary && <p className="deck">{summary}</p>}
        <p className="read-actions">
          <a className="btn btn-primary" href={`#/read/${issue.id}`}>Read the edition</a>
          <a className="btn" href={issue.pdfURL} target="_blank" rel="noopener" download>Download PDF</a>
        </p>
        <MintPanel issue={issue} />
        <h3 className="h-sub">Record</h3>
        <dl className="record num">
          <dt>Published</dt><dd>{dateTime(issue.publishedAt)}{pub && <> · <a href={txUrl(pub.txHash)} target="_blank" rel="noopener">publication transaction</a></>}</dd>
          <dt>Window closes</dt><dd>{dateTime(issue.closesAt)}</dd>
          <dt>Token</dt><dd><a href={tokenUrl(issue.id)} target="_blank" rel="noopener">ERC-1155 id {issue.id.toString()}</a> on <a href={addressUrl(DAILY)} target="_blank" rel="noopener">IMDDaily</a></dd>
          <dt>PDF SHA-256</dt><dd className="hash">{issue.pdfHash}</dd>
          <dt>Cover SHA-256</dt><dd className="hash">{issue.coverHash}</dd>
          <dt>Metadata</dt><dd className="hash"><a href={issue.metadataURI} target="_blank" rel="noopener">{issue.metadataURI}</a></dd>
        </dl>
      </div>
    </article>
  );
}
