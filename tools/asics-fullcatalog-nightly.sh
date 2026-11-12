#!/bin/zsh
# asics-fullcatalog-nightly.sh, The Run House.
#
# Run by launchd every night (tools/launchd/com.therunhouse.asics-fullcatalog.plist).
# Sweeps the whole ASICS catalog, shoes and apparel, with the headless runner
# and leaves asics-fullcatalog-<stamp>.csv in ~/Downloads with a verdict in the
# log. It WRITES NOTHING TO SHOPIFY: a person still decides whether to import.
#
# Log: ~/Library/Logs/runhouse-asics-fullcatalog.log (appended, one block a night)
#
# If the log says SESSION EXPIRED, the dedicated profile needs a login:
#   node tools/asics-headless-run.mjs --setup
#
# House style: no em dashes.
REPO="${RUNHOUSE_REPO:-$HOME/Inventory-Manager-Runhouse-2}"
NODE="${RUNHOUSE_NODE:-$HOME/.nvm/versions/node/v22.20.0/bin/node}"
cd "$REPO" || { echo "no repo at $REPO"; exit 1; }
echo
echo "===== $(date '+%Y-%m-%d %H:%M:%S') ASICS full catalog ====="
"$NODE" tools/asics-headless-run.mjs --full-catalog
code=$?
echo "===== exit $code at $(date '+%H:%M:%S') ====="
exit $code
