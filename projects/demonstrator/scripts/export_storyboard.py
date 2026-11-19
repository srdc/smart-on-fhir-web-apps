"""
Export the WP7 storyboard to the demonstrator app (src/assets/storyboard), from the sources of the storyboard document:

  - fhir-path-feature-extraction/storyboard_patients: storyboard_patients.xlsx (patients and their story),
    baseline/<id>-bundle.json (FHIR transactions), baseline/storyboard-model-output.json (risks and SHAP values)
  - Documents/WP7/Storyboards/_build/content.py: the generic steps of the storyboard

    python export_storyboard.py              # STAGE folder: three levels above smart-apps, or STAGE_ROOT

Run it after the storyboard patients or the document text change (README of storyboard_patients, update cycle), and
commit the exported files.
"""
import json, os, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent
STAGE_ROOT = Path(os.environ.get("STAGE_ROOT", APP.parents[2]))   # <STAGE>/smart-apps/projects/demonstrator
SB = STAGE_ROOT / "fhir-path-feature-extraction" / "storyboard_patients"
DOC = STAGE_ROOT / "Documents" / "WP7" / "Storyboards" / "_build"
OUT = APP / "src" / "assets" / "storyboard"

sys.path.insert(0, str(SB)); sys.path.insert(0, str(SB.parent / "generators_v3")); sys.path.insert(0, str(DOC))
import openpyxl
import generate_stage_wp6_v3 as G
from load_patients import load_patients
import content as C

wb = openpyxl.load_workbook(SB.parent / "fhir-feature-mapping-v3.xlsx")
features = {str(r["UKBB Code"]): r for r in G.parse_features(wb["Features"]) if r.get("Include") == "yes"}
patients = load_patients(SB / "storyboard_patients.xlsx", features)
baseline = json.load(open(SB / "baseline" / "storyboard-patients.json", encoding="utf-8"))
model = json.load(open(SB / "baseline" / "storyboard-model-output.json", encoding="utf-8"))
ages = {p["id"]: p.get("age") for p in baseline["patients"]}

# the generic steps of the document (content.GENERIC_STEPS), keyed for the app (which screen shows each step)
STEP_KEYS = ["patient-reported", "login", "patient-selection", "summary", "form", "diseases", "results",
             "interventions", "plan"]
assert len(C.GENERIC_STEPS) == len(STEP_KEYS), "GENERIC_STEPS changed: update STEP_KEYS"
# what the visitor does in each step and whether they may go on without doing it (actions, canSkip) are written in
# storyboard.json itself, not in the document: kept from the current file
try:
    current = {s["key"]: s for s in json.load(open(OUT / "storyboard.json", encoding="utf-8"))["steps"]}
except FileNotFoundError:
    current = {}
steps = [{"key": key, "title": s[0], "actionDescription": s[1], "system": s[2],
          "actor": s[4] if len(s) > 4 else "Clinician",
          "actions": current.get(key, {}).get("actions", []), "canSkip": current.get(key, {}).get("canSkip", True)}
         for key, s in zip(STEP_KEYS, C.GENERIC_STEPS)]


def model_inputs():
    """The inputs of the deployed WP6 models (shap-client), per stratum: the union of the features selected for the
    diseases, with the number of disease models using each"""
    root = STAGE_ROOT / "shap-client" / "data" / "models"
    meta_file = next(iter(sorted(root.glob("*/metadata.json"), reverse=True)), None)
    if not meta_file:
        print("! no shap-client models: the model inputs are not exported")
        return None
    meta = json.load(open(meta_file, encoding="utf-8"))
    selection = meta_file.parent / meta["artifact_roots"]["feature_selection"]
    # the inputs the STAGE feature extraction produces (outputName of the model feature set); the others are always
    # missing (imputed by the models)
    produced = set()

    def walk(o):
        if isinstance(o, dict):
            if "outputName" in o:
                produced.add(o["outputName"])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(json.load(open(SB.parent / "generators_v3" / "generated_output" / "featureset" / "stage-wp6-model-features.json",
                        encoding="utf-8")))
    strata = {}
    for stratum in meta["strata"]:
        masks = json.load(open(selection / stratum / "feature_masks.json", encoding="utf-8"))
        counts = {}
        for features in masks.values():
            for f in features:
                counts[f] = counts.get(f, 0) + 1
        strata[stratum] = [{"feature": f, "diseases": n,
                            "produced": f in produced or f.split("__")[0] in produced or f.endswith("_missing")}
                           for f, n in sorted(counts.items(), key=lambda x: (-x[1], x[0]))]
    return {"version": meta.get("model_version"), "featureSelection": meta["artifact_roots"]["feature_selection"],
            "strata": strata}


out = {
    "anchor": baseline["anchor"],
    "title": C.TITLE,
    "summary": C.PUBLIC_SUMMARY,
    "modelText": C.MODEL_TEXT,
    "steps": steps,
    "patients": [{
        "id": p["id"], "given": p["given"], "family": p["surname"], "gender": p["gender"], "birthDate": p["birthDate"],
        "age": ages.get(p["id"]), "stratum": p["stratum"], "headline": p["headline"], "background": p["background"],
        "visitReason": p["visit_reason"], "summary": p["summary"], "selectionNote": p["selection_note"],
        "resultsNote": p["results_note"], "focus": p["focus"], "deselect": p["deselect"],
        "interventions": [{"measure": m, "goal": g} for m, g in p["interventions"]],
        "findings": [{"measure": m, "value": v, "interpretation": i} for m, v, i in p["findings"]],
    } for p in patients],
    "model": model,
    "modelInputs": model_inputs(),
}

(OUT / "bundles").mkdir(parents=True, exist_ok=True)
json.dump(out, open(OUT / "storyboard.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for p in patients:
    bundle = json.load(open(SB / "baseline" / f"{p['id']}-bundle.json", encoding="utf-8"))
    json.dump(bundle, open(OUT / "bundles" / f"{p['id']}.json", "w", encoding="utf-8"), ensure_ascii=False,
              separators=(",", ":"))
print(f"{len(patients)} patients, {len(steps)} steps -> {OUT}")
