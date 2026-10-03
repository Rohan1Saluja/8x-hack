"""Processing-only stderr logger: retain original frames, never exception payloads."""

import logging
import traceback


class ProcessingFormatter(logging.Formatter):
    def formatException(self, exc_info):
        # SDK/DB exception strings can contain URLs, credentials or meeting content.
        # Walk the original chain without formatting messages, locals or source text.
        lines, seen = [], set()

        def render(exc):
            if id(exc) in seen:
                return
            seen.add(id(exc))
            cause = exc.__cause__
            context = exc.__context__ if not exc.__suppress_context__ else None
            if cause or context:
                render(cause if cause is not None else context)
                lines.append("The above exception preceded the following exception:\n")
            lines.append("Traceback (most recent call last):\n")
            for frame, lineno in traceback.walk_tb(exc.__traceback__):
                code = frame.f_code
                lines.append(f'  File "{code.co_filename}", line {lineno}, in {code.co_name}\n')
            cls = type(exc)
            lines.append(f"{cls.__module__}.{cls.__name__}: [exception message withheld]\n")

        render(exc_info[1])
        return "".join(lines).rstrip()


logger = logging.getLogger(__name__)
handler = logging.StreamHandler()
handler.setFormatter(ProcessingFormatter("%(levelname)s %(name)s %(message)s"))
logger.addHandler(handler)
logger.setLevel(logging.WARNING)
# Do not let ancestor handlers print the unsanitized exception or a duplicate trace.
logger.propagate = False
