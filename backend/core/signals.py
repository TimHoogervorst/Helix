"""Custom signals for cross-mod communication.

Signals defined here invert dependencies between mods: instead of a
source mod importing from a target mod, the source mod sends a signal
and the target mod connects a receiver in its AppConfig.ready().
"""

from django.dispatch import Signal

#: Sent by ELN's ``sync_entry_content`` pipeline when content should be
#: synchronised.  Receivers receive ``entry`` and ``content`` as keyword
#: arguments and may return a (possibly modified) content dict.  The
#: pipeline collects the last non-None response from each receiver.
entry_content_sync = Signal()
