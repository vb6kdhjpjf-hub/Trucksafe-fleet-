# Ministry of Transport GIS Catalogue Review — Israel

Review date: 2026-11-11
Status: source discovery only; **not approved for truck-routing decisions**

## Official catalogue lead

The Ministry of Transport's official GIS information catalogue page lists:
- "קטלוג שכבות ממ"ג" (GIS layers catalogue), originally published 9 September 2026 and updated 11 November 2026.
- "הנחיות לכתיבת מפרט שכבות ממ"ג" (guidelines for writing GIS layer specifications), published 11 November 2026.

Official listing: https://www.gov.il/he/collectors/informationtype?officeId=48eaee91-0c97-4ef3-b364-50ae52e3b56f

The public listing is discoverable, but the catalogue's underlying attachment/content was not retrievable during this review. Therefore this review does not claim that a national bridge, clearance, truck-weight or restriction layer is available in it.

## What the accessible official GIS specification says

The Ministry's published road-safety infrastructure specification describes a data model for:
- Road safety elements, including pedestrian crossings, medians and speed bumps.
- Junction boundaries.

Official specification page: https://www.gov.il/he/pages/30_12_2025
PDF: https://www.gov.il/BlobFolder/generalpage/30_12_2025/he/%D7%9E%D7%A4%D7%A8%D7%98%20%D7%A9%D7%9B%D7%91%D7%95%D7%AA%20%D7%94%D7%A1%D7%93%D7%A8%D7%99%20%D7%91%D7%AA%D7%A9%D7%AA%D7%99%D7%AA%20%D7%93%D7%A8%D7%9B%D7%99%D7%9D%202.pdf

This is a standardisation/specification for GIS infrastructure and safety layers. It is not itself a live operational bridge-clearance or truck-restriction register. The document's stated layer list does not establish lane-specific measured bridge clearance, gross/axle weight limits, truck dimensions, temporary closures or current time restrictions.

## GIS portal operating caveat

The Ministry's GIS portal states that its information is assembled from infrastructure companies, ministries, government/local authorities and private companies; update frequency varies by layer, and the information is not legally binding.

Portal: https://geo.mot.gov.il/

A layer's presence in the portal therefore cannot be interpreted as a current legally authoritative restriction unless the responsible source owner supplies the underlying evidence, validity, update process and permitted use.

## Assessment and next action

1. Record the catalogue as a high-value discovery lead, not as an acquired dataset.
2. Obtain the catalogue attachment and inspect each layer's owner, spatial coverage, schema, update timestamp, metadata, licence and service endpoint before classifying any layer.
3. Specifically search for bridge inventory, vertical clearance, road load limits, width/length limits, temporary restrictions and traffic-order records.
4. Require written confirmation from the competent road owner/traffic authority for any candidate layer that could influence truck routing.
5. Keep all candidate data out of production routing. No missing feature may be interpreted as a verified clear road.

## Verification boundary

This review used public official page metadata and the accessible published specification. The catalogue attachment itself was not inspected. No dataset was downloaded or imported, no authority was contacted, no database was changed, no provider was called, no routing flag was enabled, and no deployment or merge was performed.
