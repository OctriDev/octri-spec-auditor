from octri_auditor import _json as exact_json
import sys
from octri_auditor import Auditor

auditor = Auditor(sys.argv[1])
envelope = exact_json.loads(sys.stdin.read())
action = envelope.get("action")
if envelope.get("abiVersion") != 1 or action not in ("audit", "fix", "bundle", "compare", "export", "rules"):
    result = auditor.call(envelope)
elif action in ("audit", "fix", "bundle"):
    result = {"Ok": getattr(auditor, action)(envelope["request"])}
elif action == "compare":
    result = {"Ok": auditor.compare(envelope["before"], envelope["after"])}
elif action == "export":
    result = {"Ok": auditor.export(envelope["report"], envelope["format"])}
else:
    result = {"Ok": auditor.rules()}
print(exact_json.dumps(result))
