# Decisions

Every significant decision in Facade is written down here, numbered in
the order it was taken, and says what trade-off was accepted rather than
only what was chosen. A decision is never rewritten once it is accepted:
a later one amends it and says so in both directions, so a reader who
arrives at the old number is told where the story continues.

This index is the way in. It is checked in, which means it has to be
re-read when an ADR is added. The number of the next one is the highest
here plus one.

ADR 0002 to 0009 came with the foundation from Makker and are the
family's decisions; each says so at the top. Facade's own are 0001 and
from 0010.

Where the product's own words live instead: **README.md** has the seven
dogmas in the family's voice, **CLAUDE.md** is the constitution every
session reads, and **TECH-DEBT.md** is what we know is not right yet.

| #                                                         | Decision                                                                                    | Relations |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| [0001](0001-foundation-from-makker.md)                    | Facade becomes a Haij app on a copy of the Makker foundation                                  |           |
| [0002](0002-tenancy-rls.md)                               | Multi-tenancy enforced with RLS and two runtime roles                                       |           |
| [0003](0003-audit-logging.md)                             | Trigger-based, append-only audit log                                                        |           |
| [0004](0004-admission-by-invitation.md)                   | Admission by application and invitation                                                     |           |
| [0005](0005-demo-workspaces.md)                           | A demo workspace per visitor                                                                |           |
| [0006](0006-workspace-chosen-models.md)                   | A workspace can choose its own model                                                        |           |
| [0007](0007-design-scale-and-tokens.md)                   | A named small-text scale, and the last hard-coded values become tokens                      |           |
| [0008](0008-ai-reads-on-their-own-route.md)               | An AI read is a route, not an action                                                        |           |
| [0009](0009-ai-installation-roof.md)                      | The installation's own roof over the AI                                                     |           |
| [0010](0010-an-initiative-and-one-backlog.md)             | An initiative of three kinds, and one backlog in one order                                  |           |
| [0011](0011-the-quarter-and-its-capacity.md)              | A quarter is named by its first day; its plan is set against free capacity                  |           |
| [0012](0012-scores-propose-people-order.md)               | The scores propose an order; people decide it                                               | → 0010    |
| [0013](0013-who-may-do-what.md)                           | Members describe and report; managers decide                                                |           |
| [0014](0014-the-roadmap-planned-and-expected.md)          | The roadmap shows planned quarters from the plans and expected quarters after               | → 0011    |
| [0015](0015-ai-proposals-for-initiatives-and-quarters.md) | Two AI proposals — a sharper description and a breakdown — nothing written without a person | → 0008    |
