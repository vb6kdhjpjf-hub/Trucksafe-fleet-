# Israeli heavy-vehicle licence compatibility — operational rules

**Status:** reference guidance only; not an automated legal eligibility decision.  
**Reviewed:** 11 November 2026.  
**Primary source:** Israel Ministry of Transport, “Driving licence categories”, updated 27 May 2026:
- https://www.gov.il/he/pages/driving_licence_categories
- https://data.gov.il/he/datasets/ministry_of_transport/driving_license_ranks/c680ada6-9af1-47ab-9acf-d6585df6ad47

## Relevant categories

| Category | Official scope relevant to fleet vehicles |
|---|---|
| C1 | Commercial/work vehicle with permitted gross weight above 3,500 kg and up to 12,000 kg. The Ministry notes a historical exception for certain C1/03 licences issued by 31 December 2006, allowing up to 14,999 kg in Israel. |
| C | C1 vehicles and commercial/work vehicles with permitted gross weight above 12,000 kg. A trailer may be attached up to 3,500 kg permitted gross weight, subject to the licence conditions. |
| C+E | Commercial/work vehicle above 3,500 kg with a trailer or semi-trailer, including the combinations described in the regulations. |

The Ministry's category page and dataset are the source of truth. In case of conflict, applicable law and the actual licence record prevail.

## Why TruckSafe must not auto-approve from the current fields

The current driver profile stores a free-text `license_class` and expiry date, but does not reliably capture:
- the original issue date / historical entitlement needed to assess the legacy C1 exception;
- an authoritative, verified licence-category record and any individual restrictions;
- the permitted gross weight of the attached trailer/semi-trailer and the exact vehicle combination;
- special permits, endorsements, restrictions, or temporary suspensions.

Vehicle `gross_weight_kg` and `trailer_count` alone are not sufficient to prove legal compatibility. A trailer count does not establish its permitted gross weight or the combination's legal status.

## Current product behaviour

- Assignment selectors only show active drivers with a valid, non-expired licence expiry date.
- Save-time checks prevent a stale or ineligible driver assignment.
- The UI explicitly tells fleet staff to verify licence class separately.
- No licence-class-to-vehicle compatibility decision is currently automated. This is intentional until authoritative licence and vehicle-combination data are available.

## Requirements before automation

1. Capture and verify the actual licence categories and restrictions from a trusted source or reviewed document.
2. Capture original issue date / grandfathered entitlement where relevant.
3. Capture vehicle permitted gross weight and trailer/semi-trailer permitted gross weight, including combination data.
4. Model special permits and restrictions with effective dates.
5. Add a versioned ruleset with effective date, source reference, test cases for boundary values, and a manual-review outcome when data is missing or ambiguous.
6. Keep the assignment blocked or flagged for human review when eligibility cannot be established. Never interpret missing data as approval.
