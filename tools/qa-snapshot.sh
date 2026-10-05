#!/bin/sh
# Freeze a copy of the working tree for QA (immune to concurrent edits/HMR) and serve it on :5199.
set -e
SNAP=scratch/qa
mkdir -p $SNAP
rm -rf $SNAP/src $SNAP/public; cp -r src public index.html vite.config.ts tsconfig.json package.json $SNAP/
ln -sfn "$(pwd)/node_modules" $SNAP/node_modules
pkill -f "vite --port 5199" || true
(cd $SNAP && nohup npx vite --port 5199 --strictPort > ../qa-vite.log 2>&1 &)
sleep 3
echo "QA snapshot serving at http://localhost:5199/"
