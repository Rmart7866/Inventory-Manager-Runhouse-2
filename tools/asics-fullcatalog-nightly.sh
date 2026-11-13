#!/bin/zsh
# asics-fullcatalog-nightly.sh, The Run House.
#
# Run by launchd every night (tools/launchd/com.therunhouse.asics-fullcatalog.plist,
# the name kept so the installed schedule needs no change).
#
# IT RUNS THE B2B LINK LIST, NOT THE FULL CATALOG, since 2026-11-13. The full
# catalog made one stock call per style, 1,283 styles, and ASICS locked the
# account after about 1,000 of them ("Too Many Attempts", a five hour lock that
# would also have refused staff). The link list is what staff run by hand: the
# 47 pages in the Firestore list, read off the rendered grid, about 50 lookups
# a night. Quantities above 30 read as 30 (the known page cap); the two print
# on demand singlets still read the uncapped API, two calls.
#
# It leaves asics-headless-<stamp>.csv in ~/Downloads, a verdict in the log,
# and uploads the file to the inventory tool (PASS or BLOCKED). It WRITES
# NOTHING TO SHOPIFY: a person still presses Write.
#
# The full catalog is still there by hand, for a one-off new product hunt:
#   node tools/asics-headless-run.mjs --full-catalog
#
# Log: ~/Library/Logs/runhouse-asics-fullcatalog.log (appended, one block a night)
# If the log says SESSION EXPIRED: node tools/asics-headless-run.mjs --setup
#
# House style: no em dashes.
REPO="${RUNHOUSE_REPO:-$HOME/Inventory-Manager-Runhouse-2}"
NODE="${RUNHOUSE_NODE:-$HOME/.nvm/versions/node/v22.20.0/bin/node}"
cd "$REPO" || { echo "no repo at $REPO"; exit 1; }
echo
echo "===== $(date '+%Y-%m-%d %H:%M:%S') ASICS link list ====="
"$NODE" tools/asics-headless-run.mjs
code=$?
echo "===== exit $code at $(date '+%H:%M:%S') ====="
exit $code
