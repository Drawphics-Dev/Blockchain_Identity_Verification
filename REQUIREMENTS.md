# Original Client Requirements

> Verbatim brief provided by the client. This is the source-of-truth for scope.
> The implementation plan derived from it lives in [IMPLEMENTATION.md](IMPLEMENTATION.md).
> **Note:** two referenced images — the *architecture diagram* and the *conceptual
> framework diagram* — were NOT included as image files and remain unseen. They should
> be added here when available and the plan re-checked against them.

---

I am seeking a blockchain developer to work on a prototype for my project.

The prototype is a proposal aimed at increasing University student portal security,
where I am proposing that a blockchain-based Identity verification for Zero Trust
access to university student portals to curb insecurity challenges such as **student
credential compromise, adulteration of student data, prevention of lateral movement**, etc.

## Objectives
1. To develop a **blockchain-enhanced identity verification model** that supports
   **continuous user verification** and **immutable audit trails** for **Zero Trust
   access control** in university student portals.
2. To **evaluate the effectiveness** of the proposed model based on **access control
   effectiveness, attack resistance, continuous validation, and log integrity**.

*(The proposed model Architectural diagram was referenced here — image not provided.)*

## Technology
The proposed blockchain-based identity verification model will be implemented using
**Hyperledger Fabric** — preferred because it is a permissioned blockchain, processes
transactions faster, and has better privacy controls than public platforms such as Ethereum.

The prototype will be developed using Hyperledger Fabric pulled from a **Docker Desktop**
container; **Node.js** for application logic; **PostgreSQL** for the database; **React JS**
for the front end; and simulated in a **virtual Ubuntu server** environment.

The student portal will simulate common university activities: **login, unit registration,
fee statement access, and examination result access**.
*(Client note: "This is what I wrote on my proposal but you can propose what will work
better and faster for this scenario.")*

## Security scenarios to be evaluated
1. Genuine user login.
2. Invalid credential login attempt.
3. Credential stealing and imitation attack.
4. Log tampering trial.
5. Abnormal user behavior needing continuous verification.

## Evaluation metrics
**(a) Access control effectiveness** — decision accuracy using True Acceptance Rate (TAR),
False Accept Rate (FAR), and False Reject Rate (FRR). A low FAR means stronger security.

**(b) Attack resistance rate** — percentage of attacks successfully blocked:

    Attack Resistance = (Blocked Attacks / Total Attacks) * 100

**(c) Continuous validation effectiveness** — time taken to detect an anomaly and the
percentage of sessions terminated after risk detection.

**(d) Audit integrity score** — percentage of detected tampering attempts.

## Formulas (as specified)
    False Accept Rate (FAR) = Unauthorized access granted / Total unauthorized requests
    True Accept Rate  (TAR) = Legitimate Access Granted  / Total Legitimate Requests
    Attack Resistance       = (Blocked Attacks / Total Attack Attempts) * 100
    Audit Integrity         = Detected Tampering Attempts / Total Tampering Attempts

## Additional asks
- Help put together the **calculations for the metrics** and the **tools** to use.
- **Deploy the model for showcasing.**
- State **how long it will take (number of hours)**.
- The prototype should focus on **demonstrating the proposed security model for research
  purposes**. Build a **complete demo of the student portal from scratch** including login,
  dashboard, course registration, fee statement, results, etc.

*(The proposed model Conceptual framework diagram was referenced here — image not provided.)*
