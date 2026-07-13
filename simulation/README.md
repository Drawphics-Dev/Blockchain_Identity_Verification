# Security scenarios & attack simulation — ROADMAP Phase 8

The five required scenarios, scripted as repeatable runs that emit labelled outcomes
for the metrics engine (`evaluation/`):

1. Genuine user login → ALLOW (feeds TAR, FRR)
2. Invalid credential login → DENY at auth (feeds FAR, Attack resistance)
3. Credential stealing & imitation → STEP_UP then DENY (feeds FAR, Attack resistance)
4. Log tampering trial → integrity verifier flags mismatch (feeds Audit integrity)
5. Abnormal behaviour / continuous verification → mid-session TERMINATE (feeds Continuous validation)

Not yet implemented — built in Phase 8 after the backend (Phase 6).
