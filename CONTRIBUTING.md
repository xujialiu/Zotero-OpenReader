# Contributing to Zotero-OpenReader

Bug reports and ideas are welcome as
[issues](https://github.com/xujialiu/Zotero-OpenReader/issues). Code is
welcome as a pull request, on the terms below.

## Why a contribution needs terms

Zotero-OpenReader is free software under the GNU Affero General Public
License, version 3 (AGPL-3.0). Part of its code, the providers that turn text
into speech and the WebDAV client, is also copied into
[OpenReader](https://github.com/xujialiu/OpenReader), the author's reading app
for phones and tablets. He distributes that app on Apple's App Store, where
reading aloud is a paid purchase that supports the development of both.

Apple's terms limit what a person may do with a copy from the store, and
AGPL-3.0 does not let a distributor add limits. The author can ship there all
the same, because the code is his own and an owner is not bound by his own
license. Code that someone else owns needs that person's permission, and
AGPL-3.0 alone does not give it.

So each contribution comes with two licenses: one to everyone, and a wider one
to the author.

A few files of the plugin are copied from Zotero itself and keep Zotero's
copyright notice and its license. They never go into the app, and these terms
reach only what you write, not what was there before.

## In short

- You keep the copyright in what you contribute, and you can go on using it in
  any way you like.
- Everyone receives your contribution under AGPL-3.0, like the rest of
  Zotero-OpenReader.
- Xujia Liu also receives a license to distribute it under other terms. That
  covers the OpenReader app's App Store copy and its paid purchase, other app
  stores, and licensing Zotero-OpenReader to others under a different license.

This summary is not the terms. The terms are the section below.

## Contribution terms

These terms follow the Apache Software Foundation's Individual Contributor
License Agreement, version 2.2, with two changes: everyone receives a
Contribution under AGPL-3.0, and the wider copyright license goes to the
Maintainer alone. They are the terms on which OpenReader accepts
contributions, with the name of the Work changed.

You accept and agree to the following terms for the Contributions You submit
to Zotero-OpenReader. Except for the licenses granted here, You reserve all
right, title and interest in and to Your Contributions.

1. **Definitions.** "You" (or "Your") means the copyright owner, or the legal
   entity authorized by the copyright owner, that is making a Contribution.
   For legal entities, the entity making a Contribution and all other entities
   that control, are controlled by, or are under common control with that
   entity are considered to be a single contributor. For the purposes of this
   definition, "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or otherwise,
   or (ii) ownership of fifty percent (50%) or more of the outstanding shares,
   or (iii) beneficial ownership of such entity. "The Maintainer" means Xujia
   Liu, the author of Zotero-OpenReader. "The Work" means Zotero-OpenReader,
   the software in this repository. "Contribution" means any original work of
   authorship, including any modification of or addition to an existing work,
   that You intentionally submit to the Maintainer for inclusion in, or
   documentation of, the Work. "Submit" means any form of electronic, verbal
   or written communication sent to the Maintainer, including a pull request,
   a patch, and a comment in the Work's issue tracker, but excluding
   communication that You conspicuously mark as "Not a Contribution".

2. **License to everyone.** You license each of Your Contributions to everyone
   under the GNU Affero General Public License, version 3, the license in the
   Work's `LICENSE` file.

3. **Copyright license to the Maintainer.** You grant the Maintainer a
   perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare derivative works of, publicly
   display, publicly perform, sublicense and distribute Your Contributions and
   such derivative works, under any license terms. This includes distributing
   them through app stores under the stores' own terms, in copies offered for
   a fee, and under licenses other than the one in clause 2.

4. **Patent license.** You grant the Maintainer and recipients of software
   distributed by the Maintainer a perpetual, worldwide, non-exclusive,
   no-charge, royalty-free, irrevocable (except as stated in this clause)
   patent license to make, have made, use, offer to sell, sell, import and
   otherwise transfer the Work, where such license applies only to those
   patent claims licensable by You that are necessarily infringed by Your
   Contribution alone or by combination of Your Contribution with the Work to
   which it was submitted. If any entity institutes patent litigation against
   You or any other entity (including a cross-claim or counterclaim in a
   lawsuit) alleging that Your Contribution, or the Work to which You have
   contributed, constitutes direct or contributory patent infringement, then
   any patent licenses granted to that entity under these terms for that
   Contribution or Work terminate as of the date such litigation is filed.

5. **Your right to contribute.** You represent that You are legally entitled
   to grant the licenses above. If Your employer has rights to intellectual
   property that You create and that includes Your Contributions, You
   represent that You have received permission to make Contributions on
   behalf of that employer, or that Your employer has waived such rights for
   Your Contributions to the Work.

6. **Original work.** You represent that each of Your Contributions is Your
   original creation, and that Your submission includes complete details of
   any third-party license or other restriction (including, but not limited
   to, related patents and trademarks) of which You are personally aware and
   which is associated with any part of Your Contributions. Should You wish to
   submit work that is not Your original creation, You may submit it
   separately from any Contribution, identifying the complete details of its
   source and of any license or other restriction of which You are personally
   aware, and conspicuously marking the work as "Submitted on behalf of a
   third party: [named here]".

7. **No support, no warranty.** You are not expected to provide support for
   Your Contributions, except to the extent You desire to provide support. You
   may provide support for free, for a fee, or not at all. Unless required by
   applicable law or agreed to in writing, You provide Your Contributions on
   an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
   express or implied, including, without limitation, any warranties or
   conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE.

8. **Changed facts.** You agree to notify the Maintainer of any facts or
   circumstances of which You become aware that would make these
   representations inaccurate in any respect.

## How to agree

A new pull request opens with a box under "Contribution terms". Tick it. The
pull request is then the record of your agreement, and a pull request is
merged only with the box ticked.

If part of the change is not your own work, name its source and its license in
the pull request, as clause 6 asks.

## Before you write code

- A feature, a bug fix or any larger change starts with an issue, so that the
  problem is agreed before a solution is written. A typo or a one-line fix can
  come straight as a pull request.
- `npm run build` writes `build/Zotero-OpenReader.xpi`, which Zotero installs
  from **Tools → Plugins → ⚙ → Install Plugin From File…**. The README's
  [Development](README.md#development) section has the other commands.
- `npm test` and `npm run typecheck` pass before a pull request is opened.
