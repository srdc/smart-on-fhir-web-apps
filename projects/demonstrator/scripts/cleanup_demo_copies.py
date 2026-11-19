"""
Delete the patient copies of the storyboard demonstrator (Python standard library only).

The demonstrator copies a storyboard patient for each visitor (src/app/demo-patient.service.ts): every copied resource has
the tag http://stage-healthyaging.eu/fhir/CodeSystem/demonstrator|demo-copy, the Patient also the identifier
http://stage-healthyaging.eu/fhir/demonstrator-session|<session>. What the visitor then saves with the apps (risk
questionnaire, results, care plan, goals, measurements) references the copy. This script deletes the copies older than
the given age with everything that references them.

    python cleanup_demo_copies.py https://kroniq.srdc.com.tr/stage-fhir --token <access token>
    python cleanup_demo_copies.py <base> --token-url <onAuth>/token --client-id <id> --client-secret <secret>
    python cleanup_demo_copies.py <base> --older-than-hours 0 --dry-run        # list all copies, delete nothing

Run it daily (cron) with a client that may delete in the repository (client credentials, e.g. system/*.*).
"""
import argparse, base64, datetime, json, sys, urllib.error, urllib.parse, urllib.request

TAG = "http://stage-healthyaging.eu/fhir/CodeSystem/demonstrator|demo-copy"
SESSION_SYSTEM = "http://stage-healthyaging.eu/fhir/demonstrator-session"
# (resource type, search parameter referencing the patient), as storyboard_patients/reset_patients.py
TYPES = [
    ("CarePlan", "subject"), ("Goal", "subject"), ("QuestionnaireResponse", "subject"), ("Observation", "subject"),
    ("Condition", "subject"), ("MedicationStatement", "subject"), ("MedicationRequest", "subject"),
    ("Encounter", "subject"), ("FamilyMemberHistory", "patient"), ("AllergyIntolerance", "patient"),
    ("Procedure", "subject"), ("DiagnosticReport", "subject"), ("Immunization", "patient"),
    ("ServiceRequest", "subject"), ("DocumentReference", "subject"), ("Composition", "subject"),
    ("Communication", "subject"), ("Task", "for"), ("RiskAssessment", "subject"),
]


def call(method, url, token=None):
    headers = {"Accept": "application/fhir+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
            return r.status, (json.loads(data) if data else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def client_credentials(token_url, client_id, secret, scope, aud):
    body = urllib.parse.urlencode({"grant_type": "client_credentials", "scope": scope, "aud": aud}).encode()
    auth = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    req = urllib.request.Request(token_url, data=body, method="POST", headers={
        "Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["access_token"]


def search_all(url, token):
    """All resources of a search, following the next links"""
    out = []
    while url:
        status, bundle = call("GET", url, token)
        if status != 200 or not isinstance(bundle, dict):
            if status not in (400, 404):
                print(f"  ! GET {url}: {status} {bundle}")
            break
        out += [e["resource"] for e in bundle.get("entry", []) if "resource" in e]
        url = next((l["url"] for l in bundle.get("link", []) if l.get("relation") == "next"), None)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("base", help="FHIR base URL")
    ap.add_argument("--older-than-hours", type=float, default=24)
    ap.add_argument("--token", help="access token")
    ap.add_argument("--token-url", help="token endpoint, for client credentials")
    ap.add_argument("--client-id")
    ap.add_argument("--client-secret")
    ap.add_argument("--scope", default="system/*.*", help="scope of the client credentials token (default system/*.*)")
    ap.add_argument("--aud", default="fhir-repo", help="audience of the token (default fhir-repo)")
    ap.add_argument("--dry-run", action="store_true", help="list the copies, delete nothing")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    token = a.token or (client_credentials(a.token_url, a.client_id, a.client_secret, a.scope, a.aud)
                        if a.token_url and a.client_id else None)

    before = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=a.older_than_hours)
    query = urllib.parse.urlencode({"_tag": TAG, "_lastUpdated": "lt" + before.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                    "_count": 200})
    patients = [p for p in search_all(f"{base}/Patient?{query}", token) if p.get("resourceType") == "Patient"]
    print(f"{len(patients)} demonstrator copies last updated before {before:%Y-%m-%d %H:%M} UTC")

    failed = 0
    for p in patients:
        session = next((i.get("value") for i in p.get("identifier", []) if i.get("system") == SESSION_SYSTEM), "?")
        name = " ".join(p.get("name", [{}])[0].get("given", []) + [p.get("name", [{}])[0].get("family", "")])
        refs = []
        for rtype, param in TYPES:
            q = urllib.parse.urlencode({param: f"Patient/{p['id']}", "_count": 200, "_elements": "id"})
            refs += [(rtype, r["id"]) for r in search_all(f"{base}/{rtype}?{q}", token) if r.get("resourceType") == rtype]
        refs = list(dict.fromkeys(refs)) + [("Patient", p["id"])]
        print(f"- Patient/{p['id']} ({name}, session {session}, updated {p.get('meta', {}).get('lastUpdated')}): "
              f"{len(refs)} resources")
        if a.dry_run:
            continue
        for rtype, rid in refs:
            status, msg = call("DELETE", f"{base}/{rtype}/{rid}", token)
            if status not in (200, 202, 204, 404, 410):
                failed += 1
                print(f"  ! DELETE {rtype}/{rid}: {status} {msg}")
    if failed:
        sys.exit(f"{failed} deletions failed")


if __name__ == "__main__":
    main()
