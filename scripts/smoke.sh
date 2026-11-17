#!/bin/bash
# Run hello-world in every installed language and framework, plus a few edge cases.
# Usage: ./scripts/smoke.sh [base-url]   (default http://localhost:8085)
set -uo pipefail
BASE=${1:-http://localhost:8085}
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

# Every language's own starter template must print "Hello"; every backend framework's
# starter project must answer its home page.
for row in $(curl -s "$BASE/api/languages" | python3 -c "
import json,sys,base64
for l in json.load(sys.stdin):
    if l['installed'] and l['version']:  # skip what runs in the browser (web, frontend frameworks)
        files=l['files'] if l['group']=='framework' else [{'name':l['file'],'content':l['template']}]
        body=json.dumps({'language':l['id'],'files':files})
        print(l['group']+':'+base64.b64encode(body.encode()).decode())"); do
  group=${row%%:*}
  body=$(echo "${row#*:}" | base64 -d)
  name=$(echo "$body" | python3 -c 'import json,sys;print(json.load(sys.stdin)["language"])')
  if [ "$group" = framework ]; then
    check "$name" "$body" "r['response'] and r['response']['status']==200"
  else
    check "$name" "$body" "'Hello' in r['run']['stdout']"
  fi
done

check "python stdin" '{"language":"python","files":[{"name":"main.py","content":"print(input()[::-1])"}],"stdin":"abc"}' "r['run']['stdout']=='cba\n'"
check "python multi-file" '{"language":"python","files":[{"name":"main.py","content":"from util import f\nprint(f())"},{"name":"util.py","content":"def f(): return 42"}]}' "r['run']['stdout']=='42\n'"
check "c header" '{"language":"c","files":[{"name":"main.c","content":"#include <stdio.h>\n#include \"util.h\"\nint main(){printf(\"%d\\n\",twice(21));}"},{"name":"util.h","content":"static int twice(int x){return 2*x;}"}]}' "r['run']['stdout']=='42\n'"
check "c compile error" '{"language":"c","files":[{"name":"main.c","content":"int main(){ return x; }"}]}' "r['compile']['code']!=0 and 'main.c:' in r['compile']['stderr'] and '.c.c' not in r['compile']['stderr']"
check "time limit" '{"language":"python","files":[{"name":"main.py","content":"while True: pass"}]}' "r['run']['signal']=='SIGKILL'"

exit $fail
