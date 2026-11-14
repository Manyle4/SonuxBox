#!/bin/bash
# Smoke test for the SonuxBox API: every jukebox image in both modes, plus the error replies.
#   tools/test_api.sh                       (tests the Heroku app)
#   tools/test_api.sh http://localhost:8080 (tests a local server)
API=${1:-https://sonuxbox-api-285f8ea04b1d.herokuapp.com}
cd "$(dirname "$0")/../frontend/public/samples" || exit 1
fail=0

check() { # name, expected status, curl args...
  local name=$1 want=$2; shift 2
  local got
  got=$(curl -s -o /tmp/sonux_test.json -w "%{http_code}" "$@")
  if [ "$got" = "$want" ]; then printf "  ok    %s\n" "$name"
  else printf "  FAIL  %s (got %s, wanted %s): %s\n" "$name" "$got" "$want" "$(head -c 200 /tmp/sonux_test.json)"; fail=1; fi
}

echo "API: $API"
check "health" 200 "$API/api/health"

echo "Every sample, both modes:"
for f in *.jpg; do
  for mode in adaptive terrain; do
    check "${f%.jpg} ($mode)" 200 -F "image=@$f" -F "mode=$mode" -F crop=0 "$API/api/analyze"
    # A good result has notes, a melody and 32 columns.
    python3 -c 'import json,sys; d=json.load(open("/tmp/sonux_test.json")); assert d["columns"]==32 and any(n["voice"]=="melody" for n in d["notes"])' 2>/dev/null \
      || { echo "        ^ result is missing notes or columns"; fail=1; }
  done
done

echo "Errors:"
check "bad mode" 400 -F "image=@co.jpg" "$API/api/analyze?mode=jazz"
check "bad crop" 400 -F "image=@co.jpg" -F crop=0.9 "$API/api/analyze"
check "wrong form field" 400 -F "file=@co.jpg" "$API/api/analyze"
check "empty body" 400 -X POST "$API/api/analyze"
check "not an image" 400 --data-binary "hello" "$API/api/analyze"
check "unknown route" 404 "$API/nope"

[ $fail = 0 ] && echo "All good." || echo "Some checks failed."
exit $fail
