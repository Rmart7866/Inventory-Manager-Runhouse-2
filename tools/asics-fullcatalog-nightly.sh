#!/bin/zsh
# asics-fullcatalog-nightly.sh, The Run House.
#
# Run by launchd every night (tools/launchd/com.therunhouse.asics-fullcatalog.plist,
# the name kept so the installed schedule needs no change).
#
# IT RUNS THE B2B LINK LIST, FROM THE DATA FEED (--link-api), since 2026-11-14.
#
# Not the full catalog (2026-11-13): one stock call per style, 1,283 styles,
# and ASICS locked the account after about 1,000 ("Too Many Attempts").
# Not the page scrape (2026-11-14 1 AM): ASICS keeps two logins, one for the
# web page and one for its data, and the PAGE login lapsed overnight while the
# data login was alive, so every product page loaded with an empty grid and
# all 47 links failed. --link-api reads the same 47 styles straight from the
# data: about 48 calls, 5 minutes, real numbers instead of the 30 cap, sizes
# ASICS does not offer written as 0 exactly as the page shows them, the two
# print on demand singlets at Warehouse. It checks the data login first and
# stops in seconds when it is gone or locked out.
#
# It leaves asics-linkapi-<stamp>.csv in ~/Downloads, a verdict in the log,
# and uploads the file to the inventory tool (PASS or BLOCKED). It WRITES
# NOTHING TO SHOPIFY: a person still presses Write.
#
# The page scrape is still there by hand: node tools/asics-headless-run.mjs
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
echo "===== $(date '+%Y-%m-%d %H:%M:%S') ASICS link list (data feed) ====="
"$NODE" tools/asics-headless-run.mjs --link-api
code=$?
echo "===== exit $code at $(date '+%H:%M:%S') ====="
exit $code
