#!/bin/bash
# Baseline snapshot of every setter-data read query, for all live teams.
#
# Captures exactly what the dashboard sees, via the same public queries the UI
# calls. Re-run after the engine lands: every file must be byte-identical.
#
# Usage: snapshot_setter.sh <output-dir>
set -u
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web
OUT="${1:?output dir required}"
mkdir -p "$OUT"

# Fixed range so the snapshot is reproducible: 90 days ending at a pinned
# instant. A moving "now" would make before/after differ for reasons that have
# nothing to do with our changes.
RANGE_END=1786608000000          # 2026-08-13T00:00:00Z
RANGE_START=$((RANGE_END - 90*86400000))

TEAMS="js728xjb1vdxcfcsxcwme62eh589977x:user_3HElK5ZNCDtkuUOBOqew8KalDBs:remotestack
js7d3bx3hpwcmfgrxmsa6yx6td8bgagr:user_3HElJwXrhPiEeBo0DrMu96uCbf1:createfreedom
js7130cyq6q21d5rt16910p0q580p2dy:user_39LfPwKQxIprGCxCqrR85lf5fBX:jordanwelch"

RANGED="getOverview getLeads getCadence getShowRateEvidence getBestTimeToCallHeatmap getLeadAgeDecayCurve"
PLAIN="getReps getSetterScorecard getPipelineStageDistribution getConnectRateAnomaly getMySettings"

for ROW in $TEAMS; do
  CLERK=$(echo "$ROW" | cut -d: -f2)
  NAME=$(echo "$ROW" | cut -d: -f3)
  echo "=== $NAME ==="

  for Q in $RANGED; do
    printf "  %-28s" "$Q"
    npx convex run --prod "setterData:$Q" \
      "{\"clerkId\":\"$CLERK\",\"rangeStart\":$RANGE_START,\"rangeEnd\":$RANGE_END}" \
      > "$OUT/${NAME}__${Q}.json" 2>"$OUT/${NAME}__${Q}.err"
    if [ -s "$OUT/${NAME}__${Q}.json" ]; then
      echo "ok  ($(wc -c < "$OUT/${NAME}__${Q}.json" | tr -d ' ') bytes)"
    else
      echo "EMPTY -> $(head -c 90 "$OUT/${NAME}__${Q}.err" | tr '\n' ' ')"
    fi
  done

  for Q in $PLAIN; do
    printf "  %-28s" "$Q"
    npx convex run --prod "setterData:$Q" "{\"clerkId\":\"$CLERK\"}" \
      > "$OUT/${NAME}__${Q}.json" 2>"$OUT/${NAME}__${Q}.err"
    if [ -s "$OUT/${NAME}__${Q}.json" ]; then
      echo "ok  ($(wc -c < "$OUT/${NAME}__${Q}.json" | tr -d ' ') bytes)"
    else
      echo "EMPTY -> $(head -c 90 "$OUT/${NAME}__${Q}.err" | tr '\n' ' ')"
    fi
  done
done
