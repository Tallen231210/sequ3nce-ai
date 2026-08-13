#!/bin/bash
# Re-run the setter snapshot and diff it against the baseline.
#
# The whole point of phase 1 is that the two live teams' numbers do not move.
# Anything that differs here is a regression until proven otherwise.
#
# JordanWelch is deliberately excluded — the company is inactive, and two of its
# queries already fail on Convex's 32k-document limit (scanEvents). That ceiling
# is a real finding for the new engine, but it is not a live-customer concern
# and it would only add noise to this diff.
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
BASE="$SP/baseline"
NEW="$SP/after"

bash "$SP/snapshot_setter.sh" "$NEW" > /dev/null 2>&1

# Some queries take no range and derive their own from the current time, then
# echo it back (getSetterScorecard does this). That envelope moves every run and
# would drown out a real regression. Normalise ONLY those two echoed keys —
# never a measured value — so the comparison is about the numbers we compute.
norm() {
  sed -E 's/"(rangeStart|rangeEnd)": [0-9]+/"\1": <normalised>/' "$1"
}

# IMPORTANT: even the pinned-range queries drift slowly.
#
# Observed 2026-08-13: RemoteStack's 90-day lead total fell 4831 -> 4830 with no
# code change that could touch lead data. Enrichment corrects a lead's dateAdded
# after the fact (it initially stores sync-time rather than the CRM's real
# created date), so a lead can move OUT of a fixed historical window days later.
#
# Observed again the same day: RemoteStack's 90-day bookingCount fell 1059 ->
# 1058, taking connectionsToBookingsRate, medianTimeToBookMs and the pre-call
# qualification counts with it. Bookings are derived from calendarEvents, and a
# cancelled or rescheduled meeting genuinely leaves the window. So getOverview
# is PARTLY live-state even over a pinned range — the lead and dial figures are
# settled history, the booking-derived ones follow the customer's real calendar.
#
# And a third class, observed 2026-08-13: avgSpeedMs moved with no code that
# could touch it. Speed-to-lead over a HISTORICAL window is not settled either —
# a lead that arrived three weeks ago and gets its first dial today enters the
# calculation for the first time, changing the average for a window that has
# already closed. Anything derived from "time until first contact" keeps moving
# until every lead in the window has been contacted or abandoned.
#
# So a one-or-two-row delta on counts is the data being corrected, not a
# regression. A structural change — a rate moving materially, a field
# disappearing, a count moving by percent rather than by ones — is not. Judge
# the magnitude; do not re-baseline reflexively, or this harness becomes a
# rubber stamp.
#
# These queries measure the present, not the past, so they move on their own:
#
#   getSetterScorecard          60-day window anchored to now — observed
#                               2.7477 -> 2.7504 across two runs 3 min apart
#   getPipelineStageDistribution current pipeline state — observed a lead move
#                               stage between runs (26->25, 27->28, total conserved)
#   getConnectRateAnomaly       compares this week against a baseline
#
# Real business activity, not non-determinism, so they are reported for
# inspection rather than failing the run. Everything else reads a pinned
# historical range and must be exactly identical.
DRIFTY_LIST="getSetterScorecard getPipelineStageDistribution getConnectRateAnomaly"

is_drifty() { case " $DRIFTY_LIST " in *" $1 "*) return 0;; *) return 1;; esac; }

FAIL=0
for TEAM in remotestack createfreedom; do
  echo "=== $TEAM ==="
  for F in "$BASE/${TEAM}__"*.json; do
    Q=$(basename "$F" .json)
    if [ ! -f "$NEW/$Q.json" ]; then
      echo "  MISSING   ${Q#*__}"
      FAIL=1
      continue
    fi
    SHORT="${Q#*__}"
    if diff -q <(norm "$F") <(norm "$NEW/$Q.json") > /dev/null 2>&1; then
      printf "  same      %s\n" "$SHORT"
    elif is_drifty "$SHORT"; then
      printf "  drifted   %s (now-relative window — inspect, don't fail)\n" "$SHORT"
      diff <(norm "$F") <(norm "$NEW/$Q.json") | grep -c "^[<>]" | sed 's/^/            differing lines: /'
    else
      printf "  CHANGED   %s\n" "$SHORT"
      diff <(norm "$F") <(norm "$NEW/$Q.json") | head -12 | sed 's/^/            /'
      FAIL=1
    fi
  done
done

echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS — every historical number identical; any drift above is live-state only"
else
  echo "FAIL — something moved; justify every line above before continuing"
fi
exit $FAIL
