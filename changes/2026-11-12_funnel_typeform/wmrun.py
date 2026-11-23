# Run a bun preview job on Windmill (beforest-automations) and print the result. Usage: python3 wmrun.py code.ts [args.json]
import json,sys,os,urllib.request
r=json.loads(open(os.path.expanduser("~/.config/windmill/remotes.ndjson")).readline())
code=open(sys.argv[1]).read(); args=json.load(open(sys.argv[2])) if len(sys.argv)>2 else {}
req=urllib.request.Request(r["remote"].rstrip("/")+f"/api/w/{r['workspaceId']}/jobs/run_wait_result/preview",
  data=json.dumps({"content":code,"language":"bun","args":args}).encode(),headers={"Authorization":"Bearer "+r["token"],"Content-Type":"application/json"})
try: print(urllib.request.urlopen(req,timeout=600).read().decode())
except urllib.error.HTTPError as e: print("HTTP",e.code,e.read().decode()[:2000]); sys.exit(1)
