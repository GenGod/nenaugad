// The credit line a source's policy asks for beside its listings (S1-007: RemoteJobs.org's
// API page suggests "Powered by RemoteJobs.org"). It is the source's own attribution, so it
// is shown in its own words (English, marked as such), with the same rel as every other
// source link. No logo: no policy allows one. Renders nothing for a source without one.
export function SourceCredit({ credit }: {
  credit: Readonly<{ text: string; url: string }> | null | undefined;
}) {
  if (!credit) return null;
  return <p className="source">
    <a className="source-link" href={credit.url} rel="nofollow noreferrer" target="_blank" lang="en">{credit.text}</a>
  </p>;
}
