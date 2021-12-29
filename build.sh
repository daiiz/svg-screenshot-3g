#!/bin/sh
set -eu

closure-compiler --js index.js --js_output_file out/bookmarklet.js

head="javascript:(function(){"
tail="})()"

body=$(cat out/bookmarklet.js)

echo "${head}${body}${tail}" > out/bookmarklet.js

