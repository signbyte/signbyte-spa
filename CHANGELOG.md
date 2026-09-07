# Changelog

Notable changes to this application, newest first, per release. This file is written for whoever
deploys the portal or integrates against it.

## v0.2.0

**A signing a document system prepared now says who asked, and offers the way back.** When an
envelope carries an origin — set by the platform's integration API, never by the portal itself — the
document hub's Details card leads with *Requested by <name>*, and after the person signs, the
completion screen's primary action is *Return to <name>*; the report and download step down to the
outlined row. The same button appears on the hub once the person's part is over — signed or declined,
or the request cancelled — so a decline has a way back too. The browser goes to the return address
stored with the envelope (this signer's own, else the requester's default), with `signingRequest` (the
id of the signing request — the envelope the portal was showing), `slot` and `outcome` (`signed` ·
`declined` · `cancelled`, the person's own act) appended to whatever the address already carries — the
portal sets these three itself, so a stale value in the stored address never wins; anything not `https` is never offered. An envelope started in the portal shows none of this.

**A signing link may name the language.** `/envelopes/{id}?lang=lv` (or `en`) opens the portal in that
language and remembers the choice like a manual switch; an unknown value is ignored and the link still
opens. Nothing to configure.

## v0.1.0

Initial code.

The signing portal's web interface as first released: sign in with a national electronic
identity, upload documents, build signing envelopes, sign with the supported eID methods, and
validate and download the results — a Vue single-page application served as a static bundle in
front of the portal's Backend-for-Frontend. AGPL-3.0-only.
