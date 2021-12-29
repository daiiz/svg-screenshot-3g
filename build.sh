#!/bin/sh
set -eu

closure-compiler --js index.js --js_output_file bookmarklet.js

head="javascript:(function(){"
tail="})()"

body=$(cat bookmarklet.js)

echo "${head}${body}${tail}" > bookmarklet.js

