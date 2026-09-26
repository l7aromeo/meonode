---
'@meonode/ui': patch
---

Keep each request's server-compiled CSS rules to that request.

Server-compiled rules were queued in one process-wide list and flushed by
whichever render drained it next. A rule could land in a different request's
HTML, leaving the page that used it unstyled, and two requests rendering at the
same time could each take part of the other's rules. Each render now carries its
own rules with the elements that use them, so no request depends on another to
deliver them.
