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
