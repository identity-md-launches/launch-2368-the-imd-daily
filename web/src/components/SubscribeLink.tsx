import type { ReactNode } from "react";
import { SUBSCRIBE_URL } from "../config";

/** Every subscription link: Paper Route's own site in a new tab. Nothing on this site is signed or paid. */
export function SubscribeLink({ className, children }: { className?: string; children: ReactNode }) {
  return <a className={className} href={SUBSCRIBE_URL} target="_blank" rel="noopener noreferrer">
    {children}<span className="sr-only"> (opens Paper Route in a new tab)</span>
  </a>;
}
