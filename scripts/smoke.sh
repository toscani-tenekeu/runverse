#!/bin/bash
# Run hello-world in every installed language plus a few edge cases.
# Usage: ./scripts/smoke.sh [base-url]   (default http://localhost:8080)
set -uo pipefail
BASE=${1:-http://localhost:8080}
fail=0
check() { # name, json body, python expression over the result `r`
  local out
  sleep 2 # stay under the default 30 runs/minute rate limit
  out=$(curl -s "$BASE/api/run" -H 'content-type: application/json' -d "$2")
  if python3 -c "import json,sys; r=json.loads(sys.argv[1]); sys.exit(0 if ($3) else 1)" "$out" 2>/dev/null; then
    echo "✓ $1"
  else
    echo "✗ $1: $out"; fail=1
  fi
}

# Every language's own starter template must print "Hello".
for row in $(curl -s "$BASE/api/languages" | python3 -c "
import json,sys,base64
for l in json.load(sys.stdin):
    if l['installed']:
        body=json.dumps({'language':l['id'],'files':[{'name':l['file'],'content':l['template']}]})
        print(base64.b64encode(body.encode()).decode())"); do
  body=$(echo "$row" | base64 -d)
  check "$(echo "$body" | python3 -c 'import json,sys;print(json.load(sys.stdin)["language"])')" "$body" "'Hello' in r['run']['stdout']"
done

check "python stdin" '{"language":"python","files":[{"name":"main.py","content":"print(input()[::-1])"}],"stdin":"abc"}' "r['run']['stdout']=='cba\n'"
check "python multi-file" '{"language":"python","files":[{"name":"main.py","content":"from util import f\nprint(f())"},{"name":"util.py","content":"def f(): return 42"}]}' "r['run']['stdout']=='42\n'"
check "c header" '{"language":"c","files":[{"name":"main.c","content":"#include <stdio.h>\n#include \"util.h\"\nint main(){printf(\"%d\\n\",twice(21));}"},{"name":"util.h","content":"static int twice(int x){return 2*x;}"}]}' "r['run']['stdout']=='42\n'"
check "c compile error" '{"language":"c","files":[{"name":"main.c","content":"int main(){ return x; }"}]}' "r['compile']['code']!=0 and 'main.c:' in r['compile']['stderr'] and '.c.c' not in r['compile']['stderr']"
check "time limit" '{"language":"python","files":[{"name":"main.py","content":"while True: pass"}]}' "r['run']['signal']=='SIGKILL'"

exit $fail
