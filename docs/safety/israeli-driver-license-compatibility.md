# Israeli heavy-vehicle licence compatibility — operational rules

**Status:** reference guidance only; not an automated legal eligibility decision.  
**Reviewed:** 18 November 2026.  
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

## Regulatory update — 15 November 2026

A Ministry of Transport press release dated 9 November 2026 announced amendments to Regulations 180 and 181. A contemporaneous report states that the amendment was published in Official Gazette regulations file 12573, page 408, on 15 November 2026 and took effect on publication. The press release is an official source for the policy announcement; the report is secondary evidence for the Gazette publication details. The Gazette instrument itself must be obtained and checked before encoding these exceptions as executable rules.

The announced changes include:
- **B / zero-emission commercial vehicle:** a driver holding B for at least two years may qualify for a commercial zero-emission vehicle above 3,500 kg and up to 4,250 kg only under the precise regulatory conditions. The vehicle's additional permitted weight must derive solely from the difference in propulsion-system weight versus an otherwise identical combustion vehicle; permitted payload must not exceed the comparable vehicle; and the Licensing Authority must approve and record the B entitlement on the vehicle licence. An electric powertrain or a gross weight under 4,250 kg alone is not enough.
- **B / armoured vehicles:** separate exceptions apply to qualifying Home Front Command-approved local security-team vehicles and certain armoured vehicles owned by the Police, government ministries or their subordinate units. Registration wording, approvals, ownership and passenger limits are material.
- **C1:** the announced amendment extends C1 to private motor vehicles above 3,500 kg and up to 12,000 kg, except private buses. It does not remove the need to identify the vehicle's legal registration classification.
- **C1 trailer rule:** the published consolidated wording available for review states a permitted trailer up to 3,500 kg for qualifying C1 vehicles. The exact amended Gazette wording and combination rules still require verification.
- **C+E:** the category covers qualifying commercial/work vehicles above 3,500 kg with a trailer or semi-trailer; exceptional equipment still requires the applicable Licensing Authority permit.

Sources:
- Ministry of Transport announcement: https://www.gov.il/he/pages/news-9-11
- Ministry's licence-category page: https://www.gov.il/he/pages/driving_licence_categories
- Government driving-licence-ranks dataset: https://data.gov.il/he/datasets/ministry_of_transport/driving_license_ranks/c680ada6-9af1-47ab-9acf-d6585df6ad47
- Secondary report identifying Gazette file 12573, page 408 and publication date: https://www.news1.co.il/Archive/001-D-526331-00.html

**Implementation status:** none of the 15 November exceptions is currently auto-approved by TruckSafe. The current schema cannot prove B's two-year tenure, zero-emission classification, comparable combustion-vehicle payload, Licensing Authority approval, armoured-vehicle status/ownership/approval, or the trailer's individual permitted gross weight. Keep these cases at manual review until the official Gazette text and authoritative vehicle/driver evidence are available.

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
