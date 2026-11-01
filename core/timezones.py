"""
Time zone names. They are case-sensitive on Linux (the servers) but not on Windows, so
'Asia/kolkata' typed on a form works on a laptop and fails in production. Names are stored
the way the time zone database spells them.
"""
import logging
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

logger = logging.getLogger(__name__)

# Orders before the day close count toward the previous day, so it is an early-morning time;
# an evening time (the closing time) would date the whole day's orders to yesterday
DAY_CLOSE_HELP = ('Use an early-morning time such as 04:00: orders before it count toward the previous day. '
                  'This is not the closing time.')


@lru_cache(maxsize=1)
def _names():
    return {name.lower(): name for name in available_timezones()}


def canonical_timezone(name):
    """'asia/kolkata' -> 'Asia/Kolkata'; None when there is no such time zone."""
    text = (name or '').strip()
    if not text:
        return None
    names = _names()
    if names:
        return names.get(text.lower())
    try:  # no list of names on this machine: ask for it directly
        ZoneInfo(text)
        return text
    except (ZoneInfoNotFoundError, ValueError):
        return None


def zone(name):
    """ZoneInfo for a stored name, forgiving its spelling; UTC (logged) when it is unknown."""
    canonical = canonical_timezone(name)
    if canonical is None:
        if name:
            logger.error('Unknown time zone %r, using UTC', name)
        return ZoneInfo('UTC')
    return ZoneInfo(canonical)
