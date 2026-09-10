# Changelog

Notable changes to this application, newest first, per release. This file is written for whoever
deploys the portal or integrates against it.

## v0.3.0

**The way back belongs to one signer.** *Return to <requester>* is shown only to a signer the requester
gave a return address of their own; a signer without one — an external party the requester invited to
co-sign, say — sees no return and is never sent to, or shown, the requester's system. Until now the
button fell back to a default address stored with the envelope, so an outside co-signer could be handed
the requester's location by omission. The requester decides per signer; the portal infers nothing from
the envelope. Behaviour for a signer with their own address is unchanged: the same button, the same
`signingRequest` · `slot` · `outcome` parameters.

**A co-signer is invited by a personal code and the country that issued it.** The identity-code field on
*Recipients & order* now has a country beside it — Latvia by default, the Baltic states first, then the rest
of the EU and EEA and the two countries recognised by agreement (Moldova, Ukraine). Type the code however it
is written — `050990-66731`, `05099066731`, or the qualified `PNOLV-050990-66731` a card or another system
produces — and on leaving the field it settles to one form; a code that names its own country moves the
dropdown to that country. Nobody types `PNO` any more, and the placeholder no longer suggests it.

The field also explains a code it cannot use, which the portal could not do before: a Latvian personal code
is eleven digits, so ten of them says so and names the count. And an **organisation's** code is refused
outright — `NTR…` is a trade-register number, and an organisation signs with its own e-seal rather than
being invited to a signing, so the field asks for the person's own code instead. Countries outside the
published trust lists are not offered at all: a signature made under one could not be validated here.

**Why this matters for an integrator:** the portal now sends `country` beside `identityRef` when it creates
an envelope or adds a slot, and the platform stores **one** spelling of an identity code, so the same person
invited by a bare code and arriving with a card that spells it `PNOLV-…` is one person rather than two. A
stored code is also displayed the way its own country writes it — a Latvian personal number as
`050990-66731`, and any other as the full code including its country and type, because a person, a foreign
namesake with the same digits and an organisation's register number must never render alike.

**"Back to document" works after a signing that authorised on the provider's page.** A co-signer who signed
with eParaksts Mobile, eID Scan or a remote credential pressed *Back to document* on the completion screen
and nothing happened — no navigation, no message. The platform returns the browser from those flows to an
address carrying only the signing job, so the document the screen had been opened with was no longer in the
URL, and the button was trying to reach a page it could not name. The destination is now resolved from the
envelope that was signed, and a cancel at the provider's page returns to the same place instead of leaving
the person on the signing screen. A signing with the card was never affected, because that flow never leaves
the page and keeps its address.

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
