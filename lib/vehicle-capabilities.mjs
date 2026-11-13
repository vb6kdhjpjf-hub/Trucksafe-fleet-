/** Vehicle body catalogue; classification is not routing/legal certification. */
export const VEHICLE_BODY_TYPES = Object.freeze([
{ id:"rigid_truck",label:"משאית ארגז / משא",family:"truck",crane:false },
{ id:"tractor_unit",label:"ראש גורר",family:"tractor",crane:false },
{ id:"semi_trailer",label:"סמי־טריילר",family:"trailer",crane:false },
{ id:"full_trailer",label:"משאית עם גרור",family:"truck",crane:false },
{ id:"articulated_crane",label:"משאית מנוף זרוע מפרקית",family:"truck",crane:true },
{ id:"telescopic_crane",label:"משאית מנוף טלסקופי",family:"truck",crane:true },
{ id:"loader_crane",label:"משאית מנוף העמסה",family:"truck",crane:true },
{ id:"heavy_lift_crane",label:"משאית מנוף כבד / הרמות",family:"truck",crane:true },
{ id:"mobile_crane",label:"עגורן נייד על שלדת משאית",family:"truck",crane:true },
{ id:"aerial_platform",label:"משאית סל / במת הרמה",family:"truck",crane:true },
{ id:"recovery_crane",label:"רכב חילוץ וגרירה עם מנוף",family:"truck",crane:true },
{ id:"concrete_mixer",label:"מערבל בטון",family:"truck",crane:false },
{ id:"concrete_pump",label:"משאבת בטון",family:"truck",crane:true },
{ id:"tipper",label:"משאית רכינה",family:"truck",crane:false },
{ id:"tanker",label:"מכלית",family:"truck",crane:false },
{ id:"refrigerated",label:"משאית קירור",family:"truck",crane:false },
{ id:"car_carrier",label:"מובילית",family:"truck",crane:false },
{ id:"low_loader",label:"מוביל חריג / low-loader",family:"trailer",crane:false },
{ id:"other_special",label:"רכב כבד מיוחד – אחר",family:"truck",crane:false }
]);
const ids = new Set(VEHICLE_BODY_TYPES.map(x=>x.id));
export const isSupportedVehicleBodyType = value => typeof value==="string" && ids.has(value);
export const getVehicleBodyType = value => VEHICLE_BODY_TYPES.find(x=>x.id===value) || null;
/** Fail-closed evidence gate. Passing this gate alone never authorizes a route. */
export function assessSpecialVehicleEquipment({bodyType,equipmentDimensionsVerified=false,registrationVerified=false,axleConfigurationVerified=false,liftingChartVerified=false,operatingEnvelopeVerified=false}={}) {
 const type=getVehicleBodyType(bodyType);
 if(!type) return {supported:false,readyForRouting:false,reason:"unknown_vehicle_body_type",missing:["vehicle_body_type"]};
 const missing=[];
 if(!registrationVerified) missing.push("registration");
 if(!equipmentDimensionsVerified) missing.push("travel_configuration_dimensions");
 if(!axleConfigurationVerified) missing.push("axle_configuration");
 if(type.crane){if(!liftingChartVerified) missing.push("manufacturer_lifting_chart");if(!operatingEnvelopeVerified) missing.push("travel_vs_working_configuration");}
 return {supported:true,readyForRouting:missing.length===0,bodyType:type.id,family:type.family,requiresCraneEvidence:type.crane,missing};
}

/** Fail-closed routing eligibility for special bodies; this is not legal certification. */
export function assessVehicleSpecialRouting({ vehicle, equipment }) {
 const type=getVehicleBodyType(vehicle?.body_type);
 if(!type)return {ready:false,reason:"vehicle_body_type_missing_or_unsupported"};
 const requiresEvidence=type.crane||type.id==="other_special";
 if(!requiresEvidence)return {ready:true,bodyType:type.id,dimensions:null};
 if(!equipment||equipment.vehicle_id!==vehicle.id||equipment.fleet_id!==vehicle.fleet_id)return {ready:false,reason:"special_equipment_profile_missing"};
 if(equipment.evidence_status!=="verified"||!equipment.evidence_verified_at||!equipment.evidence_verified_by)return {ready:false,reason:"special_equipment_evidence_not_verified"};
 const expectedKind=type.id==="aerial_platform"?"aerial_platform":type.id==="concrete_pump"?"concrete_pump":type.id==="other_special"?"other_special":"crane";
 if(equipment.equipment_kind!==expectedKind)return {ready:false,reason:"special_equipment_kind_mismatch"};
 const dimensions={heightCm:Number(equipment.travel_height_cm),widthCm:Number(equipment.travel_width_cm),lengthCm:Number(equipment.travel_length_cm)};
 if(!inRange(dimensions.heightCm,100,600)||!inRange(dimensions.widthCm,100,350)||!inRange(dimensions.lengthCm,200,3000)||typeof equipment.axle_configuration!=="string"||equipment.axle_configuration.trim().length<2)return {ready:false,reason:"special_equipment_configuration_incomplete"};
 if(type.crane){
  const prefix=`${vehicle.fleet_id}/${vehicle.id}/`;
  if(typeof equipment.lifting_chart_document_path!=="string"||!equipment.lifting_chart_document_path.startsWith(prefix))return {ready:false,reason:"lifting_chart_document_missing_or_misbound"};
  if(!inRange(Number(equipment.working_height_cm),100,10000)||!inRange(Number(equipment.max_outreach_cm),0,100000)||!inRange(Number(equipment.max_lifting_capacity_kg),1,1000000))return {ready:false,reason:"special_equipment_configuration_incomplete"};
 }
 return {ready:true,bodyType:type.id,dimensions};
}
